package store

import (
	"conan-studio/internal/models"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

type Store struct {
	mu      sync.RWMutex
	rootDir string
}

func NewStore(rootDir string) *Store {
	return &Store{rootDir: rootDir}
}

func (s *Store) RootDir() string {
	return s.rootDir
}

func (s *Store) projectsDir() string {
	return filepath.Join(s.rootDir, "projects")
}

func (s *Store) ListProjectsWithEpisodes() ([]models.ProjectWithEpisodes, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	pDir := s.projectsDir()
	entries, err := os.ReadDir(pDir)
	if err != nil {
		return nil, err
	}

	var results []models.ProjectWithEpisodes
	for _, entry := range entries {
		if !entry.IsDir() || entry.Name()[0] == '.' {
			continue
		}
		projPath := filepath.Join(pDir, entry.Name(), "project.json")
		projBytes, err := os.ReadFile(projPath)
		if err != nil {
			continue
		}
		var proj models.Project
		if err := json.Unmarshal(projBytes, &proj); err != nil {
			continue
		}
		if proj.DefaultPanelsPerEpisode <= 0 {
			proj.DefaultPanelsPerEpisode = 20
		}
		if proj.TargetEpisodeCount <= 0 {
			if len(proj.Episodes) > 0 {
				proj.TargetEpisodeCount = len(proj.Episodes)
			} else {
				proj.TargetEpisodeCount = 6
			}
		}

		var episodes []models.EpisodeManifest
		for _, epID := range proj.Episodes {
			epPath := filepath.Join(pDir, entry.Name(), "episodes", epID, "manifest.json")
			epBytes, err := os.ReadFile(epPath)
			if err != nil {
				continue
			}
			var ep models.EpisodeManifest
			if err := json.Unmarshal(epBytes, &ep); err == nil {
				if ep.TargetPanelCount <= 0 {
					if len(ep.Panels) > 0 {
						ep.TargetPanelCount = len(ep.Panels)
					} else {
						ep.TargetPanelCount = proj.DefaultPanelsPerEpisode
					}
				}
				if s.healEpisodePanels(&ep) {
					_ = s.saveEpisodeLocked(&ep)
				}
				episodes = append(episodes, ep)
			}
		}

		sort.SliceStable(episodes, func(i, j int) bool {
			return episodes[i].EpisodeNumber < episodes[j].EpisodeNumber
		})

		results = append(results, models.ProjectWithEpisodes{
			Project:  proj,
			Episodes: episodes,
		})
	}

	return results, nil
}

func (s *Store) GetEpisode(projectID, episodeID string) (*models.EpisodeManifest, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	epPath := filepath.Join(s.projectsDir(), projectID, "episodes", episodeID, "manifest.json")
	epBytes, err := os.ReadFile(epPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read manifest %s/%s: %w", projectID, episodeID, err)
	}
	var ep models.EpisodeManifest
	if err := json.Unmarshal(epBytes, &ep); err != nil {
		return nil, err
	}
	if ep.TargetPanelCount <= 0 {
		ep.TargetPanelCount = len(ep.Panels)
	}
	if s.healEpisodePanels(&ep) {
		_ = s.saveEpisodeLocked(&ep)
	}
	return &ep, nil
}

func (s *Store) healEpisodePanels(ep *models.EpisodeManifest) bool {
	changed := false
	for i := range ep.Panels {
		p := &ep.Panels[i]
		if p.ImageStatus == "VERIFIED" || p.ImageStatus == "RENDERED" {
			targetPath := p.ImagePath
			valid := false
			if targetPath != "" {
				if !filepath.IsAbs(targetPath) {
					targetPath = filepath.Join(s.rootDir, targetPath)
				}
				if fi, err := os.Stat(targetPath); err == nil && fi.Size() > 1024 {
					valid = true
				}
			}
			if !valid {
				p.ImageStatus = "PENDING"
				p.ImagePath = ""
				p.Hash = ""
				p.SizeKB = 0
				changed = true
			}
		}
		// Never promote FAILED, NEEDS_REVIEW, QUEUED, or RENDERING panels to VERIFIED solely because a file exists on disk.
		if (p.ImageStatus == "VERIFIED" || p.ImageStatus == "RENDERED") && p.Error != "" {
			if p.QaNotes != "" {
				p.ImageStatus = "NEEDS_REVIEW"
			} else {
				p.ImageStatus = "FAILED"
			}
			changed = true
		}

		// Also check audio file on disk
		pad := fmt.Sprintf("%02d", p.PanelID)
		audioRel := filepath.Join("projects", ep.ProjectID, "episodes", ep.EpisodeID, "audio", fmt.Sprintf("p%s_mixed.wav", pad))
		audioAbs := filepath.Join(s.rootDir, audioRel)
		if fi, err := os.Stat(audioAbs); err == nil && fi.Size() > 1024 {
			if p.AudioStatus != "VERIFIED" && p.AudioStatus != "READY" {
				p.AudioStatus = "VERIFIED"
				p.AudioPath = filepath.ToSlash(audioRel)
				changed = true
			}
		}
	}

	// Check image rendering stage completion
	allImagesDone := len(ep.Panels) > 0
	for _, p := range ep.Panels {
		if p.ImageStatus != "VERIFIED" && p.ImageStatus != "RENDERED" {
			allImagesDone = false
			break
		}
	}
	if allImagesDone {
		for i := range ep.Stages {
			if ep.Stages[i].ID == "VISUAL_RENDERING" && ep.Stages[i].Status != "COMPLETED" {
				ep.Stages[i].Status = "COMPLETED"
				ep.Stages[i].Progress = 100
				changed = true
			}
		}
		for i := range ep.Gates {
			if ep.Gates[i].ID == "VISUAL_QA_GATE" && ep.Gates[i].Status == "LOCKED" {
				ep.Gates[i].Status = "AWAITING_APPROVAL"
				changed = true
			}
		}
	}

	// Check audio synthesis stage completion
	allAudioDone := len(ep.Panels) > 0
	for _, p := range ep.Panels {
		if p.AudioStatus != "VERIFIED" && p.AudioStatus != "READY" {
			allAudioDone = false
			break
		}
	}
	if allAudioDone {
		for i := range ep.Stages {
			if ep.Stages[i].ID == "VOICE_SYNTHESIS" && ep.Stages[i].Status != "COMPLETED" {
				ep.Stages[i].Status = "COMPLETED"
				ep.Stages[i].Progress = 100
				changed = true
			}
		}
		// If Gate B is already APPROVED, and Gate C is not approved, set Gate C to AWAITING_APPROVAL
		gateBApproved := false
		for _, g := range ep.Gates {
			if g.ID == "VISUAL_QA_GATE" && g.Status == "APPROVED" {
				gateBApproved = true
				break
			}
		}
		if gateBApproved {
			for i := range ep.Gates {
				if ep.Gates[i].ID == "AUDIO_QA_GATE" && (ep.Gates[i].Status == "LOCKED" || ep.Gates[i].Status == "PENDING") {
					ep.Gates[i].Status = "AWAITING_APPROVAL"
					changed = true
				}
			}
		}
	}

	// Check master video completion
	videoRel := filepath.Join("projects", ep.ProjectID, "episodes", ep.EpisodeID, "video", fmt.Sprintf("%s_motion_comic.mp4", ep.EpisodeID))
	videoAbs := filepath.Join(s.rootDir, videoRel)
	if fi, err := os.Stat(videoAbs); err == nil && fi.Size() > 100000 {
		relSlash := filepath.ToSlash(videoRel)
		if ep.Outputs.MasterVideoPath == nil || *ep.Outputs.MasterVideoPath == "" {
			ep.Outputs.MasterVideoPath = &relSlash
			changed = true
		}
		for i := range ep.Stages {
			if (ep.Stages[i].ID == "VIDEO_ASSEMBLY" || ep.Stages[i].ID == "READY_FOR_RELEASE") && ep.Stages[i].Status != "COMPLETED" {
				ep.Stages[i].Status = "COMPLETED"
				ep.Stages[i].Progress = 100
				changed = true
			}
		}
		if ep.CurrentStage != "READY_FOR_RELEASE" {
			ep.CurrentStage = "READY_FOR_RELEASE"
			ep.OverallProgress = 100
			changed = true
		}
	}

	return changed
}

func (s *Store) SaveEpisode(ep *models.EpisodeManifest) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.saveEpisodeLocked(ep)
}

func (s *Store) saveEpisodeLocked(ep *models.EpisodeManifest) error {
	epPath := filepath.Join(s.projectsDir(), ep.ProjectID, "episodes", ep.EpisodeID, "manifest.json")
	unlock, err := lockManifestFile(epPath)
	if err != nil {
		return err
	}
	defer unlock()
	return s.writeEpisodeFile(ep)
}

// writeEpisodeFile writes the manifest atomically (temp file + rename).
// Callers must hold s.mu and the manifest file lock.
func (s *Store) writeEpisodeFile(ep *models.EpisodeManifest) error {
	ep.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	epDir := filepath.Join(s.projectsDir(), ep.ProjectID, "episodes", ep.EpisodeID)
	if err := os.MkdirAll(epDir, 0755); err != nil {
		return err
	}
	epPath := filepath.Join(epDir, "manifest.json")
	data, err := json.MarshalIndent(ep, "", "  ")
	if err != nil {
		return err
	}
	tmpPath := fmt.Sprintf("%s.tmp.%d", epPath, time.Now().UnixNano())
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmpPath, epPath)
}

func buildEpisodeManifest(proj models.Project, epNum int, epID, title, theme string, panelCount int) *models.EpisodeManifest {
	if panelCount <= 0 {
		if proj.DefaultPanelsPerEpisode > 0 {
			panelCount = proj.DefaultPanelsPerEpisode
		} else {
			panelCount = 20
		}
	}

	panels := make([]models.Panel, panelCount)
	for i := 0; i < panelCount; i++ {
		act := "Act I"
		if i >= panelCount*2/3 {
			act = "Act III"
		} else if i >= panelCount/3 {
			act = "Act II"
		}
		panels[i] = models.Panel{
			PanelID:     i + 1,
			Name:        fmt.Sprintf("Beat %d", i+1),
			Act:         act,
			Summary:     fmt.Sprintf("Awaiting Writers' Room generation for Beat %d of %d", i+1, panelCount),
			Caption:     "",
			Dialogue:    []models.DialogueLine{},
			Characters:  []string{},
			Objects:     []string{},
			ShotType:    "Cinematic Graphic Novel Shot",
			Prompt:      fmt.Sprintf("%s, Scene beat %d of %d: %s", proj.ArtStyleAnchor, i+1, panelCount, title),
			ImageStatus: "PENDING",
			AudioStatus: "LOCKED_BY_GATE",
		}
	}

	return &models.EpisodeManifest{
		ProjectID:        proj.ID,
		EpisodeID:        epID,
		EpisodeNumber:    epNum,
		Title:            title,
		Theme:            theme,
		TargetPanelCount: panelCount,
		CurrentStage:     "SCRIPT_GENERATION",
		OverallProgress:  5,
		UpdatedAt:        time.Now().UTC().Format(time.RFC3339),
		Outputs: models.EpisodeOutputs{
			Resolution: fmt.Sprintf("Configured for %d Panels • Awaiting Writers' Room Script", panelCount),
		},
		Stages: []models.Stage{
			{ID: "SCRIPT_GENERATION", Name: "1. Writers Room Script", Status: "PENDING", Progress: 0},
			{ID: "PROMPT_EXPANSION", Name: "2. Latent Anchor & Guardrails", Status: "LOCKED_BY_GATE", Progress: 0},
			{ID: "VISUAL_RENDERING", Name: "3. Meta AI 2K Panel Rendering", Status: "LOCKED_BY_GATE", Progress: 0},
			{ID: "VOICE_SYNTHESIS", Name: "4. Multi-Actor Voice & DSP", Status: "LOCKED_BY_GATE", Progress: 0},
			{ID: "VIDEO_ASSEMBLY", Name: "5. Motion Comic Camera & Concat", Status: "LOCKED_BY_GATE", Progress: 0},
			{ID: "READY_FOR_RELEASE", Name: "6. Master Release Bundle", Status: "LOCKED_BY_GATE", Progress: 0},
		},
		Gates: []models.Gate{
			{ID: "SCRIPT_GATE", Name: "Gate A: Storyboard & Dialogue Lock", AfterStage: "SCRIPT_GENERATION", Status: "LOCKED", Notes: fmt.Sprintf("Awaiting Writers Room generation of %d-panel script.", panelCount)},
			{ID: "VISUAL_QA_GATE", Name: "Gate B: 8-Point Director Visual Continuity Gate", AfterStage: "VISUAL_RENDERING", Status: "LOCKED", Notes: "Locked until panels render."},
			{ID: "AUDIO_QA_GATE", Name: "Gate C: 5-Point Acoustic & Polarity Gate", AfterStage: "VOICE_SYNTHESIS", Status: "LOCKED", Notes: "Locked until Gate B is approved."},
		},
		Panels: panels,
	}
}

func slugify(s string) string {
	re := regexp.MustCompile(`[^a-z0-9]+`)
	slug := re.ReplaceAllString(strings.ToLower(s), "-")
	return strings.Trim(slug, "-")
}

func (s *Store) CreateProject(title, subtitle, genre, artStyleAnchor, defaultImageEngine string, targetEpisodeCount, defaultPanelsPerEpisode int, invariants []string, scaffoldAllEpisodes bool) (*models.ProjectWithEpisodes, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if title == "" {
		return nil, fmt.Errorf("series title is required")
	}
	if targetEpisodeCount <= 0 {
		targetEpisodeCount = 6
	}
	if defaultPanelsPerEpisode <= 0 {
		defaultPanelsPerEpisode = 20
	}
	if defaultImageEngine == "" {
		defaultImageEngine = "meta-ai-cdp"
	}
	if artStyleAnchor == "" {
		artStyleAnchor = "classic vintage 1970s sword-and-sorcery graphic novel comic book panel, Frank Frazetta and John Buscema illustration style, dramatic heavy black ink brushwork, crisp fine cross-hatching, rich cel-shaded digital colors, theatrical chiaroscuro lighting"
	}

	projID := slugify(title)
	projDir := filepath.Join(s.projectsDir(), projID)
	if _, err := os.Stat(projDir); err == nil {
		projID = fmt.Sprintf("%s-%d", projID, time.Now().Unix()%1000)
		projDir = filepath.Join(s.projectsDir(), projID)
	}

	_ = os.MkdirAll(filepath.Join(projDir, "bible"), 0755)
	now := time.Now().UTC().Format(time.RFC3339)

	episodesToCreate := 1
	if scaffoldAllEpisodes {
		episodesToCreate = targetEpisodeCount
	}

	epIDs := make([]string, 0, episodesToCreate)
	for i := 1; i <= episodesToCreate; i++ {
		epIDs = append(epIDs, fmt.Sprintf("ep%02d", i))
	}

	if invariants == nil {
		invariants = []string{}
	}

	proj := models.Project{
		ID:                      projID,
		Title:                   title,
		Subtitle:                subtitle,
		Genre:                   genre,
		ArtStyleAnchor:          artStyleAnchor,
		DefaultImageEngine:      defaultImageEngine,
		DefaultVoiceEngine:      "elevenlabs",
		TargetEpisodeCount:      targetEpisodeCount,
		DefaultPanelsPerEpisode: defaultPanelsPerEpisode,
		CreatedAt:               now,
		UpdatedAt:               now,
		CoverImage:              "",
		Invariants:              invariants,
		Episodes:                epIDs,
	}

	projBytes, _ := json.MarshalIndent(proj, "", "  ")
	if err := os.WriteFile(filepath.Join(projDir, "project.json"), projBytes, 0644); err != nil {
		return nil, err
	}

	var manifests []models.EpisodeManifest
	for i := 1; i <= episodesToCreate; i++ {
		epID := fmt.Sprintf("ep%02d", i)
		epTitle := fmt.Sprintf("Issue #%d: Chapter %d", i, i)
		epTheme := fmt.Sprintf("%s_episode_%02d", projID, i)
		ep := buildEpisodeManifest(proj, i, epID, epTitle, epTheme, defaultPanelsPerEpisode)
		_ = s.saveEpisodeLocked(ep)
		manifests = append(manifests, *ep)
	}

	return &models.ProjectWithEpisodes{
		Project:  proj,
		Episodes: manifests,
	}, nil
}

func (s *Store) UpdateProjectConfig(projectID, genre, artStyleAnchor, defaultImageEngine string, targetEpisodeCount, defaultPanelsPerEpisode int, invariants []string, scaffoldMissingEpisodes bool) (*models.Project, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	projPath := filepath.Join(s.projectsDir(), projectID, "project.json")
	projBytes, err := os.ReadFile(projPath)
	if err != nil {
		return nil, fmt.Errorf("project %s not found: %w", projectID, err)
	}
	var proj models.Project
	if err := json.Unmarshal(projBytes, &proj); err != nil {
		return nil, err
	}

	if genre != "" {
		proj.Genre = genre
	}
	if artStyleAnchor != "" {
		proj.ArtStyleAnchor = artStyleAnchor
	}
	if defaultImageEngine != "" {
		proj.DefaultImageEngine = defaultImageEngine
	}
	if targetEpisodeCount > 0 {
		proj.TargetEpisodeCount = targetEpisodeCount
	}
	if defaultPanelsPerEpisode > 0 {
		proj.DefaultPanelsPerEpisode = defaultPanelsPerEpisode
	}
	if invariants != nil {
		proj.Invariants = invariants
	}

	if scaffoldMissingEpisodes && proj.TargetEpisodeCount > len(proj.Episodes) {
		existing := make(map[string]bool)
		for _, id := range proj.Episodes {
			existing[id] = true
		}
		for i := 1; i <= proj.TargetEpisodeCount; i++ {
			epID := fmt.Sprintf("ep%02d", i)
			if !existing[epID] {
				proj.Episodes = append(proj.Episodes, epID)
				epTitle := fmt.Sprintf("Issue #%d: Planned Saga Chapter %d", i, i)
				epTheme := fmt.Sprintf("%s_chapter_%02d", proj.ID, i)
				ep := buildEpisodeManifest(proj, i, epID, epTitle, epTheme, proj.DefaultPanelsPerEpisode)
				_ = s.saveEpisodeLocked(ep)
			}
		}
	}

	proj.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	newBytes, _ := json.MarshalIndent(proj, "", "  ")
	if err := os.WriteFile(projPath, newBytes, 0644); err != nil {
		return nil, err
	}
	return &proj, nil
}

func (s *Store) DeleteProject(projectID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	cleanID := strings.TrimSpace(projectID)
	if cleanID == "" || cleanID == "." || cleanID == ".." || strings.Contains(cleanID, "/") || strings.Contains(cleanID, "\\") {
		return fmt.Errorf("invalid project ID: %q", projectID)
	}

	projDir := filepath.Join(s.projectsDir(), cleanID)
	if _, err := os.Stat(projDir); os.IsNotExist(err) {
		return fmt.Errorf("project %q does not exist", cleanID)
	}

	return os.RemoveAll(projDir)
}

func (s *Store) ResetEpisode(projectID, episodeID string) (*models.EpisodeManifest, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	cleanProj := strings.TrimSpace(projectID)
	cleanEp := strings.TrimSpace(episodeID)
	if cleanProj == "" || cleanProj == "." || cleanProj == ".." || strings.Contains(cleanProj, "/") || strings.Contains(cleanProj, "\\") {
		return nil, fmt.Errorf("invalid project ID: %q", projectID)
	}
	if cleanEp == "" || cleanEp == "." || cleanEp == ".." || strings.Contains(cleanEp, "/") || strings.Contains(cleanEp, "\\") {
		return nil, fmt.Errorf("invalid episode ID: %q", episodeID)
	}

	projBytes, err := os.ReadFile(filepath.Join(s.projectsDir(), cleanProj, "project.json"))
	if err != nil {
		return nil, fmt.Errorf("project %q not found: %w", cleanProj, err)
	}
	var proj models.Project
	if err := json.Unmarshal(projBytes, &proj); err != nil {
		return nil, err
	}

	epDir := filepath.Join(s.projectsDir(), cleanProj, "episodes", cleanEp)
	epPath := filepath.Join(epDir, "manifest.json")
	epBytes, err := os.ReadFile(epPath)
	if err != nil {
		return nil, fmt.Errorf("episode %q/%q not found: %w", cleanProj, cleanEp, err)
	}
	var existing models.EpisodeManifest
	if err := json.Unmarshal(epBytes, &existing); err != nil {
		return nil, err
	}

	// Remove all generated episode assets (panels, audio, video, scripts, etc.)
	if entries, err := os.ReadDir(epDir); err == nil {
		for _, entry := range entries {
			if entry.Name() == "manifest.json" {
				continue
			}
			_ = os.RemoveAll(filepath.Join(epDir, entry.Name()))
		}
	}

	// Recreate fresh manifest preserving episode identity, panel count, and engine
	fresh := buildEpisodeManifest(proj, existing.EpisodeNumber, existing.EpisodeID, existing.Title, existing.Theme, existing.TargetPanelCount)
	fresh.ImageEngine = existing.ImageEngine
	fresh.AssignedWorkerTab = existing.AssignedWorkerTab
	if err := s.saveEpisodeLocked(fresh); err != nil {
		return nil, err
	}
	return fresh, nil
}

func (s *Store) GetProjectCharacters(projectID string) (map[string]interface{}, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	cleanID := strings.TrimSpace(projectID)
	charPath := filepath.Join(s.projectsDir(), cleanID, "bible", "characters.json")
	if _, err := os.Stat(charPath); os.IsNotExist(err) {
		return map[string]interface{}{}, nil
	}

	data, err := os.ReadFile(charPath)
	if err != nil {
		return nil, err
	}

	var res map[string]interface{}
	if err := json.Unmarshal(data, &res); err != nil {
		return map[string]interface{}{}, nil
	}
	return res, nil
}

func (s *Store) SaveProjectCharacters(projectID string, characters map[string]interface{}) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	cleanID := strings.TrimSpace(projectID)
	bibleDir := filepath.Join(s.projectsDir(), cleanID, "bible")
	if err := os.MkdirAll(bibleDir, 0755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(characters, "", "  ")
	if err != nil {
		return err
	}

	charPath := filepath.Join(bibleDir, "characters.json")
	return os.WriteFile(charPath, data, 0644)
}

func (s *Store) CreateEpisode(projectID, title, theme, imageEngine string, panelCount int) (*models.EpisodeManifest, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	projPath := filepath.Join(s.projectsDir(), projectID, "project.json")
	projBytes, err := os.ReadFile(projPath)
	if err != nil {
		return nil, fmt.Errorf("project %s not found: %w", projectID, err)
	}
	var proj models.Project
	if err := json.Unmarshal(projBytes, &proj); err != nil {
		return nil, err
	}

	epNum := nextEpisodeNumber(proj.Episodes)
	epID := fmt.Sprintf("ep%02d", epNum)
	proj.Episodes = append(proj.Episodes, epID)
	if epNum > proj.TargetEpisodeCount {
		proj.TargetEpisodeCount = epNum
	}
	proj.UpdatedAt = time.Now().UTC().Format(time.RFC3339)

	newProjBytes, _ := json.MarshalIndent(proj, "", "  ")
	if err := os.WriteFile(projPath, newProjBytes, 0644); err != nil {
		return nil, err
	}

	if panelCount <= 0 {
		if proj.DefaultPanelsPerEpisode > 0 {
			panelCount = proj.DefaultPanelsPerEpisode
		} else {
			panelCount = 20
		}
	}

	ep := buildEpisodeManifest(proj, epNum, epID, title, theme, panelCount)
	if imageEngine != "" {
		ep.ImageEngine = imageEngine
	}
	if err := s.saveEpisodeLocked(ep); err != nil {
		return nil, err
	}
	return ep, nil
}

func (s *Store) UpdateEpisodeConfig(projectID, episodeID string, targetPanelCount int, title, imageEngine string) (*models.EpisodeManifest, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	projPath := filepath.Join(s.projectsDir(), projectID, "project.json")
	var proj models.Project
	if projBytes, err := os.ReadFile(projPath); err == nil {
		_ = json.Unmarshal(projBytes, &proj)
	}
	styleAnchor := proj.ArtStyleAnchor
	if styleAnchor == "" {
		styleAnchor = "graphic novel comic book panel, sequential art illustration"
	}

	epPath := filepath.Join(s.projectsDir(), projectID, "episodes", episodeID, "manifest.json")
	epBytes, err := os.ReadFile(epPath)
	if err != nil {
		return nil, fmt.Errorf("episode %s/%s not found: %w", projectID, episodeID, err)
	}
	var ep models.EpisodeManifest
	if err := json.Unmarshal(epBytes, &ep); err != nil {
		return nil, err
	}

	if title != "" {
		ep.Title = title
	}
	if imageEngine != "" {
		ep.ImageEngine = imageEngine
	}

	if targetPanelCount > 0 {
		ep.TargetPanelCount = targetPanelCount
		curLen := len(ep.Panels)
		if targetPanelCount > curLen {
			for i := curLen; i < targetPanelCount; i++ {
				ep.Panels = append(ep.Panels, models.Panel{
					PanelID:     i + 1,
					Name:        fmt.Sprintf("Beat %d", i+1),
					Act:         "Act III",
					Summary:     fmt.Sprintf("Expanded scene beat %d of %d", i+1, targetPanelCount),
					Caption:     "Steel and shadow collide.",
					Dialogue:    []models.DialogueLine{},
					Characters:  []string{"korvath"},
					Objects:     []string{"broadsword"},
					ShotType:    "Cinematic Action Shot",
					Prompt:      fmt.Sprintf("%s, Beat %d", styleAnchor, i+1),
					ImageStatus: "PENDING",
					AudioStatus: "LOCKED_BY_GATE",
				})
			}
		} else if targetPanelCount < curLen {
			// Trim trailing panels down to targetPanelCount
			ep.Panels = ep.Panels[:targetPanelCount]
		}
	}

	if err := s.saveEpisodeLocked(&ep); err != nil {
		return nil, err
	}
	return &ep, nil
}
