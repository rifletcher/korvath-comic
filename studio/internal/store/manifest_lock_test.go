package store

import (
	"conan-studio/internal/models"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func writeTestManifest(t *testing.T, root string) string {
	t.Helper()
	dir := filepath.Join(root, "projects", "p", "episodes", "ep01")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	ep := models.EpisodeManifest{ProjectID: "p", EpisodeID: "ep01", Title: "orig",
		Panels: []models.Panel{{PanelID: 1, ImageStatus: "PENDING"}}}
	b, _ := json.Marshal(ep)
	path := filepath.Join(dir, "manifest.json")
	if err := os.WriteFile(path, b, 0644); err != nil {
		t.Fatal(err)
	}
	return path
}

// A lock held by a Node worker must make the Go store wait, and the Go update
// must then apply on top of whatever the worker wrote (no lost update).
func TestUpdateEpisodeWaitsForNodeLockAndRereads(t *testing.T) {
	root := t.TempDir()
	path := writeTestManifest(t, root)
	s := NewStore(root)

	lock := path + ".lock"
	if err := os.WriteFile(lock, []byte("12345"), 0644); err != nil {
		t.Fatal(err)
	}

	done := make(chan struct{})
	go func() {
		_, err := s.UpdateEpisode("p", "ep01", func(ep *models.EpisodeManifest) error {
			ep.Panels[0].ImageStatus = "QUEUED"
			return nil
		})
		if err != nil {
			t.Error(err)
		}
		close(done)
	}()

	select {
	case <-done:
		t.Fatal("UpdateEpisode did not wait for the worker's lock")
	case <-time.After(200 * time.Millisecond):
	}

	// The "worker" writes its own change, then releases the lock.
	var ep models.EpisodeManifest
	b, _ := os.ReadFile(path)
	_ = json.Unmarshal(b, &ep)
	ep.Title = "worker-change"
	b, _ = json.Marshal(ep)
	_ = os.WriteFile(path, b, 0644)
	_ = os.Remove(lock)

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("UpdateEpisode never acquired the lock")
	}

	got, err := s.GetEpisode("p", "ep01")
	if err != nil {
		t.Fatal(err)
	}
	if got.Title != "worker-change" || got.Panels[0].ImageStatus != "QUEUED" {
		t.Fatalf("lost update: title=%q status=%q", got.Title, got.Panels[0].ImageStatus)
	}
	if _, err := os.Stat(lock); !os.IsNotExist(err) {
		t.Fatal("lock file was not released")
	}
}

func TestStaleLockIsBroken(t *testing.T) {
	root := t.TempDir()
	path := writeTestManifest(t, root)
	lock := path + ".lock"
	_ = os.WriteFile(lock, []byte("999"), 0644)
	old := time.Now().Add(-time.Minute)
	_ = os.Chtimes(lock, old, old)

	s := NewStore(root)
	if _, err := s.UpdateEpisode("p", "ep01", func(ep *models.EpisodeManifest) error { return nil }); err != nil {
		t.Fatalf("stale lock should be broken: %v", err)
	}
}
