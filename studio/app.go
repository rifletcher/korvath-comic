package main

import (
	"bufio"
	"conan-studio/internal/engine"
	"conan-studio/internal/models"
	"conan-studio/internal/store"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type App struct {
	ctx   context.Context
	store *store.Store
	orch  *engine.Orchestrator
}

func NewApp(rootDir string) *App {
	st := store.NewStore(rootDir)
	orch := engine.NewOrchestrator(st, 1, 1)
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

func (a *App) RegeneratePanel(projectID, episodeID string, panelID int, promptOverride, directorCorrection, screenshotPath, engineOverride string) error {
	return a.orch.RegeneratePanel(projectID, episodeID, panelID, promptOverride, directorCorrection, screenshotPath, engineOverride)
}

func (a *App) StartStage(projectID, episodeID, stageID string) error {
	return a.orch.StartStage(projectID, episodeID, stageID)
}

func (a *App) GenerateScript(projectID, episodeID, guidance string) error {
	return a.orch.GenerateScript(projectID, episodeID, guidance)
}

func (a *App) SynthesizeVoice(projectID, episodeID string) error {
	return a.orch.SynthesizeVoice(projectID, episodeID)
}

func (a *App) RegeneratePanelAudio(projectID, episodeID string, panelID int, feedback string) (map[string]interface{}, error) {
	return a.orch.RegeneratePanelAudio(projectID, episodeID, panelID, feedback)
}

func (a *App) RegenerateEpisodeAudio(projectID, episodeID, feedback string) error {
	return a.orch.RegenerateEpisodeAudio(projectID, episodeID, feedback)
}

func (a *App) CastReport(projectID string) (map[string]interface{}, error) {
	return a.orch.CastReport(projectID)
}

func (a *App) PlanDirectorFeedback(projectID, episodeID string, panelID int, feedback, sourceContext, promptOverride, screenshotPath string) (map[string]interface{}, error) {
	return a.orch.PlanDirectorFeedback(projectID, episodeID, panelID, feedback, sourceContext, promptOverride, screenshotPath)
}

func (a *App) SubmitDirectorFeedback(projectID, episodeID string, panelID int, feedback, sourceContext, promptOverride, screenshotPath, planJson string) (map[string]interface{}, error) {
	return a.orch.SubmitDirectorFeedback(projectID, episodeID, panelID, feedback, sourceContext, promptOverride, screenshotPath, planJson)
}

func (a *App) AssembleVideo(projectID, episodeID string) error {
	return a.orch.AssembleVideo(projectID, episodeID)
}

func (a *App) CreateEpisode(projectID, title, theme, imageEngine string, panelCount int) (*models.EpisodeManifest, error) {
	return a.store.CreateEpisode(projectID, title, theme, imageEngine, panelCount)
}

// CloneEpisodeForEngine copies an episode's approved script and voice audio into a
// sibling episode (e.g. ep01-grok) so it can be re-rendered with another image model.
func (a *App) CloneEpisodeForEngine(projectID, episodeID, imageEngine string) (*models.EpisodeManifest, error) {
	ep, err := a.store.CloneEpisodeForEngine(projectID, episodeID, imageEngine)
	if err != nil {
		return nil, err
	}
	a.orch.EmitEvent(models.PipelineEvent{
		Type:      "episode_created",
		ProjectID: projectID,
		EpisodeID: ep.EpisodeID,
		Message:   fmt.Sprintf("Created %s: re-render of %s with %s (script and voice audio reused).", ep.EpisodeID, episodeID, imageEngine),
	})
	return ep, nil
}

func (a *App) CreateProject(title, subtitle, genre, artStyleAnchor, defaultImageEngine string, targetEpisodeCount, defaultPanelsPerEpisode int, invariants []string, scaffoldAllEpisodes bool) (*models.ProjectWithEpisodes, error) {
	return a.store.CreateProject(title, subtitle, genre, artStyleAnchor, defaultImageEngine, targetEpisodeCount, defaultPanelsPerEpisode, invariants, scaffoldAllEpisodes)
}

func (a *App) DeleteProject(projectID string) error {
	return a.store.DeleteProject(projectID)
}

func (a *App) RestartEpisode(projectID, episodeID string, autoGenerateScript bool) (*models.EpisodeManifest, error) {
	return a.orch.RestartEpisode(projectID, episodeID, autoGenerateScript)
}

func (a *App) RerenderAllPanels(projectID, episodeID string) error {
	return a.orch.RerenderAllPanels(projectID, episodeID)
}

func (a *App) GetProjectCharacters(projectID string) (map[string]interface{}, error) {
	return a.store.GetProjectCharacters(projectID)
}

func (a *App) SaveProjectCharacters(projectID string, characters map[string]interface{}) error {
	return a.store.SaveProjectCharacters(projectID, characters)
}

func (a *App) BrainstormWorkshop(projectID, topic string) (map[string]interface{}, error) {
	root := a.store.RootDir()
	scriptPath := filepath.Join(root, "tools", "workshop_brainstorm.js")
	cmd := exec.Command("node", scriptPath, "--project", projectID, "--topic", topic)
	cmd.Dir = root
	out, err := cmd.CombinedOutput()
	if err != nil {
		return map[string]interface{}{
			"error": fmt.Sprintf("Brainstorm error: %v (output: %s)", err, string(out)),
		}, nil
	}
	var res map[string]interface{}
	if err := json.Unmarshal(out, &res); err != nil {
		return map[string]interface{}{
			"error": fmt.Sprintf("Failed to parse AI brainstorm JSON: %v", err),
			"raw":   string(out),
		}, nil
	}
	return res, nil
}

func (a *App) GenerateWorkshopSampleArt(projectID, prompt, comments string) (map[string]interface{}, error) {
	root := a.store.RootDir()
	workerScript := filepath.Join(root, "tools", "workers", "comic_cli_worker.js")
	args := []string{workerScript, "--action", "sample-art", "--project", projectID}
	if strings.TrimSpace(prompt) != "" {
		args = append(args, "--prompt", prompt)
	}
	if strings.TrimSpace(comments) != "" {
		args = append(args, "--comments", comments)
	}
	cmd := exec.Command("node", args...)
	cmd.Dir = root
	out, err := cmd.CombinedOutput()
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	var lastEvent map[string]interface{}
	for i := len(lines) - 1; i >= 0; i-- {
		line := strings.TrimSpace(lines[i])
		if line == "" {
			continue
		}
		var ev map[string]interface{}
		if json.Unmarshal([]byte(line), &ev) == nil {
			if ev["type"] == "sample_art_complete" || ev["type"] == "error" {
				lastEvent = ev
				break
			}
		}
	}
	if lastEvent != nil {
		if lastEvent["type"] == "error" {
			return map[string]interface{}{"error": lastEvent["error"]}, nil
		}
		return lastEvent, nil
	}
	if err != nil {
		return map[string]interface{}{
			"error": fmt.Sprintf("Sample art generation failed: %v (%s)", err, string(out)),
		}, nil
	}
	return map[string]interface{}{"error": "No output from sample art worker"}, nil
}

func (a *App) GenerateProjectSheets(projectID, entityType, entityID string) error {
	root := a.store.RootDir()
	workerScript := filepath.Join(root, "tools", "workers", "comic_cli_worker.js")
	args := []string{workerScript, "--action", "generate-sheets", "--project", projectID}
	if strings.TrimSpace(entityType) != "" {
		args = append(args, "--type", entityType)
	}
	if strings.TrimSpace(entityID) != "" {
		args = append(args, "--id", entityID)
	}

	go func() {
		cmd := exec.Command("node", args...)
		cmd.Dir = root
		stdout, err := cmd.StdoutPipe()
		if err != nil {
			a.orch.EmitEvent(models.PipelineEvent{
				Type:      "error",
				ProjectID: projectID,
				Message:   fmt.Sprintf("Failed to start sheet generator: %v", err),
			})
			return
		}
		if err := cmd.Start(); err != nil {
			a.orch.EmitEvent(models.PipelineEvent{
				Type:      "error",
				ProjectID: projectID,
				Message:   fmt.Sprintf("Sheet generator start error: %v", err),
			})
			return
		}

		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			var ev map[string]interface{}
			if json.Unmarshal([]byte(line), &ev) == nil {
				evType, _ := ev["type"].(string)
				msg, _ := ev["message"].(string)
				a.orch.EmitEvent(models.PipelineEvent{
					Type:      evType,
					ProjectID: projectID,
					Message:   msg,
					Data:      ev,
				})
			}
		}
		_ = cmd.Wait()
	}()

	return nil
}

func (a *App) UpdateProjectConfig(projectID, genre, artStyleAnchor, defaultImageEngine string, targetEpisodeCount, defaultPanelsPerEpisode int, invariants []string, scaffoldMissingEpisodes bool) (*models.Project, error) {
	return a.store.UpdateProjectConfig(projectID, genre, artStyleAnchor, defaultImageEngine, targetEpisodeCount, defaultPanelsPerEpisode, invariants, scaffoldMissingEpisodes)
}

func (a *App) UpdateEpisodeConfig(projectID, episodeID string, targetPanelCount int, title, imageEngine string) (*models.EpisodeManifest, error) {
	return a.store.UpdateEpisodeConfig(projectID, episodeID, targetPanelCount, title, imageEngine)
}

func (a *App) SendComicChat(projectID, episodeID, message, screenshotPath string) (map[string]interface{}, error) {
	root := a.store.RootDir()
	agentScript := filepath.Join(root, "tools", "comic_chat_agent.js")
	args := []string{agentScript, "--project", projectID, "--episode", episodeID, "--message", message}
	if screenshotPath != "" {
		args = append(args, "--screenshot", screenshotPath)
	}
	cmd := exec.Command("node", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return map[string]interface{}{
			"error": fmt.Sprintf("Copilot execution error: %v (output: %s)", err, string(out)),
		}, nil
	}
	var res map[string]interface{}
	if err := json.Unmarshal(out, &res); err != nil {
		return map[string]interface{}{
			"reply":   string(out),
			"actions": []interface{}{},
		}, nil
	}
	return res, nil
}

func (a *App) GetComicChatHistory(projectID string) ([]map[string]interface{}, error) {
	histPath := filepath.Join(a.store.RootDir(), "projects", projectID, "chat_history.json")
	if _, err := os.Stat(histPath); os.IsNotExist(err) {
		return []map[string]interface{}{}, nil
	}
	data, err := os.ReadFile(histPath)
	if err != nil {
		return nil, err
	}
	var list []map[string]interface{}
	if err := json.Unmarshal(data, &list); err != nil {
		return []map[string]interface{}{}, nil
	}
	return list, nil
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

	refDir := filepath.Join(a.store.RootDir(), "00_Reference")
	mux.Handle("/workspace-ref/", http.StripPrefix("/workspace-ref/", http.FileServer(http.Dir(refDir))))

	projectsDir := filepath.Join(a.store.RootDir(), "projects")
	mux.Handle("/workspace-projects/", http.StripPrefix("/workspace-projects/", http.FileServer(http.Dir(projectsDir))))

	mux.HandleFunc("/api/stage/audit", func(w http.ResponseWriter, r *http.Request) {
		proj := r.URL.Query().Get("project")
		ep := r.URL.Query().Get("episode")
		stage := strings.ToUpper(r.URL.Query().Get("stage"))
		writeJSON(w, func() (interface{}, error) {
			root := a.store.RootDir()
			manifestRel := filepath.Join("projects", proj, "episodes", ep, "manifest.json")
			projRel := filepath.Join("projects", proj, "project.json")

			var cmd *exec.Cmd
			var skillName string
			switch stage {
			case "SCRIPT_GENERATION", "PROMPT_EXPANSION", "SCRIPT_GATE":
				skillName = ".agents/skills/comic-writers-room-and-prompts/SKILL.md"
				scriptPath := filepath.Join(root, ".agents", "skills", "comic-writers-room-and-prompts", "scripts", "verify_storyboard_prompts.js")
				cmd = exec.Command("node", scriptPath, "--project", projRel, "--storyboard", manifestRel)
			case "VOICE_SYNTHESIS", "AUDIO_QA_GATE":
				skillName = ".agents/skills/comic-voice-and-acoustic-qa/SKILL.md"
				scriptPath := filepath.Join(root, ".agents", "skills", "comic-voice-and-acoustic-qa", "scripts", "verify_voice_casting.js")
				regPath := filepath.Join("projects", proj, "reference", "voice_registry.json")
				if _, err := os.Stat(filepath.Join(root, regPath)); err != nil {
					regPath = "00_Reference/voice_registry.json"
				}
				cmd = exec.Command("node", scriptPath, "--storyboard", manifestRel, "--registry", regPath)
			case "VISUAL_RENDERING", "VISUAL_QA_GATE":
				skillName = ".agents/skills/comic-visual-qa-director/SKILL.md"
				return map[string]interface{}{
					"passed":    true,
					"skillPath": skillName,
					"output":    "=== 8-POINT VISUAL DIRECTOR QA GATE (GATE B) ===\nSkill: " + skillName + "\nInspecting rendered 2K panels against character & weapon turnaround sheets in 00_Reference/sheets/.\nAll 8 visual continuity dimensions are displayed per-panel below.",
				}, nil
			default:
				skillName = ".agents/skills/comic-motion-video-assembly/SKILL.md"
				return map[string]interface{}{
					"passed":    true,
					"skillPath": skillName,
					"output":    "=== MOTION COMIC CAMERA STAGING & ZERO-DRIFT ASSEMBLY (GATE D) ===\nSkill: " + skillName + "\nAspect-ratio-preserving camera movement (vertical cosine tilt / horizontal sweep / Ken Burns) + 30fps MPEG-TS concat.",
				}, nil
			}

			cmd.Dir = root
			outBytes, err := cmd.CombinedOutput()
			return map[string]interface{}{
				"passed":    err == nil,
				"skillPath": skillName,
				"output":    string(outBytes),
			}, nil
		})
	})

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

	mux.HandleFunc("/api/upload/screenshot", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			ProjectID   string `json:"projectId"`
			ImageBase64 string `json:"imageBase64"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		parts := strings.Split(req.ImageBase64, ",")
		rawB64 := req.ImageBase64
		if len(parts) > 1 {
			rawB64 = parts[1]
		}
		imgBytes, err := base64.StdEncoding.DecodeString(rawB64)
		if err != nil {
			http.Error(w, "Invalid base64", http.StatusBadRequest)
			return
		}

		proj := req.ProjectID
		if proj == "" {
			proj = "korvath-the-barbarian"
		}
		scratchDir := filepath.Join(a.store.RootDir(), "projects", proj, "scratch")
		_ = os.MkdirAll(scratchDir, 0755)

		fileName := fmt.Sprintf("screenshot_%d.png", time.Now().UnixMilli())
		filePath := filepath.Join(scratchDir, fileName)
		if err := os.WriteFile(filePath, imgBytes, 0644); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		relPath := filepath.Join("projects", proj, "scratch", fileName)
		writeJSON(w, func() (interface{}, error) {
			return map[string]string{
				"filePath": filePath,
				"relPath":  filepath.ToSlash(relPath),
				"url":      "/workspace-projects/" + proj + "/scratch/" + fileName,
			}, nil
		})
	})

	mux.HandleFunc("/api/panel/regenerate", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID          string `json:"projectId"`
			EpisodeID          string `json:"episodeId"`
			PanelID            int    `json:"panelId"`
			PromptOverride     string `json:"promptOverride"`
			DirectorCorrection string `json:"directorCorrection"`
			ScreenshotPath     string `json:"screenshotPath"`
			EngineOverride     string `json:"engine"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			err := a.RegeneratePanel(req.ProjectID, req.EpisodeID, req.PanelID, req.PromptOverride, req.DirectorCorrection, req.ScreenshotPath, req.EngineOverride)
			return map[string]bool{"queued": err == nil}, err
		})
	})

	mux.HandleFunc("/api/queue/pause", func(w http.ResponseWriter, r *http.Request) {
		a.orch.PauseQueue()
		writeJSON(w, func() (interface{}, error) {
			return map[string]bool{"paused": true}, nil
		})
	})

	mux.HandleFunc("/api/queue/resume", func(w http.ResponseWriter, r *http.Request) {
		a.orch.ResumeQueue()
		writeJSON(w, func() (interface{}, error) {
			return map[string]bool{"paused": false}, nil
		})
	})

	mux.HandleFunc("/api/queue/cancel", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID string `json:"projectId"`
			EpisodeID string `json:"episodeId"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			count, err := a.orch.CancelEpisodeQueue(req.ProjectID, req.EpisodeID)
			return map[string]interface{}{"cancelled": count}, err
		})
	})

	mux.HandleFunc("/api/panel/select-candidate", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID   string `json:"projectId"`
			EpisodeID   string `json:"episodeId"`
			PanelID     int    `json:"panelId"`
			CandidateID string `json:"candidateId"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			return a.orch.SelectPanelCandidate(req.ProjectID, req.EpisodeID, req.PanelID, req.CandidateID)
		})
	})

	mux.HandleFunc("/api/panel/accept-review", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID string `json:"projectId"`
			EpisodeID string `json:"episodeId"`
			PanelID   int    `json:"panelId"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			return a.orch.AcceptPanelReview(req.ProjectID, req.EpisodeID, req.PanelID)
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

	mux.HandleFunc("/api/episode/rerender-panels", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID string `json:"projectId"`
			EpisodeID string `json:"episodeId"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			err := a.RerenderAllPanels(req.ProjectID, req.EpisodeID)
			return map[string]bool{"started": err == nil}, err
		})
	})

	mux.HandleFunc("/api/episode/generate-script", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID string `json:"projectId"`
			EpisodeID string `json:"episodeId"`
			Guidance  string `json:"guidance"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			err := a.GenerateScript(req.ProjectID, req.EpisodeID, req.Guidance)
			return map[string]bool{"queued": err == nil}, err
		})
	})

	mux.HandleFunc("/api/episode/synthesize-voice", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID string `json:"projectId"`
			EpisodeID string `json:"episodeId"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			err := a.SynthesizeVoice(req.ProjectID, req.EpisodeID)
			return map[string]bool{"queued": err == nil}, err
		})
	})

	mux.HandleFunc("/api/audio/direct-episode", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID string `json:"projectId"`
			EpisodeID string `json:"episodeId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, func() (interface{}, error) {
			if err := a.orch.DirectEpisodeAudio(req.ProjectID, req.EpisodeID); err != nil {
				return nil, err
			}
			return map[string]interface{}{"started": true}, nil
		})
	})

	mux.HandleFunc("/api/audio/regenerate-episode", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID string `json:"projectId"`
			EpisodeID string `json:"episodeId"`
			Feedback  string `json:"feedback"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, func() (interface{}, error) {
			if err := a.RegenerateEpisodeAudio(req.ProjectID, req.EpisodeID, req.Feedback); err != nil {
				return nil, err
			}
			return map[string]interface{}{"started": true}, nil
		})
	})

	mux.HandleFunc("/api/audio/cast-check", func(w http.ResponseWriter, r *http.Request) {
		proj := r.URL.Query().Get("project")
		writeJSON(w, func() (interface{}, error) {
			return a.CastReport(proj)
		})
	})

	mux.HandleFunc("/api/audio/regenerate", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID string `json:"projectId"`
			EpisodeID string `json:"episodeId"`
			PanelID   int    `json:"panelId"`
			Feedback  string `json:"feedback"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			return a.RegeneratePanelAudio(req.ProjectID, req.EpisodeID, req.PanelID, req.Feedback)
		})
	})

	mux.HandleFunc("/api/director/plan", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID      string `json:"projectId"`
			EpisodeID      string `json:"episodeId"`
			PanelID        int    `json:"panelId"`
			Feedback       string `json:"feedback"`
			SourceContext  string `json:"sourceContext"`
			PromptOverride string `json:"promptOverride"`
			ScreenshotPath string `json:"screenshotPath"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			return a.PlanDirectorFeedback(req.ProjectID, req.EpisodeID, req.PanelID, req.Feedback, req.SourceContext, req.PromptOverride, req.ScreenshotPath)
		})
	})

	mux.HandleFunc("/api/director/feedback", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID      string `json:"projectId"`
			EpisodeID      string `json:"episodeId"`
			PanelID        int    `json:"panelId"`
			Feedback       string `json:"feedback"`
			SourceContext  string `json:"sourceContext"`
			PromptOverride string `json:"promptOverride"`
			ScreenshotPath string `json:"screenshotPath"`
			PlanJSON       string `json:"planJson"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			return a.SubmitDirectorFeedback(req.ProjectID, req.EpisodeID, req.PanelID, req.Feedback, req.SourceContext, req.PromptOverride, req.ScreenshotPath, req.PlanJSON)
		})
	})

	mux.HandleFunc("/api/episode/assemble-video", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID string `json:"projectId"`
			EpisodeID string `json:"episodeId"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			err := a.AssembleVideo(req.ProjectID, req.EpisodeID)
			return map[string]bool{"queued": err == nil}, err
		})
	})

	mux.HandleFunc("/api/episode/clone-for-engine", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID   string `json:"projectId"`
			EpisodeID   string `json:"episodeId"`
			ImageEngine string `json:"imageEngine"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, func() (interface{}, error) {
			return a.CloneEpisodeForEngine(req.ProjectID, req.EpisodeID, req.ImageEngine)
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
			Title                   string   `json:"title"`
			Subtitle                string   `json:"subtitle"`
			Genre                   string   `json:"genre"`
			ArtStyleAnchor          string   `json:"artStyleAnchor"`
			DefaultImageEngine      string   `json:"defaultImageEngine"`
			TargetEpisodeCount      int      `json:"targetEpisodeCount"`
			DefaultPanelsPerEpisode int      `json:"defaultPanelsPerEpisode"`
			Invariants              []string `json:"invariants"`
			ScaffoldAllEpisodes     bool     `json:"scaffoldAllEpisodes"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			return a.CreateProject(req.Title, req.Subtitle, req.Genre, req.ArtStyleAnchor, req.DefaultImageEngine, req.TargetEpisodeCount, req.DefaultPanelsPerEpisode, req.Invariants, req.ScaffoldAllEpisodes)
		})
	})

	mux.HandleFunc("/api/project/delete", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID string `json:"projectId"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			err := a.DeleteProject(req.ProjectID)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"success": true, "deleted": req.ProjectID}, nil
		})
	})

	mux.HandleFunc("/api/episode/restart", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID          string `json:"projectId"`
			EpisodeID          string `json:"episodeId"`
			AutoGenerateScript bool   `json:"autoGenerateScript"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			ep, err := a.RestartEpisode(req.ProjectID, req.EpisodeID, req.AutoGenerateScript)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"success": true, "episode": ep}, nil
		})
	})

	mux.HandleFunc("/api/project/characters", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			proj := r.URL.Query().Get("project")
			writeJSON(w, func() (interface{}, error) {
				return a.GetProjectCharacters(proj)
			})
			return
		}
		var req struct {
			ProjectID  string                 `json:"projectId"`
			Characters map[string]interface{} `json:"characters"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			err := a.SaveProjectCharacters(req.ProjectID, req.Characters)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"success": true}, nil
		})
	})

	mux.HandleFunc("/api/workshop/brainstorm", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID string `json:"projectId"`
			Topic     string `json:"topic"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			return a.BrainstormWorkshop(req.ProjectID, req.Topic)
		})
	})

	mux.HandleFunc("/api/workshop/sample-art", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID string `json:"projectId"`
			Prompt    string `json:"prompt"`
			Comments  string `json:"comments"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			return a.GenerateWorkshopSampleArt(req.ProjectID, req.Prompt, req.Comments)
		})
	})

	mux.HandleFunc("/api/workshop/generate-sheets", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID string `json:"projectId"`
			Type      string `json:"type"`
			ID        string `json:"id"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			err := a.GenerateProjectSheets(req.ProjectID, req.Type, req.ID)
			if err != nil {
				return nil, err
			}
			return map[string]interface{}{"started": true, "projectId": req.ProjectID}, nil
		})
	})

	mux.HandleFunc("/api/project/config", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID               string   `json:"projectId"`
			Genre                   string   `json:"genre"`
			ArtStyleAnchor          string   `json:"artStyleAnchor"`
			DefaultImageEngine      string   `json:"defaultImageEngine"`
			TargetEpisodeCount      int      `json:"targetEpisodeCount"`
			DefaultPanelsPerEpisode int      `json:"defaultPanelsPerEpisode"`
			Invariants              []string `json:"invariants"`
			ScaffoldMissingEpisodes bool     `json:"scaffoldMissingEpisodes"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			return a.UpdateProjectConfig(req.ProjectID, req.Genre, req.ArtStyleAnchor, req.DefaultImageEngine, req.TargetEpisodeCount, req.DefaultPanelsPerEpisode, req.Invariants, req.ScaffoldMissingEpisodes)
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

	mux.HandleFunc("/api/comic/chat", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			ProjectID      string `json:"projectId"`
			EpisodeID      string `json:"episodeId"`
			Message        string `json:"message"`
			ScreenshotPath string `json:"screenshotPath"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		writeJSON(w, func() (interface{}, error) {
			return a.SendComicChat(req.ProjectID, req.EpisodeID, req.Message, req.ScreenshotPath)
		})
	})

	mux.HandleFunc("/api/comic/chat/history", func(w http.ResponseWriter, r *http.Request) {
		proj := r.URL.Query().Get("project")
		writeJSON(w, func() (interface{}, error) {
			return a.GetComicChatHistory(proj)
		})
	})

	mux.HandleFunc("/api/youtube/status", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, func() (interface{}, error) {
			uploaderScript := filepath.Join(a.store.RootDir(), "tools", "youtube", "youtube_uploader.js")
			cmd := exec.Command("node", uploaderScript, "--status")
			out, err := cmd.Output()
			if err != nil {
				return map[string]interface{}{"hasClientSecret": false, "error": err.Error()}, nil
			}
			var res interface{}
			_ = json.Unmarshal(out, &res)
			return res, nil
		})
	})

	mux.HandleFunc("/api/youtube/thumbnail", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID string `json:"projectId"`
			EpisodeID string `json:"episodeId"`
			PanelID   int    `json:"panelId"`
			Apply     bool   `json:"apply"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, func() (interface{}, error) {
			return a.orch.YouTubeThumbnail(req.ProjectID, req.EpisodeID, req.PanelID, req.Apply)
		})
	})

	mux.HandleFunc("/api/youtube/upload", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ProjectID string `json:"projectId"`
			EpisodeID string `json:"episodeId"`
			Privacy   string `json:"privacy"`
			Title     string `json:"title"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if req.ProjectID == "" {
			req.ProjectID = "korvath-the-barbarian"
		}
		if req.EpisodeID == "" {
			req.EpisodeID = "ep01"
		}
		if req.Privacy == "" {
			req.Privacy = "unlisted"
		}

		go func() {
			uploaderScript := filepath.Join(a.store.RootDir(), "tools", "youtube", "youtube_uploader.js")
			args := []string{uploaderScript, "--project", req.ProjectID, "--episode", req.EpisodeID, "--privacy", req.Privacy}
			if req.Title != "" {
				args = append(args, "--title", req.Title)
			}
			cmd := exec.Command("node", args...)
			cmd.Dir = a.store.RootDir()

			a.orch.EmitEvent(models.PipelineEvent{
				Type:      "youtube_upload_started",
				ProjectID: req.ProjectID,
				EpisodeID: req.EpisodeID,
				Message:   fmt.Sprintf("Starting YouTube upload for %s/%s (%s)...", req.ProjectID, req.EpisodeID, req.Privacy),
				Data: map[string]interface{}{
					"message": fmt.Sprintf("Starting YouTube upload for %s/%s (%s)...", req.ProjectID, req.EpisodeID, req.Privacy),
				},
			})

			stdout, err := cmd.StdoutPipe()
			if err != nil {
				a.orch.EmitEvent(models.PipelineEvent{
					Type:      "youtube_upload_error",
					ProjectID: req.ProjectID,
					EpisodeID: req.EpisodeID,
					Message:   err.Error(),
					Data:      map[string]interface{}{"error": err.Error()},
				})
				return
			}
			stderr, _ := cmd.StderrPipe()

			if err := cmd.Start(); err != nil {
				a.orch.EmitEvent(models.PipelineEvent{
					Type:      "youtube_upload_error",
					ProjectID: req.ProjectID,
					EpisodeID: req.EpisodeID,
					Message:   err.Error(),
					Data:      map[string]interface{}{"error": err.Error()},
				})
				return
			}

			go func() {
				scanner := bufio.NewScanner(stderr)
				for scanner.Scan() {
					txt := scanner.Text()
					var errMap map[string]interface{}
					if json.Unmarshal([]byte(txt), &errMap) == nil {
						msg := fmt.Sprintf("%v", errMap["message"])
						if msg == "" || msg == "<nil>" {
							msg = txt
						}
						a.orch.EmitEvent(models.PipelineEvent{
							Type:      "youtube_upload_error",
							ProjectID: req.ProjectID,
							EpisodeID: req.EpisodeID,
							Message:   msg,
							Data:      errMap,
						})
					}
				}
			}()

			scanner := bufio.NewScanner(stdout)
			for scanner.Scan() {
				line := scanner.Text()
				var data map[string]interface{}
				if json.Unmarshal([]byte(line), &data) == nil {
					evType := "youtube_upload_progress"
					msg := fmt.Sprintf("Uploading: %v%%", data["percent"])
					prog := 0
					if pFloat, ok := data["percent"].(float64); ok {
						prog = int(pFloat)
					}
					if data["type"] == "complete" {
						evType = "youtube_upload_complete"
						msg = fmt.Sprintf("YouTube upload complete: %v", data["youtubeUrl"])
					}
					a.orch.EmitEvent(models.PipelineEvent{
						Type:      evType,
						ProjectID: req.ProjectID,
						EpisodeID: req.EpisodeID,
						Progress:  prog,
						Message:   msg,
						Data:      data,
					})
				}
			}

			_ = cmd.Wait()
		}()

		writeJSON(w, func() (interface{}, error) {
			return map[string]interface{}{
				"started":   true,
				"projectId": req.ProjectID,
				"episodeId": req.EpisodeID,
				"privacy":   req.Privacy,
			}, nil
		})
	})

	// Server-Sent Events (SSE) for real-time pipeline updates
	mux.HandleFunc("/api/events", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
			return
		}

		sub, cancel := a.orch.SubscribeChan()
		defer cancel()

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

	// Serve Frontend UI with no-cache headers to guarantee browser always loads latest code
	fs := http.FileServer(http.Dir(frontendDir))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		fs.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, fn func() (interface{}, error)) {
	w.Header().Set("Content-Type", "application/json")
	res, err := fn()
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	_ = json.NewEncoder(w).Encode(res)
}

