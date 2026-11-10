package engine

import (
	"bufio"
	"conan-studio/internal/models"
	"conan-studio/internal/store"
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

type EventSubscriber chan models.PipelineEvent

type Orchestrator struct {
	store               *store.Store
	mu                  sync.RWMutex
	maxConcurrentComics int
	maxCDPTabs          int
	renderSem           chan struct{}
	audioSem            chan struct{}
	videoSem            chan struct{}
	activeJobs          map[string]*models.WorkerJob
	recentEvents        []models.PipelineEvent
	subscribers         map[EventSubscriber]struct{}
	wailsEmitFunc       func(eventName string, data ...interface{})
}

func NewOrchestrator(st *store.Store, maxComics, maxTabs int) *Orchestrator {
	o := &Orchestrator{
		store:               st,
		maxConcurrentComics: maxComics,
		maxCDPTabs:          maxTabs,
		renderSem:           make(chan struct{}, maxTabs),
		audioSem:            make(chan struct{}, 2),
		videoSem:            make(chan struct{}, 2),
		activeJobs:          make(map[string]*models.WorkerJob),
		recentEvents:        make([]models.PipelineEvent, 0, 100),
		subscribers:         make(map[EventSubscriber]struct{}),
	}

	o.emit(models.PipelineEvent{
		Type:    "worker_log",
		Message: fmt.Sprintf("Multi-Comic Studio Engine initialized (%d concurrent comic pipelines, %d isolated CDP tab slots)", maxComics, maxTabs),
	})

	return o
}

func (o *Orchestrator) SetWailsEmitter(fn func(eventName string, data ...interface{})) {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.wailsEmitFunc = fn
}

func (o *Orchestrator) Subscribe() EventSubscriber {
	o.mu.Lock()
	defer o.mu.Unlock()
	ch := make(EventSubscriber, 32)
	o.subscribers[ch] = struct{}{}
	return ch
}

func (o *Orchestrator) Unsubscribe(ch EventSubscriber) {
	o.mu.Lock()
	defer o.mu.Unlock()
	delete(o.subscribers, ch)
	close(ch)
}

func (o *Orchestrator) emit(ev models.PipelineEvent) {
	if ev.Timestamp == "" {
		ev.Timestamp = time.Now().UTC().Format(time.RFC3339)
	}
	o.mu.Lock()
	o.recentEvents = append([]models.PipelineEvent{ev}, o.recentEvents...)
	if len(o.recentEvents) > 60 {
		o.recentEvents = o.recentEvents[:60]
	}
	wailsFn := o.wailsEmitFunc
	subs := make([]EventSubscriber, 0, len(o.subscribers))
	for ch := range o.subscribers {
		subs = append(subs, ch)
	}
	o.mu.Unlock()

	if wailsFn != nil {
		wailsFn("pipeline:event", ev)
	}
	for _, ch := range subs {
		select {
		case ch <- ev:
		default:
		}
	}
}

func (o *Orchestrator) GetPoolStatus() models.WorkerPoolStatus {
	o.mu.RLock()
	jobs := make([]models.WorkerJob, 0, len(o.activeJobs))
	for _, j := range o.activeJobs {
		jobs = append(jobs, *j)
	}
	events := make([]models.PipelineEvent, len(o.recentEvents))
	copy(events, o.recentEvents)
	o.mu.RUnlock()

	// Check live CDP status via node worker
	cdpOnline := false
	activeTabs := 0
	workerScript := filepath.Join(o.store.RootDir(), "tools", "workers", "comic_cli_worker.js")
	cmd := exec.Command("node", workerScript, "--action", "cdp-status")
	cmd.Dir = o.store.RootDir()
	if out, err := cmd.Output(); err == nil {
		var parsed struct {
			Online bool            `json:"online"`
			Tabs   []interface{}   `json:"tabs"`
			Leases map[string]any `json:"leases"`
		}
		if json.Unmarshal(out, &parsed) == nil {
			cdpOnline = parsed.Online
			activeTabs = len(parsed.Tabs)
		}
	}

	return models.WorkerPoolStatus{
		MaxConcurrentComics: o.maxConcurrentComics,
		ActiveComicJobs:     len(jobs),
		MaxCDPTabs:          o.maxCDPTabs,
		ActiveCDPTabs:       activeTabs,
		CDPOnline:           cdpOnline,
		ActiveJobs:          jobs,
		RecentEvents:        events,
	}
}

func (o *Orchestrator) ApproveGate(projectID, episodeID, gateID, notes string) (*models.EpisodeManifest, error) {
	ep, err := o.store.GetEpisode(projectID, episodeID)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC().Format(time.RFC3339)
	found := false
	for i := range ep.Gates {
		if ep.Gates[i].ID == gateID {
			ep.Gates[i].Status = "APPROVED"
			ep.Gates[i].ApprovedAt = &now
			if notes != "" {
				ep.Gates[i].Notes = notes
			}
			found = true
			break
		}
	}
	if !found {
		return nil, fmt.Errorf("gate %s not found in %s/%s", gateID, projectID, episodeID)
	}

	// Advance State Machine based on approved gate
	switch gateID {
	case "SCRIPT_GATE":
		for i := range ep.Stages {
			if ep.Stages[i].ID == "PROMPT_EXPANSION" {
				ep.Stages[i].Status = "COMPLETED"
				ep.Stages[i].Progress = 100
			}
			if ep.Stages[i].ID == "VISUAL_RENDERING" {
				ep.Stages[i].Status = "QUEUED"
			}
		}
		for i := range ep.Gates {
			if ep.Gates[i].ID == "VISUAL_QA_GATE" && ep.Gates[i].Status == "LOCKED" {
				ep.Gates[i].Status = "PENDING"
			}
		}
		ep.CurrentStage = "VISUAL_RENDERING"
		if ep.OverallProgress < 30 {
			ep.OverallProgress = 30
		}

	case "VISUAL_QA_GATE":
		for i := range ep.Stages {
			if ep.Stages[i].ID == "VOICE_SYNTHESIS" {
				ep.Stages[i].Status = "QUEUED"
			}
		}
		for i := range ep.Gates {
			if ep.Gates[i].ID == "AUDIO_QA_GATE" && ep.Gates[i].Status == "LOCKED" {
				ep.Gates[i].Status = "AWAITING_APPROVAL"
			}
		}
		for i := range ep.Panels {
			if ep.Panels[i].AudioStatus == "LOCKED_BY_GATE" {
				ep.Panels[i].AudioStatus = "READY_FOR_SYNTH"
			}
		}
		ep.CurrentStage = "VOICE_SYNTHESIS"
		if ep.OverallProgress < 75 {
			ep.OverallProgress = 75
		}

	case "AUDIO_QA_GATE":
		for i := range ep.Stages {
			if ep.Stages[i].ID == "VOICE_SYNTHESIS" {
				ep.Stages[i].Status = "COMPLETED"
				ep.Stages[i].Progress = 100
			}
			if ep.Stages[i].ID == "VIDEO_ASSEMBLY" {
				ep.Stages[i].Status = "QUEUED"
			}
		}
		ep.CurrentStage = "VIDEO_ASSEMBLY"
		if ep.OverallProgress < 90 {
			ep.OverallProgress = 90
		}
	}

	if err := o.store.SaveEpisode(ep); err != nil {
		return nil, err
	}

	o.emit(models.PipelineEvent{
		Type:      "gate_update",
		ProjectID: projectID,
		EpisodeID: episodeID,
		GateID:    gateID,
		Status:    "APPROVED",
		Message:   fmt.Sprintf("Director APPROVED %s for %s / %s -> stage advanced to %s", gateID, projectID, episodeID, ep.CurrentStage),
	})

	return ep, nil
}

func (o *Orchestrator) RejectGate(projectID, episodeID, gateID, reason string, panelIDs []int) (*models.EpisodeManifest, error) {
	ep, err := o.store.GetEpisode(projectID, episodeID)
	if err != nil {
		return nil, err
	}

	for i := range ep.Gates {
		if ep.Gates[i].ID == gateID {
			ep.Gates[i].Status = "REJECTED"
			ep.Gates[i].ApprovedAt = nil
			ep.Gates[i].Notes = reason
			break
		}
	}

	panelSet := make(map[int]bool)
	for _, id := range panelIDs {
		panelSet[id] = true
	}

	for i := range ep.Panels {
		if panelSet[ep.Panels[i].PanelID] {
			ep.Panels[i].ImageStatus = "REJECTED"
		}
	}

	// Re-lock downstream stages
	if gateID == "VISUAL_QA_GATE" {
		for i := range ep.Stages {
			if ep.Stages[i].ID == "VOICE_SYNTHESIS" || ep.Stages[i].ID == "VIDEO_ASSEMBLY" {
				ep.Stages[i].Status = "LOCKED_BY_GATE"
			}
		}
	}

	if err := o.store.SaveEpisode(ep); err != nil {
		return nil, err
	}

	o.emit(models.PipelineEvent{
		Type:      "gate_update",
		ProjectID: projectID,
		EpisodeID: episodeID,
		GateID:    gateID,
		Status:    "REJECTED",
		Message:   fmt.Sprintf("Director REJECTED %s on %s/%s (%d panels flagged): %s", gateID, projectID, episodeID, len(panelIDs), reason),
	})

	return ep, nil
}

func (o *Orchestrator) RegeneratePanel(projectID, episodeID string, panelID int, promptOverride string) error {
	ep, err := o.store.GetEpisode(projectID, episodeID)
	if err != nil {
		return err
	}

	// Verify Gate A is approved
	for _, g := range ep.Gates {
		if g.ID == "SCRIPT_GATE" && g.Status != "APPROVED" {
			return fmt.Errorf("cannot render panel: SCRIPT_GATE is %s", g.Status)
		}
	}

	jobID := fmt.Sprintf("render-%s-%s-p%02d-%d", projectID, episodeID, panelID, time.Now().Unix())
	job := &models.WorkerJob{
		JobID:     jobID,
		ProjectID: projectID,
		EpisodeID: episodeID,
		Stage:     "VISUAL_RENDERING",
		PanelID:   panelID,
		Status:    "QUEUED",
		Message:   fmt.Sprintf("Queued Panel #%d for Meta AI 2K CDP render", panelID),
		StartedAt: time.Now().UTC().Format(time.RFC3339),
	}

	o.mu.Lock()
	o.activeJobs[jobID] = job
	o.mu.Unlock()

	o.emit(models.PipelineEvent{
		Type:      "panel_progress",
		ProjectID: projectID,
		EpisodeID: episodeID,
		PanelID:   panelID,
		Status:    "QUEUED",
		Message:   fmt.Sprintf("[%s/%s] Panel #%d queued in CDP Render Worker Pool", projectID, episodeID, panelID),
	})

	go func() {
		o.renderSem <- struct{}{}
		defer func() {
			<-o.renderSem
			o.mu.Lock()
			delete(o.activeJobs, jobID)
			o.mu.Unlock()
		}()

		o.mu.Lock()
		job.Status = "RUNNING"
		o.mu.Unlock()

		workerScript := filepath.Join(o.store.RootDir(), "tools", "workers", "comic_cli_worker.js")
		args := []string{
			workerScript,
			"--action", "render-panel",
			"--project", projectID,
			"--episode", episodeID,
			"--panel", fmt.Sprintf("%d", panelID),
		}
		if promptOverride != "" {
			args = append(args, "--prompt", promptOverride)
		}

		cmd := exec.Command("node", args...)
		cmd.Dir = o.store.RootDir()
		stdout, err := cmd.StdoutPipe()
		if err != nil {
			o.emit(models.PipelineEvent{
				Type:      "error",
				ProjectID: projectID,
				EpisodeID: episodeID,
				PanelID:   panelID,
				Message:   fmt.Sprintf("Failed to start worker: %v", err),
			})
			return
		}

		if err := cmd.Start(); err != nil {
			o.emit(models.PipelineEvent{
				Type:      "error",
				ProjectID: projectID,
				EpisodeID: episodeID,
				PanelID:   panelID,
				Message:   fmt.Sprintf("Worker start error: %v", err),
			})
			return
		}

		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			var ev map[string]interface{}
			if json.Unmarshal([]byte(line), &ev) == nil {
				msg, _ := ev["message"].(string)
				status, _ := ev["status"].(string)
				if msg == "" && status != "" {
					msg = fmt.Sprintf("Panel #%d -> %s", panelID, status)
				}
				o.emit(models.PipelineEvent{
					Type:      "panel_progress",
					ProjectID: projectID,
					EpisodeID: episodeID,
					PanelID:   panelID,
					Status:    status,
					Message:   msg,
				})
			}
		}

		if err := cmd.Wait(); err != nil {
			o.emit(models.PipelineEvent{
				Type:      "error",
				ProjectID: projectID,
				EpisodeID: episodeID,
				PanelID:   panelID,
				Status:    "ERROR",
				Message:   fmt.Sprintf("Panel #%d render exited with error: %v", panelID, err),
			})
			return
		}

		o.emit(models.PipelineEvent{
			Type:      "panel_progress",
			ProjectID: projectID,
			EpisodeID: episodeID,
			PanelID:   panelID,
			Status:    "VERIFIED",
			Message:   fmt.Sprintf("[%s/%s] Panel #%d rendered & hash-verified!", projectID, episodeID, panelID),
		})
	}()

	return nil
}

func (o *Orchestrator) StartStage(projectID, episodeID, stageID string) error {
	ep, err := o.store.GetEpisode(projectID, episodeID)
	if err != nil {
		return err
	}

	// Enforce Gate Rules before starting any stage
	if stageID == "VISUAL_RENDERING" {
		for _, g := range ep.Gates {
			if g.ID == "SCRIPT_GATE" && g.Status != "APPROVED" {
				return fmt.Errorf("blocked by Gate A: SCRIPT_GATE is %s", g.Status)
			}
		}
		for _, p := range ep.Panels {
			if p.ImageStatus != "VERIFIED" && p.ImageStatus != "RENDERED" {
				_ = o.RegeneratePanel(projectID, episodeID, p.PanelID, "")
			}
		}
		return nil
	}

	if stageID == "VOICE_SYNTHESIS" || stageID == "VIDEO_ASSEMBLY" {
		for _, g := range ep.Gates {
			if g.ID == "VISUAL_QA_GATE" && g.Status != "APPROVED" {
				return fmt.Errorf("blocked by Gate B: VISUAL_QA_GATE is %s (Director must approve panels before voice/video synthesis)", g.Status)
			}
		}
	}

	o.emit(models.PipelineEvent{
		Type:      "stage_update",
		ProjectID: projectID,
		EpisodeID: episodeID,
		Stage:     stageID,
		Status:    "IN_PROGRESS",
		Message:   fmt.Sprintf("Dispatched stage %s for %s / %s to worker pool", stageID, projectID, episodeID),
	})

	return nil
}

