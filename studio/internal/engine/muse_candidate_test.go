package engine

import (
	"strings"
	"testing"
)

func TestMuseCandidateKeepsReferenceSheets(t *testing.T) {
	orch, st, projID, epID := setupTestOrchestrator(t)
	line := `{"type":"panel_candidate_saved","panelId":1,"candidateId":"meta-muse-image-aa11bb22","imagePath":"projects/test-comic/episodes/ep01/panels/candidates/x.webp","hash":"aa11bb22","engine":"meta-muse-image","promptSent":"p","referenceSheets":[{"character":"natari","file":"projects/test-comic/reference/sheets/natari_model_sheet.webp"}],"museWording":["bikini top → armour top"]}`
	orch.applyWorkerEventToManifest(projID, epID, 1, line)
	ep, err := st.GetEpisode(projID, epID)
	if err != nil {
		t.Fatal(err)
	}
	c := ep.Panels[0].Candidates
	if len(c) != 1 {
		t.Fatalf("expected 1 candidate, got %d", len(c))
	}
	if !strings.Contains(string(c[0].Extra["referenceSheets"]), "natari_model_sheet.webp") || !strings.Contains(string(c[0].Extra["museWording"]), "armour top") {
		t.Fatalf("muse fields not kept: %+v", c[0].Extra)
	}
}
