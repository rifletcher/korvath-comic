package engine

import (
	"bufio"
	"bytes"
	"conan-studio/internal/eventbus"
	"conan-studio/internal/models"
	"conan-studio/internal/store"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Orchestrator struct {
	store               *store.Store
	bus                 *eventbus.Bus
	mu                  sync.RWMutex
	manifestMu          sync.Mutex
	queueMu             sync.Mutex
	queueCond           *sync.Cond
	queuePaused         bool
	cancelledAt         map[string]int64
	maxConcurrentComics int
	maxCDPTabs          int
	renderSem           chan struct{}
	renderQueue         chan func()
	audioSem            chan struct{}
	videoSem            chan struct{}
	activeJobs          map[string]*models.WorkerJob
	renderProcs         map[string]map[*exec.Cmd]struct{} // "project/episode" -> running panel render workers
	audioBusy           map[string]string                 // "project/episode" -> description of the running audio job
	wailsEmitFunc       func(eventName string, data ...interface{})
}

func NewOrchestrator(st *store.Store, maxComics, maxTabs int) *Orchestrator {
	o := &Orchestrator{
		store:               st,
		bus:                 eventbus.New(100),
		cancelledAt:         make(map[string]int64),
		maxConcurrentComics: maxComics,
		maxCDPTabs:          maxTabs,
		renderSem:           make(chan struct{}, maxTabs),
		renderQueue:         make(chan func(), 256),
		audioSem:            make(chan struct{}, 2),
		videoSem:            make(chan struct{}, 2),
		activeJobs:          make(map[string]*models.WorkerJob),
		renderProcs:         make(map[string]map[*exec.Cmd]struct{}),
		audioBusy:           make(map[string]string),
	}
	o.queueCond = sync.NewCond(&o.queueMu)

	for i := 0; i < maxTabs; i++ {
		go func() {
			for task := range o.renderQueue {
				if task != nil {
					task()
				}
			}
		}()
	}

	o.registerEventHandlers()

	o.bus.Publish(models.PipelineEvent{
		Type:    "worker_log",
		Message: fmt.Sprintf("Multi-Comic Studio EventBus Engine initialized (%d concurrent comic pipelines, %d isolated CDP tab slots)", maxComics, maxTabs),
	})

	return o
}

func (o *Orchestrator) registerEventHandlers() {
	// Declarative EventBus choreography: approving a gate automatically triggers the next stage
	o.bus.Subscribe("gate_update", func(ev models.PipelineEvent) {
		if ev.Status != "APPROVED" || ev.ProjectID == "" || ev.EpisodeID == "" {
			return
		}
		switch ev.GateID {
		case "SCRIPT_GATE":
			_ = o.StartStage(ev.ProjectID, ev.EpisodeID, "VISUAL_RENDERING")
		case "VISUAL_QA_GATE":
			_ = o.SynthesizeVoice(ev.ProjectID, ev.EpisodeID)
		case "AUDIO_QA_GATE":
			_ = o.AssembleVideo(ev.ProjectID, ev.EpisodeID)
		}
	})

	// Keep activeJobs progress & message synchronized from worker events on the Bus
	o.bus.Subscribe("*", func(ev models.PipelineEvent) {
		if ev.Progress <= 0 && ev.Message == "" {
			return
		}
		o.mu.Lock()
		for _, j := range o.activeJobs {
			if j.ProjectID == ev.ProjectID && j.EpisodeID == ev.EpisodeID &&
				(ev.Stage == "" || j.Stage == ev.Stage) &&
				(j.PanelID == 0 || ev.PanelID == 0 || j.PanelID == ev.PanelID) {
				if ev.Progress > 0 {
					j.Progress = ev.Progress
				}
				if ev.Message != "" {
					j.Message = ev.Message
				}
			}
		}
		o.mu.Unlock()
	})
}

func (o *Orchestrator) Bus() *eventbus.Bus {
	return o.bus
}

func (o *Orchestrator) SetWailsEmitter(fn func(eventName string, data ...interface{})) {
	o.mu.Lock()
	o.wailsEmitFunc = fn
	o.mu.Unlock()
	o.bus.Subscribe("*", func(ev models.PipelineEvent) {
		o.mu.RLock()
		wailsFn := o.wailsEmitFunc
		o.mu.RUnlock()
		if wailsFn != nil {
			wailsFn("pipeline:event", ev)
		}
	})
}

func (o *Orchestrator) SubscribeChan() (<-chan models.PipelineEvent, func()) {
	return o.bus.SubscribeChan("*", 64)
}

func (o *Orchestrator) emit(ev models.PipelineEvent) {
	o.bus.Publish(ev)
}

func (o *Orchestrator) EmitEvent(ev models.PipelineEvent) {
	o.bus.Publish(ev)
}

// runNodeWorker executes comic_cli_worker.js (or any node script) and publishes all JSON-line events onto the EventBus.
func (o *Orchestrator) runNodeWorker(job *models.WorkerJob, stage string, panelID int, args []string, sem chan struct{}, onSuccess func(), onDone ...func()) {
	go func() {
		for _, fn := range onDone {
			if fn != nil {
				defer fn()
			}
		}
		if sem != nil {
			sem <- struct{}{}
			defer func() { <-sem }()
		}
		defer func() {
			o.mu.Lock()
			delete(o.activeJobs, job.JobID)
			o.mu.Unlock()
		}()

		cmd := exec.Command("node", args...)
		cmd.Dir = o.store.RootDir()
		stdout, err := cmd.StdoutPipe()
		if err != nil {
			o.bus.Publish(models.PipelineEvent{
				Type:      "error",
				ProjectID: job.ProjectID,
				EpisodeID: job.EpisodeID,
				PanelID:   panelID,
				Stage:     stage,
				Message:   fmt.Sprintf("Failed to pipe worker (%s): %v", stage, err),
			})
			return
		}

		if err := cmd.Start(); err != nil {
			o.bus.Publish(models.PipelineEvent{
				Type:      "error",
				ProjectID: job.ProjectID,
				EpisodeID: job.EpisodeID,
				PanelID:   panelID,
				Stage:     stage,
				Message:   fmt.Sprintf("Worker start error (%s): %v", stage, err),
			})
			return
		}

		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for scanner.Scan() {
			line := scanner.Text()
			if panelID > 0 {
				o.applyWorkerEventToManifest(job.ProjectID, job.EpisodeID, panelID, line)
			}
			var ev map[string]interface{}
			if json.Unmarshal([]byte(line), &ev) == nil {
				evType, _ := ev["type"].(string)
				msg, _ := ev["message"].(string)
				if msg == "" {
					if errStr, ok := ev["error"].(string); ok && errStr != "" {
						msg = errStr
					}
				}
				status, _ := ev["status"].(string)
				prog, _ := ev["progress"].(float64)
				gateID, _ := ev["gateId"].(string)
				evStage, _ := ev["stage"].(string)
				if evStage == "" {
					evStage = stage
				}
				if evType == "" {
					evType = "worker_log"
				}
				o.bus.Publish(models.PipelineEvent{
					Type:      evType,
					ProjectID: job.ProjectID,
					EpisodeID: job.EpisodeID,
					PanelID:   panelID,
					GateID:    gateID,
					Stage:     evStage,
					Status:    status,
					Progress:  int(prog),
					Message:   msg,
					Data:      ev,
				})
			}
		}

		if err := cmd.Wait(); err != nil {
			o.bus.Publish(models.PipelineEvent{
				Type:      "error",
				ProjectID: job.ProjectID,
				EpisodeID: job.EpisodeID,
				PanelID:   panelID,
				Stage:     stage,
				Status:    "ERROR",
				Message:   fmt.Sprintf("Worker (%s) exited with error: %v", stage, err),
			})
			return
		}

		if onSuccess != nil {
			onSuccess()
		}
	}()
}

func (o *Orchestrator) GetPoolStatus() models.WorkerPoolStatus {
	o.mu.RLock()
	jobs := make([]models.WorkerJob, 0, len(o.activeJobs))
	for _, j := range o.activeJobs {
		jobs = append(jobs, *j)
	}
	o.mu.RUnlock()
	events := o.bus.Recent(60)

	// Check live CDP status via node worker
	cdpOnline := false
	activeTabs := 0
	workerScript := filepath.Join(o.store.RootDir(), "tools", "workers", "comic_cli_worker.js")
	cmd := exec.Command("node", workerScript, "--action", "cdp-status")
	cmd.Dir = o.store.RootDir()
	if out, err := cmd.Output(); err == nil {
		var parsed struct {
			Online bool           `json:"online"`
			Tabs   []interface{}  `json:"tabs"`
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
		QueuePaused:         o.IsQueuePaused(),
		ActiveJobs:          jobs,
		RecentEvents:        events,
	}
}

func (o *Orchestrator) verifyGateQualitySkill(projectID, episodeID, gateID string, ep *models.EpisodeManifest) error {
	root := o.store.RootDir()
	manifestRel := filepath.Join("projects", projectID, "episodes", episodeID, "manifest.json")
	projRel := filepath.Join("projects", projectID, "project.json")

	switch gateID {
	case "SCRIPT_GATE":
		scriptPath := filepath.Join(root, ".agents", "skills", "comic-writers-room-and-prompts", "scripts", "verify_storyboard_prompts.js")
		if _, err := os.Stat(scriptPath); err != nil {
			return fmt.Errorf("script audit unavailable: %s is missing, so the gate cannot be verified", scriptPath)
		}
		cmd := exec.Command("node", scriptPath, "--project", projRel, "--storyboard", manifestRel)
		cmd.Dir = root
		outBytes, err := cmd.CombinedOutput()
		if err != nil {
			return fmt.Errorf("verify_storyboard_prompts.js failed:\n%s", strings.TrimSpace(string(outBytes)))
		}

	case "VISUAL_QA_GATE":
		// Verify every panel is rendered & verified
		for _, p := range ep.Panels {
			if p.ImageStatus != "VERIFIED" && p.ImageStatus != "RENDERED" {
				return fmt.Errorf("panel #%d has status %q (all panels must be verified before Gate B approval)", p.PanelID, p.ImageStatus)
			}
		}

	case "AUDIO_QA_GATE":
		// Verify every panel has audio ready
		for _, p := range ep.Panels {
			if p.AudioStatus != "VERIFIED" && p.AudioStatus != "READY" {
				pad := fmt.Sprintf("%02d", p.PanelID)
				audioAbs := filepath.Join(root, "projects", projectID, "episodes", episodeID, "audio", fmt.Sprintf("p%s_mixed.wav", pad))
				if fi, err := os.Stat(audioAbs); err != nil || fi.Size() < 1000 {
					return fmt.Errorf("panel #%d voice audio not ready (status %q)", p.PanelID, p.AudioStatus)
				}
			}
		}

		// Every panel must be voiced by this comic's cast (no fallback voices, no stale actors).
		report, err := o.CastReport(projectID)
		if err != nil {
			return fmt.Errorf("cast check unavailable: %v", err)
		}
		if eps, ok := report["episodes"].([]interface{}); ok {
			for _, raw := range eps {
				e, _ := raw.(map[string]interface{})
				if e["episodeId"] != episodeID {
					continue
				}
				if off, _ := e["offCastPanels"].([]interface{}); len(off) > 0 {
					first, _ := off[0].(map[string]interface{})
					reasons, _ := first["reasons"].([]interface{})
					return fmt.Errorf("%d panel(s) were not voiced by this comic's cast (e.g. panel #%v: %v); use \"Re-voice panels that don't match the cast\" on the audio tab", len(off), first["panelId"], reasons)
				}
			}
		}

		scriptPath := filepath.Join(root, ".agents", "skills", "comic-voice-and-acoustic-qa", "scripts", "verify_voice_casting.js")
		regPath := filepath.Join("projects", projectID, "reference", "voice_registry.json")
		if _, err := os.Stat(filepath.Join(root, regPath)); err != nil {
			regPath = "00_Reference/voice_registry.json"
		}
		if _, err := os.Stat(scriptPath); err != nil {
			return fmt.Errorf("voice audit unavailable: %s is missing, so the gate cannot be verified", scriptPath)
		}
		cmd := exec.Command("node", scriptPath, "--storyboard", manifestRel, "--registry", regPath)
		cmd.Dir = root
		outBytes, err := cmd.CombinedOutput()
		if err != nil {
			return fmt.Errorf("verify_voice_casting.js failed:\n%s", strings.TrimSpace(string(outBytes)))
		}
	}

	return nil
}

func (o *Orchestrator) ApproveGate(projectID, episodeID, gateID, notes string) (*models.EpisodeManifest, error) {
	ep, err := o.store.GetEpisode(projectID, episodeID)
	if err != nil {
		return nil, err
	}

	// Enforce fail-closed Quality Skill Audit check before allowing gate approval
	if err := o.verifyGateQualitySkill(projectID, episodeID, gateID, ep); err != nil {
		return nil, fmt.Errorf("gate %s approval blocked by Quality Skill Audit: %w", gateID, err)
	}

	ep, err = o.store.UpdateEpisode(projectID, episodeID, func(ep *models.EpisodeManifest) error {
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
			return fmt.Errorf("gate %s not found in %s/%s", gateID, projectID, episodeID)
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
					ep.Stages[i].Status = "IN_PROGRESS"
					ep.Stages[i].Progress = 5
				}
			}
			for i := range ep.Gates {
				if ep.Gates[i].ID == "VISUAL_QA_GATE" {
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
					ep.Stages[i].Status = "IN_PROGRESS"
					ep.Stages[i].Progress = 5
				}
			}
			for i := range ep.Gates {
				if ep.Gates[i].ID == "AUDIO_QA_GATE" {
					ep.Gates[i].Status = "LOCKED"
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
					ep.Stages[i].Status = "IN_PROGRESS"
					ep.Stages[i].Progress = 5
				}
			}
			ep.CurrentStage = "VIDEO_ASSEMBLY"
			if ep.OverallProgress < 90 {
				ep.OverallProgress = 90
			}
		}

		return nil
	})
	if err != nil {
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

	ep, err = o.store.UpdateEpisode(projectID, episodeID, func(ep *models.EpisodeManifest) error {
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

		// Invalidate all downstream gates and stages
		o.InvalidateGatesFrom(ep, gateID, fmt.Sprintf("Gate %s rejected: %s", gateID, reason))
		// Ensure the rejected gate keeps its explicit "REJECTED" status
		for i := range ep.Gates {
			if ep.Gates[i].ID == gateID {
				ep.Gates[i].Status = "REJECTED"
				ep.Gates[i].Notes = reason
			}
		}

		return nil
	})
	if err != nil {
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

// InvalidateGatesFrom invalidates a gate and all downstream gates and stages when an asset or stage is regenerated.
func (o *Orchestrator) InvalidateGatesFrom(ep *models.EpisodeManifest, fromGateID, reason string) {
	gateOrder := []string{"SCRIPT_GATE", "VISUAL_QA_GATE", "AUDIO_QA_GATE"}
	startIdx := -1
	for idx, gid := range gateOrder {
		if gid == fromGateID {
			startIdx = idx
			break
		}
	}
	if startIdx == -1 {
		return
	}

	for i := startIdx; i < len(gateOrder); i++ {
		gid := gateOrder[i]
		for gIdx := range ep.Gates {
			if ep.Gates[gIdx].ID == gid {
				if i == startIdx {
					ep.Gates[gIdx].Status = "AWAITING_APPROVAL"
					ep.Gates[gIdx].ApprovedAt = nil
					ep.Gates[gIdx].Notes = reason
				} else {
					ep.Gates[gIdx].Status = "LOCKED"
					ep.Gates[gIdx].ApprovedAt = nil
					ep.Gates[gIdx].Notes = fmt.Sprintf("Locked until %s is approved.", gateOrder[i-1])
				}
			}
		}
	}

	// Relock downstream stages
	switch fromGateID {
	case "SCRIPT_GATE":
		for i := range ep.Stages {
			if ep.Stages[i].ID != "SCRIPT_GENERATION" {
				ep.Stages[i].Status = "LOCKED_BY_GATE"
				ep.Stages[i].Progress = 0
			}
		}
		ep.CurrentStage = "SCRIPT_GATE"

	case "VISUAL_QA_GATE":
		for i := range ep.Stages {
			if ep.Stages[i].ID == "VISUAL_RENDERING" {
				ep.Stages[i].Status = "IN_PROGRESS"
			} else if ep.Stages[i].ID == "VOICE_SYNTHESIS" || ep.Stages[i].ID == "VIDEO_ASSEMBLY" || ep.Stages[i].ID == "READY_FOR_RELEASE" {
				ep.Stages[i].Status = "LOCKED_BY_GATE"
			}
		}
		if ep.CurrentStage == "READY_FOR_RELEASE" || ep.CurrentStage == "VIDEO_ASSEMBLY" || ep.CurrentStage == "VOICE_SYNTHESIS" {
			ep.CurrentStage = "VISUAL_QA_GATE"
		}

	case "AUDIO_QA_GATE":
		for i := range ep.Stages {
			if ep.Stages[i].ID == "VOICE_SYNTHESIS" {
				ep.Stages[i].Status = "IN_PROGRESS"
			} else if ep.Stages[i].ID == "VIDEO_ASSEMBLY" || ep.Stages[i].ID == "READY_FOR_RELEASE" {
				ep.Stages[i].Status = "LOCKED_BY_GATE"
			}
		}
		if ep.CurrentStage == "READY_FOR_RELEASE" || ep.CurrentStage == "VIDEO_ASSEMBLY" {
			ep.CurrentStage = "AUDIO_QA_GATE"
		}
	}
}

func (o *Orchestrator) RegeneratePanel(projectID, episodeID string, panelID int, promptOverride, directorCorrection, screenshotPath, engineOverride string) error {
	gateReason := fmt.Sprintf("Panel #%d queued for regeneration — awaiting visual director re-inspection", panelID)
	o.manifestMu.Lock()
	_, err := o.store.UpdateEpisode(projectID, episodeID, func(ep *models.EpisodeManifest) error {
		// Verify Gate A is approved
		for _, g := range ep.Gates {
			if g.ID == "SCRIPT_GATE" && g.Status != "APPROVED" {
				return fmt.Errorf("cannot render panel: SCRIPT_GATE is %s", g.Status)
			}
		}

		// Mark panel QUEUED (only transitions to RENDERING when popped by the 1-at-a-time queue worker)
		for i := range ep.Panels {
			if ep.Panels[i].PanelID == panelID {
				ep.Panels[i].ImageStatus = "QUEUED"
				ep.Panels[i].Error = ""
				if promptOverride != "" {
					ep.Panels[i].Prompt = promptOverride
				}
				if engineOverride != "" {
					ep.Panels[i].ImageEngine = engineOverride
				}
				break
			}
		}

		o.InvalidateGatesFrom(ep, "VISUAL_QA_GATE", gateReason)
		return nil
	})
	o.manifestMu.Unlock()
	if err != nil {
		return err
	}

	o.emit(models.PipelineEvent{
		Type:      "gate_update",
		ProjectID: projectID,
		EpisodeID: episodeID,
		GateID:    "VISUAL_QA_GATE",
		Status:    "AWAITING_APPROVAL",
		Message:   gateReason,
	})
	o.emit(models.PipelineEvent{
		Type:      "gate_update",
		ProjectID: projectID,
		EpisodeID: episodeID,
		GateID:    "AUDIO_QA_GATE",
		Status:    "LOCKED",
		Message:   "Locked until Gate B (Visual QA) is approved",
	})

	enqueuedNano := time.Now().UnixNano()
	jobID := fmt.Sprintf("render-%s-%s-p%02d-%d", projectID, episodeID, panelID, enqueuedNano)
	job := &models.WorkerJob{
		JobID:     jobID,
		ProjectID: projectID,
		EpisodeID: episodeID,
		Stage:     "VISUAL_RENDERING",
		PanelID:   panelID,
		Status:    "QUEUED",
		Message:   fmt.Sprintf("Queued Panel #%d for AI Director refinement and render", panelID),
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
		Message:   fmt.Sprintf("[%s/%s] Panel #%d queued in Render Worker Pool", projectID, episodeID, panelID),
	})

	o.renderQueue <- func() {
		defer func() {
			o.mu.Lock()
			delete(o.activeJobs, jobID)
			o.mu.Unlock()
		}()

		o.waitIfPaused()
		if o.isJobCancelled(projectID, episodeID, enqueuedNano) {
			return
		}

		o.mu.Lock()
		job.Status = "RUNNING"
		o.mu.Unlock()

		// Transition panel from QUEUED -> RENDERING right as execution starts
		o.manifestMu.Lock()
		_, _ = o.store.UpdateEpisode(projectID, episodeID, func(curEp *models.EpisodeManifest) error {
			for i := range curEp.Panels {
				if curEp.Panels[i].PanelID == panelID {
					curEp.Panels[i].ImageStatus = "RENDERING"
					break
				}
			}
			return nil
		})
		o.manifestMu.Unlock()

		o.emit(models.PipelineEvent{
			Type:      "panel_progress",
			ProjectID: projectID,
			EpisodeID: episodeID,
			PanelID:   panelID,
			Status:    "RENDERING",
			Message:   fmt.Sprintf("[%s/%s] Starting Panel #%d render...", projectID, episodeID, panelID),
		})

		workerScript := filepath.Join(o.store.RootDir(), "tools", "workers", "comic_cli_worker.js")
		args := []string{
			workerScript,
			"--action", "render-panel",
			"--project", projectID,
			"--episode", episodeID,
			"--panel", fmt.Sprintf("%d", panelID),
			"--managed-by-go", "1",
		}
		if engineOverride != "" {
			args = append(args, "--engine", engineOverride)
		}
		if promptOverride != "" {
			args = append(args, "--prompt", promptOverride)
		}
		if directorCorrection != "" {
			args = append(args, "--correction", directorCorrection)
		}
		if screenshotPath != "" {
			args = append(args, "--screenshot", screenshotPath)
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
		untrack := o.trackRenderProc(projectID, episodeID, cmd)
		defer untrack()

		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for scanner.Scan() {
			line := scanner.Text()
			o.applyWorkerEventToManifest(projectID, episodeID, panelID, line)
			var ev map[string]interface{}
			if json.Unmarshal([]byte(line), &ev) == nil {
				evType, _ := ev["type"].(string)
				msg, _ := ev["message"].(string)
				status, _ := ev["status"].(string)
				if msg == "" && status != "" {
					msg = fmt.Sprintf("Panel #%d -> %s", panelID, status)
				}
				if msg == "" {
					if errMsg, ok := ev["error"].(string); ok && errMsg != "" {
						msg = errMsg
					}
				}
				busType := evType
				if busType == "" {
					busType = "panel_progress"
				}
				o.emit(models.PipelineEvent{
					Type:      busType,
					ProjectID: projectID,
					EpisodeID: episodeID,
					PanelID:   panelID,
					Status:    status,
					Message:   msg,
					Data:      ev,
				})
				if evType == "panel_failed" {
					o.emit(models.PipelineEvent{
						Type:      "error",
						ProjectID: projectID,
						EpisodeID: episodeID,
						PanelID:   panelID,
						Status:    "ERROR",
						Message:   msg,
						Data:      ev,
					})
				}
			}
		}

		if err := cmd.Wait(); err != nil {
			if o.isJobCancelled(projectID, episodeID, enqueuedNano) {
				o.emit(models.PipelineEvent{
					Type:      "worker_log",
					ProjectID: projectID,
					EpisodeID: episodeID,
					PanelID:   panelID,
					Status:    "CANCELLED",
					Message:   fmt.Sprintf("Panel #%d render stopped by queue cancel.", panelID),
				})
				return
			}
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
	}

	return nil
}

func (o *Orchestrator) StartStage(projectID, episodeID, stageID string) error {
	ep, err := o.store.GetEpisode(projectID, episodeID)
	if err != nil {
		return err
	}

	// Enforce Gate Rules and invalidate downstream gates when restarting a stage
	if stageID == "SCRIPT_GENERATION" {
		return o.GenerateScript(projectID, episodeID, "")
	} else if stageID == "VISUAL_RENDERING" {
		for _, g := range ep.Gates {
			if g.ID == "SCRIPT_GATE" && g.Status != "APPROVED" {
				return fmt.Errorf("blocked by Gate A: SCRIPT_GATE is %s", g.Status)
			}
		}
		o.InvalidateGatesFrom(ep, "VISUAL_QA_GATE", "Stage VISUAL_RENDERING restarted — awaiting visual director re-inspection")
		_ = o.store.SaveEpisode(ep)
		for _, p := range ep.Panels {
			if p.ImageStatus != "VERIFIED" && p.ImageStatus != "RENDERED" {
				_ = o.RegeneratePanel(projectID, episodeID, p.PanelID, "", "", "", "")
			}
		}
		return nil
	} else if stageID == "VOICE_SYNTHESIS" {
		for _, g := range ep.Gates {
			if g.ID == "VISUAL_QA_GATE" && g.Status != "APPROVED" {
				return fmt.Errorf("blocked by Gate B: VISUAL_QA_GATE is %s (Director must approve panels before voice/video synthesis)", g.Status)
			}
		}
		o.InvalidateGatesFrom(ep, "AUDIO_QA_GATE", "Stage VOICE_SYNTHESIS restarted — awaiting audio QA approval")
		_ = o.store.SaveEpisode(ep)
		return o.SynthesizeVoice(projectID, episodeID)
	} else if stageID == "VIDEO_ASSEMBLY" {
		for _, g := range ep.Gates {
			if g.ID == "AUDIO_QA_GATE" && g.Status != "APPROVED" {
				return fmt.Errorf("blocked by Gate C: AUDIO_QA_GATE is %s (Director must approve audio before video assembly)", g.Status)
			}
		}
		for i := range ep.Stages {
			if ep.Stages[i].ID == "READY_FOR_RELEASE" {
				ep.Stages[i].Status = "LOCKED_BY_GATE"
			}
		}
		_ = o.store.SaveEpisode(ep)
		return o.AssembleVideo(projectID, episodeID)
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

func (o *Orchestrator) GenerateScript(projectID, episodeID, guidance string) error {
	ep, err := o.store.GetEpisode(projectID, episodeID)
	if err != nil {
		return err
	}

	jobID := fmt.Sprintf("script-%s-%s-%d", projectID, episodeID, time.Now().Unix())
	job := &models.WorkerJob{
		JobID:     jobID,
		ProjectID: projectID,
		EpisodeID: episodeID,
		Stage:     "SCRIPT_GENERATION",
		Status:    "RUNNING",
		Message:   fmt.Sprintf("[%s/%s] AI Writers' Room generating 3-Act screenplay...", projectID, episodeID),
		StartedAt: time.Now().UTC().Format(time.RFC3339),
	}

	o.mu.Lock()
	o.activeJobs[jobID] = job
	o.mu.Unlock()

	o.emit(models.PipelineEvent{
		Type:      "stage_update",
		ProjectID: projectID,
		EpisodeID: episodeID,
		Stage:     "SCRIPT_GENERATION",
		Status:    "IN_PROGRESS",
		Message:   fmt.Sprintf("[%s/%s] AI Writers' Room convening to author %d-panel screenplay...", projectID, episodeID, ep.TargetPanelCount),
	})

	go func() {
		defer func() {
			o.mu.Lock()
			delete(o.activeJobs, jobID)
			o.mu.Unlock()
		}()

		workerScript := filepath.Join(o.store.RootDir(), "tools", "workers", "comic_cli_worker.js")
		args := []string{
			workerScript,
			"--action", "generate-script",
			"--project", projectID,
			"--episode", episodeID,
		}
		if guidance != "" {
			args = append(args, "--guidance", guidance)
		}

		cmd := exec.Command("node", args...)
		cmd.Dir = o.store.RootDir()
		var stderrBuf bytes.Buffer
		cmd.Stderr = &stderrBuf

		stdout, err := cmd.StdoutPipe()
		if err != nil {
			o.emit(models.PipelineEvent{
				Type:      "error",
				ProjectID: projectID,
				EpisodeID: episodeID,
				Message:   fmt.Sprintf("Failed to start script generator: %v", err),
			})
			return
		}

		if err := cmd.Start(); err != nil {
			o.emit(models.PipelineEvent{
				Type:      "error",
				ProjectID: projectID,
				EpisodeID: episodeID,
				Message:   fmt.Sprintf("Script generator start error: %v", err),
			})
			return
		}

		workerErr := ""
		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for scanner.Scan() {
			line := scanner.Text()
			var ev map[string]interface{}
			if json.Unmarshal([]byte(line), &ev) == nil {
				msg, _ := ev["message"].(string)
				if t, _ := ev["type"].(string); t == "error" {
					if e, _ := ev["error"].(string); e != "" {
						workerErr = e
					}
					continue
				}
				if msg == "" {
					continue
				}
				o.emit(models.PipelineEvent{
					Type:      "script_progress",
					ProjectID: projectID,
					EpisodeID: episodeID,
					Stage:     "SCRIPT_GENERATION",
					Status:    "IN_PROGRESS",
					Message:   msg,
				})
			}
		}

		if err := cmd.Wait(); err != nil {
			reason := workerErr
			if reason == "" {
				reason = strings.TrimSpace(stderrBuf.String())
				if len(reason) > 400 {
					reason = reason[len(reason)-400:]
				}
			}
			if reason == "" {
				reason = err.Error()
			}
			o.emit(models.PipelineEvent{
				Type:      "error",
				ProjectID: projectID,
				EpisodeID: episodeID,
				Stage:     "SCRIPT_GENERATION",
				Status:    "FAILED",
				Message:   "Writers' Room failed: " + reason,
			})
			return
		}

		o.emit(models.PipelineEvent{
			Type:      "stage_update",
			ProjectID: projectID,
			EpisodeID: episodeID,
			Stage:     "SCRIPT_GENERATION",
			Status:    "COMPLETED",
			Message:   fmt.Sprintf("[%s/%s] AI Writers' Room completed full screenplay!", projectID, episodeID),
		})
		o.emit(models.PipelineEvent{
			Type:      "gate_update",
			ProjectID: projectID,
			EpisodeID: episodeID,
			GateID:    "SCRIPT_GATE",
			Status:    "AWAITING_APPROVAL",
			Message:   "Screenplay complete — awaiting Gate A approval",
		})
	}()

	return nil
}

func (o *Orchestrator) SynthesizeVoice(projectID, episodeID string) error {
	ep, err := o.store.GetEpisode(projectID, episodeID)
	if err != nil {
		return err
	}

	for _, g := range ep.Gates {
		if g.ID == "VISUAL_QA_GATE" && g.Status != "APPROVED" {
			return fmt.Errorf("blocked by Gate B: VISUAL_QA_GATE is %s (Director must approve panels before voice synthesis)", g.Status)
		}
	}

	release, err := o.claimAudio(projectID, episodeID, "voice synthesis")
	if err != nil {
		return err
	}

	jobID := fmt.Sprintf("voice-%s-%s-%d", projectID, episodeID, time.Now().Unix())
	job := &models.WorkerJob{
		JobID:     jobID,
		ProjectID: projectID,
		EpisodeID: episodeID,
		Stage:     "VOICE_SYNTHESIS",
		Status:    "RUNNING",
		Progress:  5,
		Message:   fmt.Sprintf("[%s/%s] Multi-actor voice synthesis started", projectID, episodeID),
		StartedAt: time.Now().UTC().Format(time.RFC3339),
	}

	o.mu.Lock()
	o.activeJobs[jobID] = job
	o.mu.Unlock()

	for i := range ep.Stages {
		if ep.Stages[i].ID == "VOICE_SYNTHESIS" {
			ep.Stages[i].Status = "IN_PROGRESS"
			ep.Stages[i].Progress = 5
		}
	}
	_ = o.store.SaveEpisode(ep)

	o.emit(models.PipelineEvent{
		Type:      "stage_update",
		ProjectID: projectID,
		EpisodeID: episodeID,
		Stage:     "VOICE_SYNTHESIS",
		Status:    "IN_PROGRESS",
		Progress:  5,
		Message:   fmt.Sprintf("[%s/%s] Voice synthesis dispatched to audio worker", projectID, episodeID),
	})

	go func() {
		defer release()
		o.audioSem <- struct{}{}
		defer func() {
			<-o.audioSem
			o.mu.Lock()
			delete(o.activeJobs, jobID)
			o.mu.Unlock()
		}()

		workerScript := filepath.Join(o.store.RootDir(), "tools", "workers", "comic_cli_worker.js")
		cmd := exec.Command("node", workerScript,
			"--action", "synthesize-voice",
			"--project", projectID,
			"--episode", episodeID,
		)
		cmd.Dir = o.store.RootDir()
		stdout, err := cmd.StdoutPipe()
		if err != nil {
			o.emit(models.PipelineEvent{
				Type:      "error",
				ProjectID: projectID,
				EpisodeID: episodeID,
				Stage:     "VOICE_SYNTHESIS",
				Message:   fmt.Sprintf("Failed to pipe voice worker: %v", err),
			})
			return
		}

		if err := cmd.Start(); err != nil {
			o.emit(models.PipelineEvent{
				Type:      "error",
				ProjectID: projectID,
				EpisodeID: episodeID,
				Stage:     "VOICE_SYNTHESIS",
				Message:   fmt.Sprintf("Voice worker start error: %v", err),
			})
			return
		}

		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for scanner.Scan() {
			line := scanner.Text()
			var ev map[string]interface{}
			if json.Unmarshal([]byte(line), &ev) == nil {
				msg, _ := ev["message"].(string)
				status, _ := ev["status"].(string)
				prog, _ := ev["progress"].(float64)
				evType, _ := ev["type"].(string)
				if evType == "" {
					evType = "stage_update"
				}

				if prog > 0 {
					o.mu.Lock()
					job.Progress = int(prog)
					if msg != "" {
						job.Message = msg
					}
					o.mu.Unlock()
				}

				o.emit(models.PipelineEvent{
					Type:      evType,
					ProjectID: projectID,
					EpisodeID: episodeID,
					Stage:     "VOICE_SYNTHESIS",
					Status:    status,
					Progress:  int(prog),
					Message:   msg,
				})
			}
		}

		if err := cmd.Wait(); err != nil {
			o.emit(models.PipelineEvent{
				Type:      "error",
				ProjectID: projectID,
				EpisodeID: episodeID,
				Stage:     "VOICE_SYNTHESIS",
				Status:    "ERROR",
				Message:   fmt.Sprintf("Voice synthesis exited with error: %v", err),
			})
			return
		}

		_, _ = o.store.UpdateEpisode(projectID, episodeID, func(freshEp *models.EpisodeManifest) error {
			freshEp.CurrentStage = "AUDIO_QA_GATE"
			if freshEp.OverallProgress < 75 {
				freshEp.OverallProgress = 75
			}
			for i := range freshEp.Stages {
				if freshEp.Stages[i].ID == "VOICE_SYNTHESIS" {
					freshEp.Stages[i].Status = "COMPLETED"
					freshEp.Stages[i].Progress = 100
				}
			}
			for i := range freshEp.Gates {
				if freshEp.Gates[i].ID == "AUDIO_QA_GATE" {
					freshEp.Gates[i].Status = "AWAITING_APPROVAL"
					freshEp.Gates[i].Notes = "All voice tracks synthesized and mastered. Ready for 5-Point Acoustic QA approval."
				}
			}
			return nil
		})

		o.emit(models.PipelineEvent{
			Type:      "stage_update",
			ProjectID: projectID,
			EpisodeID: episodeID,
			Stage:     "VOICE_SYNTHESIS",
			Status:    "COMPLETED",
			Progress:  100,
			Message:   fmt.Sprintf("[%s/%s] Multi-actor Voice Synthesis 100%% Complete!", projectID, episodeID),
		})
		o.emit(models.PipelineEvent{
			Type:      "gate_update",
			ProjectID: projectID,
			EpisodeID: episodeID,
			GateID:    "AUDIO_QA_GATE",
			Status:    "AWAITING_APPROVAL",
			Message:   "Ready for 5-Point Acoustic & Polarity QA Gate inspection",
		})
	}()

	return nil
}

func (o *Orchestrator) RegeneratePanelAudio(projectID, episodeID string, panelID int, feedback string) (map[string]interface{}, error) {
	ep, err := o.store.GetEpisode(projectID, episodeID)
	if err != nil {
		return nil, err
	}

	for _, g := range ep.Gates {
		if g.ID == "VISUAL_QA_GATE" && g.Status != "APPROVED" {
			return nil, fmt.Errorf("blocked by Gate B: VISUAL_QA_GATE is %s (Director must approve panels before audio regeneration)", g.Status)
		}
	}

	release, err := o.claimAudio(projectID, episodeID, fmt.Sprintf("panel #%d audio", panelID))
	if err != nil {
		return nil, err
	}
	defer release()

	o.audioSem <- struct{}{}
	defer func() { <-o.audioSem }()

	workerScript := filepath.Join(o.store.RootDir(), "tools", "workers", "comic_cli_worker.js")
	args := []string{
		workerScript,
		"--action", "regenerate-audio",
		"--project", projectID,
		"--episode", episodeID,
		"--panel", fmt.Sprintf("%d", panelID),
	}
	if strings.TrimSpace(feedback) != "" {
		args = append(args, "--feedback", feedback)
	}

	cmd := exec.Command("node", args...)
	cmd.Dir = o.store.RootDir()
	out, err := cmd.CombinedOutput()

	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	var lastResult map[string]interface{}
	for _, line := range lines {
		var ev map[string]interface{}
		if json.Unmarshal([]byte(line), &ev) == nil {
			evType, _ := ev["type"].(string)
			msg, _ := ev["message"].(string)
			status, _ := ev["status"].(string)
			prog, _ := ev["progress"].(float64)
			if evType == "audio_panel_regenerated" {
				lastResult = ev
			}
			if evType != "" {
				o.emit(models.PipelineEvent{
					Type:      evType,
					ProjectID: projectID,
					EpisodeID: episodeID,
					PanelID:   panelID,
					Stage:     "VOICE_SYNTHESIS",
					Status:    status,
					Progress:  int(prog),
					Message:   msg,
				})
			}
		}
	}

	if err != nil {
		return nil, fmt.Errorf("audio regeneration failed: %v (%s)", err, string(out))
	}

	if lastResult == nil {
		lastResult = map[string]interface{}{
			"success":   true,
			"projectId": projectID,
			"episodeId": episodeID,
			"panelId":   panelID,
		}
	}
	return lastResult, nil
}

func (o *Orchestrator) PlanDirectorFeedback(projectID, episodeID string, panelID int, feedback, sourceContext, promptOverride, screenshotPath string) (map[string]interface{}, error) {
	if _, err := o.store.GetEpisode(projectID, episodeID); err != nil {
		return nil, err
	}

	workerScript := filepath.Join(o.store.RootDir(), "tools", "workers", "comic_cli_worker.js")
	args := []string{
		workerScript,
		"--action", "director-plan",
		"--project", projectID,
		"--episode", episodeID,
		"--panel", fmt.Sprintf("%d", panelID),
		"--source", sourceContext,
	}
	if strings.TrimSpace(feedback) != "" {
		args = append(args, "--feedback", feedback)
	}
	if strings.TrimSpace(promptOverride) != "" {
		args = append(args, "--prompt", promptOverride)
	}
	if strings.TrimSpace(screenshotPath) != "" {
		args = append(args, "--screenshot", screenshotPath)
	}

	// Stream the planner's progress to the UI (SSE) while it runs: planning can
	// take a minute or more when the AI director is thinking.
	cmd := exec.Command("node", args...)
	cmd.Dir = o.store.RootDir()
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("could not start the AI director: %v", err)
	}

	var preview map[string]interface{}
	workerError := ""
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		var ev map[string]interface{}
		if json.Unmarshal([]byte(scanner.Text()), &ev) != nil {
			continue
		}
		switch ev["type"] {
		case "director_plan_preview":
			preview = ev
		case "director_plan_log":
			msg, _ := ev["message"].(string)
			level, _ := ev["level"].(string)
			o.emit(models.PipelineEvent{
				Type:      "director_plan_log",
				ProjectID: projectID,
				EpisodeID: episodeID,
				PanelID:   panelID,
				Status:    level,
				Message:   msg,
			})
		case "error":
			if e, ok := ev["error"].(string); ok {
				workerError = e
			}
		}
	}
	waitErr := cmd.Wait()

	if preview != nil {
		return preview, nil
	}
	reason := workerError
	if reason == "" {
		lines := strings.Split(strings.TrimSpace(stderr.String()), "\n")
		if n := len(lines); n > 0 && lines[n-1] != "" {
			start := n - 3
			if start < 0 {
				start = 0
			}
			reason = strings.Join(lines[start:], " | ")
		}
	}
	if reason == "" && waitErr != nil {
		reason = waitErr.Error()
	}
	if reason == "" {
		reason = "the AI director returned no plan"
	}
	return nil, fmt.Errorf("director planning failed: %s", reason)
}

func (o *Orchestrator) SubmitDirectorFeedback(projectID, episodeID string, panelID int, feedback, sourceContext, promptOverride, screenshotPath, planJson string) (map[string]interface{}, error) {
	if _, err := o.store.GetEpisode(projectID, episodeID); err != nil {
		return nil, err
	}

	// Immediately reflect in-progress state in the Visual Task Queue if this feedback targets a visual/panel context
	var parsedPlan map[string]interface{}
	if strings.TrimSpace(planJson) != "" {
		_ = json.Unmarshal([]byte(planJson), &parsedPlan)
	}
	onlyStep, _ := parsedPlan["onlyStep"].(string)
	lowerFb := strings.ToLower(feedback)
	likelyVisual := (onlyStep == "" && (sourceContext == "visual" || sourceContext == "prompts" || sourceContext == "lightbox_visual" ||
		strings.Contains(lowerFb, "panel") || strings.Contains(lowerFb, "image") || strings.Contains(lowerFb, "comic") || strings.Contains(lowerFb, "draw"))) ||
		strings.EqualFold(onlyStep, "PANEL")
	if likelyVisual {
		o.manifestMu.Lock()
		_, _ = o.store.UpdateEpisode(projectID, episodeID, func(freshEp *models.EpisodeManifest) error {
			for i := range freshEp.Panels {
				if freshEp.Panels[i].PanelID == panelID {
					freshEp.Panels[i].ImageStatus = "IN_PROGRESS"
					if eng, ok := parsedPlan["engine"].(string); ok && strings.TrimSpace(eng) != "" {
						freshEp.Panels[i].ImageEngine = strings.TrimSpace(eng)
					}
					break
				}
			}
			return nil
		})
		o.manifestMu.Unlock()
	}

	jobID := fmt.Sprintf("director-%s-%s-p%02d-%d", projectID, episodeID, panelID, time.Now().Unix())
	job := &models.WorkerJob{
		JobID:     jobID,
		ProjectID: projectID,
		EpisodeID: episodeID,
		Stage:     "AI_DIRECTOR",
		PanelID:   panelID,
		Status:    "RUNNING",
		Progress:  5,
		Message:   fmt.Sprintf("[%s/%s] AI Director analyzing intents for Panel #%d...", projectID, episodeID, panelID),
		StartedAt: time.Now().UTC().Format(time.RFC3339),
	}

	o.mu.Lock()
	o.activeJobs[jobID] = job
	o.mu.Unlock()

	o.emit(models.PipelineEvent{
		Type:      "director_plan",
		ProjectID: projectID,
		EpisodeID: episodeID,
		PanelID:   panelID,
		Stage:     "AI_DIRECTOR",
		Status:    "IN_PROGRESS",
		Progress:  5,
		Message:   job.Message,
	})

	workerScript := filepath.Join(o.store.RootDir(), "tools", "workers", "comic_cli_worker.js")
	args := []string{
		workerScript,
		"--action", "director-feedback",
		"--project", projectID,
		"--episode", episodeID,
		"--panel", fmt.Sprintf("%d", panelID),
		"--source", sourceContext,
		"--managed-by-go", "1",
	}
	if strings.TrimSpace(feedback) != "" {
		args = append(args, "--feedback", feedback)
	}
	if strings.TrimSpace(promptOverride) != "" {
		args = append(args, "--prompt", promptOverride)
	}
	if strings.TrimSpace(screenshotPath) != "" {
		args = append(args, "--screenshot", screenshotPath)
	}
	if strings.TrimSpace(planJson) != "" {
		args = append(args, "--plan", planJson)
	}

	o.runNodeWorker(job, "AI_DIRECTOR", panelID, args, nil, nil)

	return map[string]interface{}{
		"queued":  true,
		"jobId":   jobID,
		"panelId": panelID,
		"message": "AI Director analyzing intents and dispatching ordered actions via EventBus...",
	}, nil
}

func (o *Orchestrator) AssembleVideo(projectID, episodeID string) error {
	ep, err := o.store.GetEpisode(projectID, episodeID)
	if err != nil {
		return err
	}

	for _, g := range ep.Gates {
		if g.ID == "AUDIO_QA_GATE" && g.Status != "APPROVED" {
			return fmt.Errorf("blocked by Gate C: AUDIO_QA_GATE is %s (Director must approve audio before video assembly)", g.Status)
		}
	}

	jobID := fmt.Sprintf("video-%s-%s-%d", projectID, episodeID, time.Now().Unix())
	job := &models.WorkerJob{
		JobID:     jobID,
		ProjectID: projectID,
		EpisodeID: episodeID,
		Stage:     "VIDEO_ASSEMBLY",
		Status:    "RUNNING",
		Progress:  5,
		Message:   fmt.Sprintf("[%s/%s] Motion Comic Video Assembly started", projectID, episodeID),
		StartedAt: time.Now().UTC().Format(time.RFC3339),
	}

	o.mu.Lock()
	o.activeJobs[jobID] = job
	o.mu.Unlock()

	for i := range ep.Stages {
		if ep.Stages[i].ID == "VIDEO_ASSEMBLY" {
			ep.Stages[i].Status = "IN_PROGRESS"
			ep.Stages[i].Progress = 5
		}
	}
	_ = o.store.SaveEpisode(ep)

	o.emit(models.PipelineEvent{
		Type:      "stage_update",
		ProjectID: projectID,
		EpisodeID: episodeID,
		Stage:     "VIDEO_ASSEMBLY",
		Status:    "IN_PROGRESS",
		Progress:  5,
		Message:   fmt.Sprintf("[%s/%s] Motion Comic Assembly dispatched to worker pool", projectID, episodeID),
	})

	go func() {
		o.videoSem <- struct{}{}
		defer func() {
			<-o.videoSem
			o.mu.Lock()
			delete(o.activeJobs, jobID)
			o.mu.Unlock()
		}()

		workerScript := filepath.Join(o.store.RootDir(), "tools", "workers", "comic_cli_worker.js")
		cmd := exec.Command("node", workerScript,
			"--action", "assemble-video",
			"--project", projectID,
			"--episode", episodeID,
		)
		cmd.Dir = o.store.RootDir()
		stdout, err := cmd.StdoutPipe()
		if err != nil {
			o.emit(models.PipelineEvent{
				Type:      "error",
				ProjectID: projectID,
				EpisodeID: episodeID,
				Stage:     "VIDEO_ASSEMBLY",
				Message:   fmt.Sprintf("Failed to pipe video worker: %v", err),
			})
			return
		}

		if err := cmd.Start(); err != nil {
			o.emit(models.PipelineEvent{
				Type:      "error",
				ProjectID: projectID,
				EpisodeID: episodeID,
				Stage:     "VIDEO_ASSEMBLY",
				Message:   fmt.Sprintf("Video worker start error: %v", err),
			})
			return
		}

		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for scanner.Scan() {
			line := scanner.Text()
			var ev map[string]interface{}
			if json.Unmarshal([]byte(line), &ev) == nil {
				msg, _ := ev["message"].(string)
				status, _ := ev["status"].(string)
				prog, _ := ev["progress"].(float64)
				evType, _ := ev["type"].(string)
				if evType == "" {
					evType = "stage_update"
				}

				if prog > 0 {
					o.mu.Lock()
					job.Progress = int(prog)
					if msg != "" {
						job.Message = msg
					}
					o.mu.Unlock()
				}

				o.emit(models.PipelineEvent{
					Type:      evType,
					ProjectID: projectID,
					EpisodeID: episodeID,
					Stage:     "VIDEO_ASSEMBLY",
					Status:    status,
					Progress:  int(prog),
					Message:   msg,
				})
			}
		}

		if err := cmd.Wait(); err != nil {
			o.emit(models.PipelineEvent{
				Type:      "error",
				ProjectID: projectID,
				EpisodeID: episodeID,
				Stage:     "VIDEO_ASSEMBLY",
				Status:    "ERROR",
				Message:   fmt.Sprintf("Video assembly exited with error: %v", err),
			})
			return
		}

		_, _ = o.store.UpdateEpisode(projectID, episodeID, func(freshEp *models.EpisodeManifest) error {
			freshEp.CurrentStage = "READY_FOR_RELEASE"
			freshEp.OverallProgress = 100
			for i := range freshEp.Stages {
				freshEp.Stages[i].Status = "COMPLETED"
				freshEp.Stages[i].Progress = 100
			}
			return nil
		})

		o.emit(models.PipelineEvent{
			Type:      "stage_update",
			ProjectID: projectID,
			EpisodeID: episodeID,
			Stage:     "READY_FOR_RELEASE",
			Status:    "COMPLETED",
			Progress:  100,
			Message:   fmt.Sprintf("[%s/%s] Motion Comic Video Assembly 100%% Complete & Ready for Release!", projectID, episodeID),
		})
	}()

	return nil
}

func (o *Orchestrator) RestartEpisode(projectID, episodeID string, autoGenerateScript bool) (*models.EpisodeManifest, error) {
	fresh, err := o.store.ResetEpisode(projectID, episodeID)
	if err != nil {
		return nil, err
	}

	o.emit(models.PipelineEvent{
		Type:      "stage_update",
		ProjectID: projectID,
		EpisodeID: episodeID,
		Stage:     "SCRIPT_GENERATION",
		Status:    "PENDING",
		Progress:  0,
		Message:   fmt.Sprintf("[%s/%s] Episode thrown away & restarted from scratch (0/%d panels).", projectID, episodeID, fresh.TargetPanelCount),
	})

	if autoGenerateScript {
		if err := o.GenerateScript(projectID, episodeID, ""); err != nil {
			return fresh, err
		}
	}

	return fresh, nil
}

func (o *Orchestrator) RerenderAllPanels(projectID, episodeID string) error {
	ep, err := o.store.GetEpisode(projectID, episodeID)
	if err != nil {
		return err
	}
	for _, g := range ep.Gates {
		if g.ID == "SCRIPT_GATE" && g.Status != "APPROVED" {
			return fmt.Errorf("blocked by Gate A: SCRIPT_GATE is %s", g.Status)
		}
	}

	panelsDir := filepath.Join(o.store.RootDir(), "projects", projectID, "episodes", episodeID, "panels")
	_ = os.RemoveAll(panelsDir)

	for i := range ep.Panels {
		ep.Panels[i].ImageStatus = "PENDING"
		ep.Panels[i].ImagePath = ""
		ep.Panels[i].WebPreviewUrl = ""
		ep.Panels[i].Hash = ""
		ep.Panels[i].SizeKB = 0
	}
	if err := o.store.SaveEpisode(ep); err != nil {
		return err
	}

	return o.StartStage(projectID, episodeID, "VISUAL_RENDERING")
}

// RegenerateEpisodeAudio sends episode-wide feedback to the AI Voice Director,
// which may tune the project's voice cast and re-voices the affected panels.
// With empty feedback it re-voices only panels that don't match the cast.
// DirectEpisodeAudio asks the AI to add voice acting (deliveries) and sound effects
// to an episode's existing script without changing any words.
func (o *Orchestrator) DirectEpisodeAudio(projectID, episodeID string) error {
	if _, err := o.store.GetEpisode(projectID, episodeID); err != nil {
		return err
	}
	jobID := fmt.Sprintf("direct-audio-%s-%s-%d", projectID, episodeID, time.Now().UnixNano())
	job := &models.WorkerJob{
		JobID:     jobID,
		ProjectID: projectID,
		EpisodeID: episodeID,
		Stage:     "SCRIPT_GENERATION",
		Status:    "RUNNING",
		Progress:  5,
		Message:   fmt.Sprintf("[%s/%s] Writers' Room: directing voices and sound", projectID, episodeID),
		StartedAt: time.Now().UTC().Format(time.RFC3339),
	}
	o.mu.Lock()
	o.activeJobs[jobID] = job
	o.mu.Unlock()
	args := []string{
		filepath.Join(o.store.RootDir(), "tools", "workers", "comic_cli_worker.js"),
		"--action", "direct-episode-audio",
		"--project", projectID,
		"--episode", episodeID,
	}
	o.runNodeWorker(job, "SCRIPT_GENERATION", 0, args, nil, nil)
	return nil
}

func (o *Orchestrator) RegenerateEpisodeAudio(projectID, episodeID, feedback string) error {
	ep, err := o.store.GetEpisode(projectID, episodeID)
	if err != nil {
		return err
	}
	for _, g := range ep.Gates {
		if g.ID == "VISUAL_QA_GATE" && g.Status != "APPROVED" {
			return fmt.Errorf("blocked by Gate B: VISUAL_QA_GATE is %s (approve the panels before working on audio)", g.Status)
		}
	}

	release, err := o.claimAudio(projectID, episodeID, "AI Voice Director episode pass")
	if err != nil {
		return err
	}

	jobID := fmt.Sprintf("voice-director-%s-%s-%d", projectID, episodeID, time.Now().UnixNano())
	job := &models.WorkerJob{
		JobID:     jobID,
		ProjectID: projectID,
		EpisodeID: episodeID,
		Stage:     "VOICE_SYNTHESIS",
		Status:    "RUNNING",
		Progress:  5,
		Message:   fmt.Sprintf("[%s/%s] AI Voice Director: episode audio pass", projectID, episodeID),
		StartedAt: time.Now().UTC().Format(time.RFC3339),
	}
	o.mu.Lock()
	o.activeJobs[jobID] = job
	o.mu.Unlock()

	args := []string{
		filepath.Join(o.store.RootDir(), "tools", "workers", "comic_cli_worker.js"),
		"--action", "regenerate-episode-audio",
		"--project", projectID,
		"--episode", episodeID,
	}
	if strings.TrimSpace(feedback) != "" {
		args = append(args, "--feedback", strings.TrimSpace(feedback))
	}
	o.runNodeWorker(job, "VOICE_SYNTHESIS", 0, args, o.audioSem, nil, release)
	return nil
}

// claimAudio makes sure only one audio job runs per episode at a time, so a
// double click (or a click while Gate B's approval is already voicing the
// episode) can't pay ElevenLabs twice for the same lines.
func (o *Orchestrator) claimAudio(projectID, episodeID, what string) (func(), error) {
	key := projectID + "/" + episodeID
	o.mu.Lock()
	defer o.mu.Unlock()
	if running, busy := o.audioBusy[key]; busy {
		return nil, fmt.Errorf("%s is already running for %s; wait for it to finish (this prevents paying twice for the same lines)", running, key)
	}
	o.audioBusy[key] = what
	var once sync.Once
	return func() {
		once.Do(func() {
			o.mu.Lock()
			delete(o.audioBusy, key)
			o.mu.Unlock()
		})
	}, nil
}

// CastReport returns, per episode, which actor voiced each character and which
// panels don't match the project's current voice cast.
func (o *Orchestrator) CastReport(projectID string) (map[string]interface{}, error) {
	cmd := exec.Command("node",
		filepath.Join(o.store.RootDir(), "tools", "workers", "comic_cli_worker.js"),
		"--action", "cast-check",
		"--project", projectID,
	)
	cmd.Dir = o.store.RootDir()
	out, err := cmd.Output()
	for _, line := range strings.Split(string(out), "\n") {
		var ev map[string]interface{}
		if json.Unmarshal([]byte(strings.TrimSpace(line)), &ev) != nil {
			continue
		}
		switch ev["type"] {
		case "cast_report":
			return ev, nil
		case "error":
			return nil, fmt.Errorf("cast check failed: %v", ev["error"])
		}
	}
	if err != nil {
		return nil, fmt.Errorf("cast check failed: %v", err)
	}
	return nil, fmt.Errorf("cast check returned no report")
}

// YouTubeThumbnail makes this episode's YouTube thumbnail from a panel (0 =
// pick automatically) and, if apply is set, replaces the thumbnail on the
// already-uploaded video.
func (o *Orchestrator) YouTubeThumbnail(projectID, episodeID string, panelID int, apply bool) (map[string]interface{}, error) {
	args := []string{
		filepath.Join(o.store.RootDir(), "tools", "youtube", "youtube_uploader.js"),
		"--project", projectID,
		"--episode", episodeID,
		"--thumbnail-only",
	}
	if panelID > 0 {
		args = append(args, "--panel", fmt.Sprintf("%d", panelID))
	}
	if apply {
		args = append(args, "--apply")
	}
	cmd := exec.Command("node", args...)
	cmd.Dir = o.store.RootDir()
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	for _, line := range strings.Split(string(out), "\n") {
		var ev map[string]interface{}
		if json.Unmarshal([]byte(strings.TrimSpace(line)), &ev) == nil && ev["type"] == "thumbnail" {
			return ev, nil
		}
	}
	reason := strings.TrimSpace(stderr.String())
	if reason == "" && err != nil {
		reason = err.Error()
	}
	if idx := strings.LastIndex(reason, "\n"); idx >= 0 {
		reason = reason[idx+1:]
	}
	var errObj map[string]interface{}
	if json.Unmarshal([]byte(reason), &errObj) == nil {
		if m, ok := errObj["message"].(string); ok {
			reason = m
		}
	}
	return nil, fmt.Errorf("thumbnail failed: %s", reason)
}
