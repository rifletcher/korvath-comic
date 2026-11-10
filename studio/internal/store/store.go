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
				episodes = append(episodes, ep)
			}
		}

		sort.Slice(episodes, func(i, j int) bool {
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
	s.mu.RLock()
	defer s.mu.RUnlock()

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
	return &ep, nil
}

func (s *Store) SaveEpisode(ep *models.EpisodeManifest) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.saveEpisodeLocked(ep)
}

func (s *Store) saveEpisodeLocked(ep *models.EpisodeManifest) error {
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
	return os.WriteFile(epPath, data, 0644)
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
			Summary:     fmt.Sprintf("Scene beat %d of %d for %s", i+1, panelCount, title),
			Caption:     "The chronicle unfolds in shadow and iron.",
			Dialogue:    []models.DialogueLine{},
			Characters:  []string{"korvath"},
			Objects:     []string{"broadsword"},
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
		CurrentStage:     "SCRIPT_GATE",
		OverallProgress:  18,
		UpdatedAt:        time.Now().UTC().Format(time.RFC3339),
		Outputs: models.EpisodeOutputs{
			Resolution: fmt.Sprintf("Configured for %d Panels • Awaiting Gate A Approval", panelCount),
		},
		Stages: []models.Stage{
			{ID: "SCRIPT_GENERATION", Name: "1. Writers Room Script", Status: "COMPLETED", Progress: 100},
			{ID: "PROMPT_EXPANSION", Name: "2. Latent Anchor & Guardrails", Status: "LOCKED_BY_GATE", Progress: 0},
			{ID: "VISUAL_RENDERING", Name: "3. Meta AI 2K Panel Rendering", Status: "LOCKED_BY_GATE", Progress: 0},
			{ID: "VOICE_SYNTHESIS", Name: "4. Multi-Actor Voice & DSP", Status: "LOCKED_BY_GATE", Progress: 0},
			{ID: "VIDEO_ASSEMBLY", Name: "5. Motion Comic Camera & Concat", Status: "LOCKED_BY_GATE", Progress: 0},
			{ID: "READY_FOR_RELEASE", Name: "6. Master Release Bundle", Status: "LOCKED_BY_GATE", Progress: 0},
		},
		Gates: []models.Gate{
			{ID: "SCRIPT_GATE", Name: "Gate A: Storyboard & Dialogue Lock", AfterStage: "SCRIPT_GENERATION", Status: "AWAITING_APPROVAL", Notes: fmt.Sprintf("Writers Room %d-panel beat outline ready. Approve to unlock visual rendering.", panelCount)},
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

func (s *Store) CreateProject(title, subtitle, genre, artStyleAnchor, defaultImageEngine string, targetEpisodeCount, defaultPanelsPerEpisode int, scaffoldAllEpisodes bool) (*models.ProjectWithEpisodes, error) {
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
		CoverImage:              "docs/assets/ep1_meta/panel_01.webp",
		Invariants: []string{
			fmt.Sprintf("Series Arc: %d Planned Episodes", targetEpisodeCount),
			fmt.Sprintf("Default Format: %d Panels per Episode", defaultPanelsPerEpisode),
			"8-Point Director Visual Continuity Gate Active",
		},
		Episodes: epIDs,
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

func (s *Store) UpdateProjectConfig(projectID, genre, artStyleAnchor, defaultImageEngine string, targetEpisodeCount, defaultPanelsPerEpisode int, scaffoldMissingEpisodes bool) (*models.Project, error) {
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

	epNum := len(proj.Episodes) + 1
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
