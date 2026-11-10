package main

import (
	"conan-studio/internal/engine"
	"conan-studio/internal/models"
	"conan-studio/internal/store"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
)

type App struct {
	ctx   context.Context
	store *store.Store
	orch  *engine.Orchestrator
}

func NewApp(rootDir string) *App {
	st := store.NewStore(rootDir)
	orch := engine.NewOrchestrator(st, 3, 3)
	return &App{
		store: st,
		orch:  orch,
	}
}

func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
}

// ============================================================================
// Wails-Bound Methods (Directly callable via window.go.main.App.*)
// ============================================================================

func (a *App) GetProjects() ([]models.ProjectWithEpisodes, error) {
	return a.store.ListProjectsWithEpisodes()
}

func (a *App) GetEpisode(projectID, episodeID string) (*models.EpisodeManifest, error) {
	return a.store.GetEpisode(projectID, episodeID)
}

func (a *App) GetPoolStatus() models.WorkerPoolStatus {
	return a.orch.GetPoolStatus()
}

func (a *App) ApproveGate(projectID, episodeID, gateID, notes string) (*models.EpisodeManifest, error) {
	return a.orch.ApproveGate(projectID, episodeID, gateID, notes)
}

func (a *App) RejectGate(projectID, episodeID, gateID, reason string, panelIDs []int) (*models.EpisodeManifest, error) {
	return a.orch.RejectGate(projectID, episodeID, gateID, reason, panelIDs)
}

func (a *App) RegeneratePanel(projectID, episodeID string, panelID int, promptOverride string) error {
	return a.orch.RegeneratePanel(projectID, episodeID, panelID, promptOverride)
}

func (a *App) StartStage(projectID, episodeID, stageID string) error {
	return a.orch.StartStage(projectID, episodeID, stageID)
}

func (a *App) CreateEpisode(projectID, title, theme, imageEngine string, panelCount int) (*models.EpisodeManifest, error) {
	return a.store.CreateEpisode(projectID, title, theme, imageEngine, panelCount)
}

func (a *App) CreateProject(title, subtitle, genre, artStyleAnchor, defaultImageEngine string, targetEpisodeCount, defaultPanelsPerEpisode int, scaffoldAllEpisodes bool) (*models.ProjectWithEpisodes, error) {
	return a.store.CreateProject(title, subtitle, genre, artStyleAnchor, defaultImageEngine, targetEpisodeCount, defaultPanelsPerEpisode, scaffoldAllEpisodes)
}

func (a *App) UpdateProjectConfig(projectID, genre, artStyleAnchor, defaultImageEngine string, targetEpisodeCount, defaultPanelsPerEpisode int, scaffoldMissingEpisodes bool) (*models.Project, error) {
	return a.store.UpdateProjectConfig(projectID, genre, artStyleAnchor, defaultImageEngine, targetEpisodeCount, defaultPanelsPerEpisode, scaffoldMissingEpisodes)
}

func (a *App) UpdateEpisodeConfig(projectID, episodeID string, targetPanelCount int, title, imageEngine string) (*models.EpisodeManifest, error) {
	return a.store.UpdateEpisodeConfig(projectID, episodeID, targetPanelCount, title, imageEngine)
}

// ============================================================================
// HTTP + SSE Bridge (Enables both Wails WebView2 and Browser Dashboard)
// ============================================================================

func (a *App) RegisterHTTPHandlers(mux *http.ServeMux, frontendDir string) {
	// Serve workspace static assets (panel webp images, audio, videos, review html)
	docsDir := filepath.Join(a.store.RootDir(), "docs")
	mux.Handle("/workspace-docs/", http.StripPrefix("/workspace-docs/", http.FileServer(http.Dir(docsDir))))

	assetsDir := filepath.Join(a.store.RootDir(), "02_Assets")
	mux.Handle("/workspace-assets/", http.StripPrefix("/workspace-assets/", http.FileServer(http.Dir(assetsDir))))

	// REST API Endpoints mirroring Wails bindings
	mux.HandleFunc("/api/projects", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, func() (interface{}, error) {
			return a.GetProjects()
		})
	})

	mux.HandleFunc("/api/pool", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, func() (interface{}, error) {
			return a.GetPoolStatus(), nil
		})
	})

	mux.HandleFunc("/api/episode", func(w http.ResponseWriter, r *http.Request) {
		proj := r.URL.Query().Get("project")
		ep := r.URL.Query().Get("episode")
		writeJSON(w, func() (interface{}, error) {
			return a.GetEpisode(proj, ep)
		})
	})

	mux.HandleFunc("/api/gate/approve", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID string `json:"projectId"`
			EpisodeID string `json:"episodeId"`
			GateID    string `json:"gateId"`
			Notes     string `json:"notes"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			return a.ApproveGate(req.ProjectID, req.EpisodeID, req.GateID, req.Notes)
		})
	})

	mux.HandleFunc("/api/gate/reject", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID string `json:"projectId"`
			EpisodeID string `json:"episodeId"`
			GateID    string `json:"gateId"`
			Reason    string `json:"reason"`
			PanelIDs  []int  `json:"panelIds"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			return a.RejectGate(req.ProjectID, req.EpisodeID, req.GateID, req.Reason, req.PanelIDs)
		})
	})

	mux.HandleFunc("/api/panel/regenerate", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID      string `json:"projectId"`
			EpisodeID      string `json:"episodeId"`
			PanelID        int    `json:"panelId"`
			PromptOverride string `json:"promptOverride"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			err := a.RegeneratePanel(req.ProjectID, req.EpisodeID, req.PanelID, req.PromptOverride)
			return map[string]bool{"queued": err == nil}, err
		})
	})

	mux.HandleFunc("/api/stage/start", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID string `json:"projectId"`
			EpisodeID string `json:"episodeId"`
			StageID   string `json:"stageId"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			err := a.StartStage(req.ProjectID, req.EpisodeID, req.StageID)
			return map[string]bool{"started": err == nil}, err
		})
	})

	mux.HandleFunc("/api/episode/create", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID   string `json:"projectId"`
			Title       string `json:"title"`
			Theme       string `json:"theme"`
			ImageEngine string `json:"imageEngine"`
			PanelCount  int    `json:"panelCount"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			return a.CreateEpisode(req.ProjectID, req.Title, req.Theme, req.ImageEngine, req.PanelCount)
		})
	})

	mux.HandleFunc("/api/project/create", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Title                   string `json:"title"`
			Subtitle                string `json:"subtitle"`
			Genre                   string `json:"genre"`
			ArtStyleAnchor          string `json:"artStyleAnchor"`
			DefaultImageEngine      string `json:"defaultImageEngine"`
			TargetEpisodeCount      int    `json:"targetEpisodeCount"`
			DefaultPanelsPerEpisode int    `json:"defaultPanelsPerEpisode"`
			ScaffoldAllEpisodes     bool   `json:"scaffoldAllEpisodes"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			return a.CreateProject(req.Title, req.Subtitle, req.Genre, req.ArtStyleAnchor, req.DefaultImageEngine, req.TargetEpisodeCount, req.DefaultPanelsPerEpisode, req.ScaffoldAllEpisodes)
		})
	})

	mux.HandleFunc("/api/project/config", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID               string `json:"projectId"`
			Genre                   string `json:"genre"`
			ArtStyleAnchor          string `json:"artStyleAnchor"`
			DefaultImageEngine      string `json:"defaultImageEngine"`
			TargetEpisodeCount      int    `json:"targetEpisodeCount"`
			DefaultPanelsPerEpisode int    `json:"defaultPanelsPerEpisode"`
			ScaffoldMissingEpisodes bool   `json:"scaffoldMissingEpisodes"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			return a.UpdateProjectConfig(req.ProjectID, req.Genre, req.ArtStyleAnchor, req.DefaultImageEngine, req.TargetEpisodeCount, req.DefaultPanelsPerEpisode, req.ScaffoldMissingEpisodes)
		})
	})

	mux.HandleFunc("/api/episode/config", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID        string `json:"projectId"`
			EpisodeID        string `json:"episodeId"`
			TargetPanelCount int    `json:"targetPanelCount"`
			Title            string `json:"title"`
			ImageEngine      string `json:"imageEngine"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			return a.UpdateEpisodeConfig(req.ProjectID, req.EpisodeID, req.TargetPanelCount, req.Title, req.ImageEngine)
		})
	})

	// Server-Sent Events (SSE) for real-time pipeline updates
	mux.HandleFunc("/api/events", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
			return
		}

		sub := a.orch.Subscribe()
		defer a.orch.Unsubscribe(sub)

		for {
			select {
			case <-r.Context().Done():
				return
			case ev := <-sub:
				b, _ := json.Marshal(ev)
				_, _ = fmt.Fprintf(w, "data: %s\n\n", string(b))
				flusher.Flush()
			}
		}
	})

	// Serve Frontend UI
	mux.Handle("/", http.FileServer(http.Dir(frontendDir)))
}

func writeJSON(w http.ResponseWriter, fn func() (interface{}, error)) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	res, err := fn()
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	_ = json.NewEncoder(w).Encode(res)
}

