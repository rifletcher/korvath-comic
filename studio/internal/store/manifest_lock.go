package store

import (
	"conan-studio/internal/models"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"
)

// Manifest file locking shared with the Node workers.
//
// tools/workers/comic_cli_worker.js (updateManifestLocked) guards manifest.json
// with "<manifest>.lock", created exclusively and treated as stale after 30s.
// The Go store uses exactly the same protocol so a Go write and a Node write
// can never interleave and silently drop each other's changes.
const (
	manifestLockWait  = 15 * time.Second
	manifestLockStale = 30 * time.Second
	manifestLockPoll  = 40 * time.Millisecond
)

func lockManifestFile(manifestPath string) (func(), error) {
	lockPath := manifestPath + ".lock"
	if err := os.MkdirAll(filepath.Dir(manifestPath), 0755); err != nil {
		return nil, err
	}
	deadline := time.Now().Add(manifestLockWait)
	for {
		f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
		if err == nil {
			_, _ = f.WriteString(strconv.Itoa(os.Getpid()))
			_ = f.Close()
			return func() { _ = os.Remove(lockPath) }, nil
		}
		if !os.IsExist(err) {
			return nil, err
		}
		if fi, statErr := os.Stat(lockPath); statErr == nil && time.Since(fi.ModTime()) > manifestLockStale {
			_ = os.Remove(lockPath)
			continue
		}
		if time.Now().After(deadline) {
			return nil, fmt.Errorf("timed out waiting for manifest lock %s", lockPath)
		}
		time.Sleep(manifestLockPoll)
	}
}

// UpdateEpisode performs an atomic read-modify-write of an episode manifest:
// it takes the in-process mutex and the cross-process file lock, re-reads the
// latest manifest from disk, applies fn, and writes the result. If fn returns
// an error nothing is written.
func (s *Store) UpdateEpisode(projectID, episodeID string, fn func(ep *models.EpisodeManifest) error) (*models.EpisodeManifest, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	epPath := filepath.Join(s.projectsDir(), projectID, "episodes", episodeID, "manifest.json")
	unlock, err := lockManifestFile(epPath)
	if err != nil {
		return nil, err
	}
	defer unlock()

	data, err := os.ReadFile(epPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read manifest %s/%s: %w", projectID, episodeID, err)
	}
	var ep models.EpisodeManifest
	if err := json.Unmarshal(data, &ep); err != nil {
		return nil, err
	}
	if ep.TargetPanelCount <= 0 {
		ep.TargetPanelCount = len(ep.Panels)
	}
	s.healEpisodePanels(&ep)

	if err := fn(&ep); err != nil {
		return nil, err
	}
	if err := s.writeEpisodeFile(&ep); err != nil {
		return nil, err
	}
	return &ep, nil
}
