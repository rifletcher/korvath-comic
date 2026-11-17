package store

import (
	"conan-studio/internal/models"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// Fields written by the Node workers must survive every Go-side save.
func TestGoSavesKeepFieldsWrittenByWorkers(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "projects", "p", "episodes", "ep01")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	manifest := `{
	  "projectId": "p", "episodeId": "ep01", "title": "T",
	  "audioDirectorLog": [{"feedback": "angrier", "revoicedPanels": [2]}],
	  "outputs": {"masterVideoPath": "v.mp4", "youtubeVideoId": "abc123", "youtubeUrl": "https://youtu.be/abc123",
	              "youtubePrivacy": "unlisted", "thumbnailPath": "t.jpg", "thumbnailPanelId": 9},
	  "stages": [{"id": "VOICE_SYNTHESIS", "status": "COMPLETED", "workerNote": "x"}],
	  "gates": [{"id": "AUDIO_QA_GATE", "status": "APPROVED", "approvedBy": "Rob"}],
	  "panels": [{
	    "panelId": 9, "caption": "c", "imageStatus": "VERIFIED", "audioStatus": "VERIFIED",
	    "captionDirection": {"stability": 0.3, "style": 0.7},
	    "audioClips": [{"speaker": "Korvath", "actorName": "Brian", "engineUsed": "ElevenLabs"}],
	    "audioError": "", "audioDirectorNotes": "more anger", "lastDirectorPlan": "plan",
	    "dialogue": [{"speaker": "Korvath", "text": "By the Iron Pits!", "audioDirection": {"stability": 0.2, "style": 0.85}}],
	    "candidates": [{"id": "c1", "engine": "meta", "seed": 42}]
	  }]
	}`
	path := filepath.Join(dir, "manifest.json")
	if err := os.WriteFile(path, []byte(manifest), 0644); err != nil {
		t.Fatal(err)
	}

	s := NewStore(root)
	if _, err := s.UpdateEpisode("p", "ep01", func(ep *models.EpisodeManifest) error {
		ep.Gates[0].Status = "AWAITING_APPROVAL" // an ordinary Go-side change
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	ep, _ := s.GetEpisode("p", "ep01")
	if err := s.SaveEpisode(ep); err != nil {
		t.Fatal(err)
	}

	var got map[string]interface{}
	b, _ := os.ReadFile(path)
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatal(err)
	}
	out := got["outputs"].(map[string]interface{})
	panel := got["panels"].([]interface{})[0].(map[string]interface{})
	dlg := panel["dialogue"].([]interface{})[0].(map[string]interface{})
	cand := panel["candidates"].([]interface{})[0].(map[string]interface{})
	checks := map[string]bool{
		"outputs.youtubeUrl":        out["youtubeUrl"] == "https://youtu.be/abc123",
		"outputs.youtubeVideoId":    out["youtubeVideoId"] == "abc123",
		"outputs.thumbnailPanelId":  out["thumbnailPanelId"] == float64(9),
		"audioDirectorLog":          got["audioDirectorLog"] != nil,
		"stages[].workerNote":       got["stages"].([]interface{})[0].(map[string]interface{})["workerNote"] == "x",
		"gates[].approvedBy":        got["gates"].([]interface{})[0].(map[string]interface{})["approvedBy"] == "Rob",
		"panel.audioClips":          panel["audioClips"] != nil,
		"panel.captionDirection":    panel["captionDirection"] != nil,
		"panel.audioDirectorNotes":  panel["audioDirectorNotes"] == "more anger",
		"dialogue[].audioDirection": dlg["audioDirection"] != nil && dlg["audioDirection"].(map[string]interface{})["stability"] == 0.2,
		"candidates[].seed":         cand["seed"] == float64(42),
		"Go change applied":         got["gates"].([]interface{})[0].(map[string]interface{})["status"] == "AWAITING_APPROVAL",
	}
	for name, ok := range checks {
		if !ok {
			t.Errorf("lost or wrong after Go save: %s", name)
		}
	}
}

// The real Episode 2 manifest must round-trip byte-for-byte in content.
func TestRealManifestRoundTripIsLossless(t *testing.T) {
	raw, err := os.ReadFile("testdata/ep02_manifest.json")
	if err != nil {
		t.Fatal(err)
	}
	var ep models.EpisodeManifest
	if err := json.Unmarshal(raw, &ep); err != nil {
		t.Fatal(err)
	}
	again, err := json.Marshal(ep)
	if err != nil {
		t.Fatal(err)
	}
	var a, b interface{}
	_ = json.Unmarshal(raw, &a)
	_ = json.Unmarshal(again, &b)
	ja, _ := json.Marshal(a)
	jb, _ := json.Marshal(b)
	if string(ja) != string(jb) {
		t.Fatal("round trip changed the manifest content")
	}
}
