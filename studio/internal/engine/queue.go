package engine

import (
	"conan-studio/internal/models"
	"fmt"
	"os/exec"
	"time"
)

// PauseQueue pauses starting any newly popped renderQueue tasks until ResumeQueue is called.
func (o *Orchestrator) PauseQueue() {
	o.queueMu.Lock()
	o.queuePaused = true
	o.queueMu.Unlock()

	o.emit(models.PipelineEvent{
		Type:    "worker_log",
		Status:  "QUEUE_PAUSED",
		Message: "Render queue paused — active panel will finish, queued panels will wait.",
	})
}

// ResumeQueue resumes processing queued renderQueue tasks.
func (o *Orchestrator) ResumeQueue() {
	o.queueMu.Lock()
	o.queuePaused = false
	if o.queueCond != nil {
		o.queueCond.Broadcast()
	}
	o.queueMu.Unlock()

	o.emit(models.PipelineEvent{
		Type:    "worker_log",
		Status:  "QUEUE_RESUMED",
		Message: "Render queue resumed.",
	})
}

// IsQueuePaused reports whether the render queue is currently paused.
func (o *Orchestrator) IsQueuePaused() bool {
	o.queueMu.Lock()
	defer o.queueMu.Unlock()
	return o.queuePaused
}

// waitIfPaused blocks a renderQueue worker until queuePaused is false.
func (o *Orchestrator) waitIfPaused() {
	o.queueMu.Lock()
	for o.queuePaused {
		if o.queueCond == nil {
			o.queueMu.Unlock()
			time.Sleep(250 * time.Millisecond)
			o.queueMu.Lock()
			continue
		}
		o.queueCond.Wait()
	}
	o.queueMu.Unlock()
}

// CancelEpisodeQueue cancels all QUEUED (not yet started) render jobs for an episode
// and resets any panels stuck in QUEUED back to PENDING (or VERIFIED if an image exists).
func (o *Orchestrator) CancelEpisodeQueue(projectID, episodeID string) (int, error) {
	key := projectID + "/" + episodeID
	now := time.Now().UnixNano()

	o.queueMu.Lock()
	o.cancelledAt[key] = now
	o.queuePaused = false
	if o.queueCond != nil {
		o.queueCond.Broadcast()
	}
	o.queueMu.Unlock()

	cancelledCount := 0
	o.mu.Lock()
	for jobID, job := range o.activeJobs {
		if job.ProjectID == projectID && job.EpisodeID == episodeID && job.Status == "QUEUED" {
			delete(o.activeJobs, jobID)
			cancelledCount++
		}
	}
	o.mu.Unlock()

	// Stop renders that are already running for this episode.
	killed := o.killRenderProcs(projectID, episodeID)
	cancelledCount += killed

	_, _ = o.store.UpdateEpisode(projectID, episodeID, func(ep *models.EpisodeManifest) error {
		changed := false
		for i := range ep.Panels {
			st := ep.Panels[i].ImageStatus
			if st == "QUEUED" || (killed > 0 && (st == "RENDERING" || st == "IN_PROGRESS")) {
				if ep.Panels[i].ImagePath != "" {
					ep.Panels[i].ImageStatus = "VERIFIED"
				} else {
					ep.Panels[i].ImageStatus = "PENDING"
				}
				changed = true
			}
		}
		if !changed {
			return errNoChange
		}
		return nil
	})

	o.emit(models.PipelineEvent{
		Type:      "worker_log",
		ProjectID: projectID,
		EpisodeID: episodeID,
		Status:    "QUEUE_CANCELLED",
		Message:   fmt.Sprintf("[%s/%s] Cancelled %d queued or running panel render(s).", projectID, episodeID, cancelledCount),
	})

	return cancelledCount, nil
}

func (o *Orchestrator) isJobCancelled(projectID, episodeID string, enqueuedNano int64) bool {
	key := projectID + "/" + episodeID
	o.queueMu.Lock()
	defer o.queueMu.Unlock()
	cancelNano, ok := o.cancelledAt[key]
	return ok && cancelNano >= enqueuedNano
}

// trackRenderProc registers a running panel render worker so a queue cancel can stop it.
func (o *Orchestrator) trackRenderProc(projectID, episodeID string, cmd *exec.Cmd) func() {
	key := projectID + "/" + episodeID
	o.mu.Lock()
	if o.renderProcs[key] == nil {
		o.renderProcs[key] = make(map[*exec.Cmd]struct{})
	}
	o.renderProcs[key][cmd] = struct{}{}
	o.mu.Unlock()
	return func() {
		o.mu.Lock()
		delete(o.renderProcs[key], cmd)
		if len(o.renderProcs[key]) == 0 {
			delete(o.renderProcs, key)
		}
		o.mu.Unlock()
	}
}

// killRenderProcs terminates every running render worker for an episode and
// returns how many were stopped.
func (o *Orchestrator) killRenderProcs(projectID, episodeID string) int {
	key := projectID + "/" + episodeID
	o.mu.Lock()
	var procs []*exec.Cmd
	for cmd := range o.renderProcs[key] {
		procs = append(procs, cmd)
	}
	o.mu.Unlock()

	killed := 0
	for _, cmd := range procs {
		if cmd.Process != nil && cmd.Process.Kill() == nil {
			killed++
		}
	}
	return killed
}
