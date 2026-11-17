package store

import (
	"conan-studio/internal/models"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
)

// setupRealProject builds a temp workspace from a copy of the real
// korvath-the-barbarian project.json and ep02 manifest.
func setupRealProject(t *testing.T) (*Store, string) {
	t.Helper()
	root := t.TempDir()
	proj := filepath.Join(root, "projects", "korvath-the-barbarian")
	epDir := filepath.Join(proj, "episodes", "ep02")
	if err := os.MkdirAll(filepath.Join(epDir, "audio"), 0755); err != nil {
		t.Fatal(err)
	}
	for src, dst := range map[string]string{
		"testdata/project.json":       filepath.Join(proj, "project.json"),
		"testdata/ep02_manifest.json": filepath.Join(epDir, "manifest.json"),
	} {
		b, err := os.ReadFile(src)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(dst, b, 0644); err != nil {
			t.Fatal(err)
		}
	}
	for i := 1; i <= 20; i++ {
		name := filepath.Join(epDir, "audio", "p"+twoDigits(i)+"_mixed.wav")
		_ = os.WriteFile(name, []byte(strings.Repeat("x", 2048)), 0644)
	}
	return NewStore(root), root
}

func twoDigits(n int) string {
	if n < 10 {
		return "0" + string(rune('0'+n))
	}
	return string(rune('0'+n/10)) + string(rune('0'+n%10))
}

func collectKeys(v interface{}, prefix string, out map[string]bool) {
	switch x := v.(type) {
	case map[string]interface{}:
		for k, val := range x {
			out[prefix+"."+k] = true
			collectKeys(val, prefix+"."+k, out)
		}
	case []interface{}:
		for _, val := range x {
			collectKeys(val, prefix+"[]", out)
		}
	}
}

// The Go structs must not silently drop any field present in real manifests,
// otherwise every save (and every clone) would lose data.
func TestRealManifestRoundTripKeepsAllFields(t *testing.T) {
	raw, err := os.ReadFile("testdata/ep02_manifest.json")
	if err != nil {
		t.Fatal(err)
	}
	var before interface{}
	_ = json.Unmarshal(raw, &before)
	var ep models.EpisodeManifest
	if err := json.Unmarshal(raw, &ep); err != nil {
		t.Fatal(err)
	}
	again, _ := json.Marshal(ep)
	var after interface{}
	_ = json.Unmarshal(again, &after)

	kb, ka := map[string]bool{}, map[string]bool{}
	collectKeys(before, "", kb)
	collectKeys(after, "", ka)
	var missing []string
	for k := range kb {
		if !ka[k] {
			missing = append(missing, k)
		}
	}
	sort.Strings(missing)
	if len(missing) > 0 {
		t.Fatalf("round trip drops fields: %v", missing)
	}
}

func TestCloneEpisodeForEngine(t *testing.T) {
	s, root := setupRealProject(t)
	src, err := s.GetEpisode("korvath-the-barbarian", "ep02")
	if err != nil {
		t.Fatal(err)
	}
	srcRaw, _ := os.ReadFile(filepath.Join(root, "projects/korvath-the-barbarian/episodes/ep02/manifest.json"))

	clone, err := s.CloneEpisodeForEngine("korvath-the-barbarian", "ep02", "grok-imagine-image-2-0")
	if err != nil {
		t.Fatal(err)
	}

	if clone.EpisodeID != "ep02-grok" {
		t.Fatalf("episode id = %q", clone.EpisodeID)
	}
	if clone.ImageEngine != "grok-imagine-image-2-0" || !strings.Contains(clone.Title, "Grok") {
		t.Fatalf("engine/title not set: %q %q", clone.ImageEngine, clone.Title)
	}
	if clone.EpisodeNumber != src.EpisodeNumber || len(clone.Panels) != len(src.Panels) {
		t.Fatal("episode number or panel count changed")
	}
	for i, p := range clone.Panels {
		sp := src.Panels[i]
		if p.Prompt != sp.Prompt || p.Caption != sp.Caption || !reflect.DeepEqual(p.Dialogue, sp.Dialogue) {
			t.Fatalf("panel %d script content changed", p.PanelID)
		}
		if p.ImageStatus != "PENDING" || p.ImagePath != "" || len(p.Candidates) != 0 || p.ImageEngine != "grok-imagine-image-2-0" {
			t.Fatalf("panel %d not reset for re-render: %+v", p.PanelID, p)
		}
		if sp.AudioPath != "" && !strings.Contains(p.AudioPath, "/episodes/ep02-grok/audio/") {
			t.Fatalf("panel %d audio path not moved: %q", p.PanelID, p.AudioPath)
		}
		if sp.AudioPath != "" {
			if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(p.AudioPath))); err != nil {
				t.Fatalf("panel %d audio file not copied: %v", p.PanelID, err)
			}
		}
	}
	for _, g := range clone.Gates {
		want := map[string]string{"SCRIPT_GATE": "APPROVED", "VISUAL_QA_GATE": "PENDING", "AUDIO_QA_GATE": "LOCKED"}[g.ID]
		if want != "" && g.Status != want {
			t.Fatalf("gate %s = %s, want %s", g.ID, g.Status, want)
		}
	}

	// Source episode untouched.
	srcAfter, _ := os.ReadFile(filepath.Join(root, "projects/korvath-the-barbarian/episodes/ep02/manifest.json"))
	if string(srcAfter) != string(srcRaw) {
		t.Fatal("source manifest was modified")
	}

	// Project lists the clone right after its source, and it loads.
	all, err := s.ListProjectsWithEpisodes()
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(all[0].Project.Episodes, ","); got != "ep01,ep02,ep02-grok" {
		t.Fatalf("episodes = %s", got)
	}

	// A second Grok render gets its own ID; a new normal episode is still ep03.
	again, err := s.CloneEpisodeForEngine("korvath-the-barbarian", "ep02", "grok-imagine-image-2-0")
	if err != nil || again.EpisodeID != "ep02-grok-2" {
		t.Fatalf("second clone: %v %v", again, err)
	}
	next, err := s.CreateEpisode("korvath-the-barbarian", "New", "", "", 4)
	if err != nil || next.EpisodeID != "ep03" {
		t.Fatalf("new episode after clones = %v (%v), want ep03", next, err)
	}
}

func TestCloneRejectsUnknownEngineAndUnapprovedScript(t *testing.T) {
	s, root := setupRealProject(t)
	if _, err := s.CloneEpisodeForEngine("korvath-the-barbarian", "ep02", "grok-cdp"); err == nil {
		t.Fatal("unknown engine should be rejected")
	}
	path := filepath.Join(root, "projects/korvath-the-barbarian/episodes/ep02/manifest.json")
	if _, err := s.UpdateEpisode("korvath-the-barbarian", "ep02", func(ep *models.EpisodeManifest) error {
		for i := range ep.Gates {
			if ep.Gates[i].ID == "SCRIPT_GATE" {
				ep.Gates[i].Status = "AWAITING_APPROVAL"
			}
		}
		return nil
	}); err != nil {
		t.Fatal(err, path)
	}
	if _, err := s.CloneEpisodeForEngine("korvath-the-barbarian", "ep02", "meta-muse-image"); err == nil {
		t.Fatal("clone of unapproved script should be rejected")
	}
}
