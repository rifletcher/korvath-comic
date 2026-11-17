package engine

import (
	"conan-studio/internal/models"
	"conan-studio/internal/store"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func setupTestOrchestrator(t *testing.T) (*Orchestrator, *store.Store, string, string) {
	t.Helper()
	tmpDir := t.TempDir()
	projID := "test-comic"
	epID := "ep01"
	epDir := filepath.Join(tmpDir, "projects", projID, "episodes", epID)
	if err := os.MkdirAll(epDir, 0755); err != nil {
		t.Fatal(err)
	}

	proj := models.Project{
		ID:                 projID,
		Title:              "Test Comic",
		DefaultImageEngine: "meta-ai-cdp",
	}
	projBytes, _ := json.MarshalIndent(proj, "", "  ")
	if err := os.WriteFile(filepath.Join(tmpDir, "projects", projID, "project.json"), projBytes, 0644); err != nil {
		t.Fatal(err)
	}

	manifest := models.EpisodeManifest{
		ProjectID:        projID,
		EpisodeID:        epID,
		EpisodeNumber:    1,
		Title:            "Issue #1",
		TargetPanelCount: 2,
		CurrentStage:     "VISUAL_RENDERING",
		Stages: []models.Stage{
			{ID: "SCRIPT_GENERATION", Status: "COMPLETED"},
			{ID: "VISUAL_RENDERING", Status: "IN_PROGRESS"},
		},
		Gates: []models.Gate{
			{ID: "SCRIPT_GATE", Status: "APPROVED"},
			{ID: "VISUAL_QA_GATE", Status: "LOCKED"},
		},
		Panels: []models.Panel{
			{PanelID: 1, Name: "Panel 1", ImageStatus: "QUEUED"},
			{PanelID: 2, Name: "Panel 2", ImageStatus: "PENDING"},
		},
	}
	epBytes, _ := json.MarshalIndent(manifest, "", "  ")
	if err := os.WriteFile(filepath.Join(epDir, "manifest.json"), epBytes, 0644); err != nil {
		t.Fatal(err)
	}

	st := store.NewStore(tmpDir)
	orch := NewOrchestrator(st, 1, 1)
	return orch, st, projID, epID
}

func TestWorkerEventsCandidateAndNeedsReview(t *testing.T) {
	orch, st, projID, epID := setupTestOrchestrator(t)

	candLine := `{"type":"panel_candidate_saved","projectId":"test-comic","episodeId":"ep01","panelId":1,"candidateId":"grok-2-abc12345","imagePath":"projects/test-comic/episodes/ep01/panels/candidates/panel_01_grok_abc12345.webp","hash":"abc12345","sizeKB":420.5,"engine":"grok-imagine-image-2-0","promptSent":"test prompt","qaPassed":false,"qaScore":4,"qaSummary":"Wrong weapon","qaFixInstruction":"Use straight broadsword"}`
	orch.applyWorkerEventToManifest(projID, epID, 1, candLine)

	reviewLine := `{"type":"panel_needs_review","projectId":"test-comic","episodeId":"ep01","panelId":1,"engine":"grok-imagine-image-2-0","imagePath":"projects/test-comic/episodes/ep01/panels/panel_01.webp","hash":"abc12345","sizeKB":420.5,"error":"Needs Review (QA 4/10)","qaReport":{"passed":false,"score":4,"summary":"Wrong weapon","fixInstruction":"Use straight broadsword"}}`
	orch.applyWorkerEventToManifest(projID, epID, 1, reviewLine)

	ep, err := st.GetEpisode(projID, epID)
	if err != nil {
		t.Fatal(err)
	}
	p1 := ep.Panels[0]
	if p1.ImageStatus != "NEEDS_REVIEW" {
		t.Fatalf("expected NEEDS_REVIEW, got %s", p1.ImageStatus)
	}
	if len(p1.Candidates) != 1 || p1.Candidates[0].ID != "grok-2-abc12345" {
		t.Fatalf("expected 1 candidate saved, got %+v", p1.Candidates)
	}
	if p1.QaFixInstruction != "Use straight broadsword" {
		t.Fatalf("expected QaFixInstruction preserved, got %q", p1.QaFixInstruction)
	}

	// AcceptPanelReview should promote NEEDS_REVIEW -> VERIFIED
	updated, err := orch.AcceptPanelReview(projID, epID, 1)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Panels[0].ImageStatus != "VERIFIED" {
		t.Fatalf("expected VERIFIED after accept, got %s", updated.Panels[0].ImageStatus)
	}
}

func TestCancelEpisodeQueueResetsQueuedPanels(t *testing.T) {
	orch, st, projID, epID := setupTestOrchestrator(t)

	if _, err := orch.CancelEpisodeQueue(projID, epID); err != nil {
		t.Fatal(err)
	}
	ep, err := st.GetEpisode(projID, epID)
	if err != nil {
		t.Fatal(err)
	}
	if ep.Panels[0].ImageStatus != "PENDING" {
		t.Fatalf("expected cancelled QUEUED panel to reset to PENDING, got %s", ep.Panels[0].ImageStatus)
	}
}

func TestScriptGateFailsClosedWhenAuditScriptMissing(t *testing.T) {
	orch, _, projID, epID := setupTestOrchestrator(t)
	// The temp workspace has no .agents/skills scripts, so the audit cannot run.
	if _, err := orch.ApproveGate(projID, epID, "SCRIPT_GATE", ""); err == nil {
		t.Fatal("expected SCRIPT_GATE approval to be blocked when the audit script is missing")
	}
}

func TestCancelEpisodeQueueKillsRunningRender(t *testing.T) {
	orch, st, projID, epID := setupTestOrchestrator(t)

	// Panel 1 is mid-render.
	if _, err := st.UpdateEpisode(projID, epID, func(ep *models.EpisodeManifest) error {
		ep.Panels[0].ImageStatus = "RENDERING"
		return nil
	}); err != nil {
		t.Fatal(err)
	}

	cmd := exec.Command("sleep", "30")
	if err := cmd.Start(); err != nil {
		t.Skip("sleep not available:", err)
	}
	untrack := orch.trackRenderProc(projID, epID, cmd)
	defer untrack()

	n, err := orch.CancelEpisodeQueue(projID, epID)
	if err != nil {
		t.Fatal(err)
	}
	if n < 1 {
		t.Fatalf("expected the running render to be counted, got %d", n)
	}

	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("render process was not killed")
	}

	ep, _ := st.GetEpisode(projID, epID)
	if ep.Panels[0].ImageStatus != "PENDING" {
		t.Fatalf("panel status = %q, want PENDING after cancel", ep.Panels[0].ImageStatus)
	}
}

func TestAudioGateBlockedWhenPanelsOffCast(t *testing.T) {
	orch, st, projID, epID := setupTestOrchestrator(t)
	root := st.RootDir()
	// Stand-in worker that reports panel 1 as voiced by a fallback voice.
	workerDir := filepath.Join(root, "tools", "workers")
	if err := os.MkdirAll(workerDir, 0755); err != nil {
		t.Fatal(err)
	}
	report := `{"type":"cast_report","episodes":[{"episodeId":"ep01","offCastPanels":[{"panelId":1,"reasons":["made with fallback Edge TTS voices"]}]}]}`
	if err := os.WriteFile(filepath.Join(workerDir, "comic_cli_worker.js"), []byte("console.log(JSON.stringify("+report+"))"), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node not installed")
	}
	if _, err := st.UpdateEpisode(projID, epID, func(ep *models.EpisodeManifest) error {
		for i := range ep.Panels {
			ep.Panels[i].AudioStatus = "VERIFIED"
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	_, err := orch.ApproveGate(projID, epID, "AUDIO_QA_GATE", "")
	if err == nil || !strings.Contains(err.Error(), "not voiced by this comic's cast") {
		t.Fatalf("expected off-cast block, got %v", err)
	}
}

func TestAudioJobsDoNotRunTwiceForTheSameEpisode(t *testing.T) {
	orch, _, projID, epID := setupTestOrchestrator(t)
	release, err := orch.claimAudio(projID, epID, "voice synthesis")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := orch.claimAudio(projID, epID, "panel #3 audio"); err == nil || !strings.Contains(err.Error(), "already running") {
		t.Fatalf("second audio job on the same episode should be refused, got %v", err)
	}
	if r2, err := orch.claimAudio(projID, "ep02", "voice synthesis"); err != nil {
		t.Fatalf("a different episode should not be blocked: %v", err)
	} else {
		r2()
	}
	release()
	release() // idempotent
	if r3, err := orch.claimAudio(projID, epID, "voice synthesis"); err != nil {
		t.Fatalf("after release the episode should be free again: %v", err)
	} else {
		r3()
	}
}
