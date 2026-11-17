package engine

import (
	"conan-studio/internal/models"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

// SelectPanelCandidate promotes a previously rendered candidate image to be the active panel image.
func (o *Orchestrator) SelectPanelCandidate(projectID, episodeID string, panelID int, candidateID string) (*models.EpisodeManifest, error) {
	var found *models.PanelCandidate
	var status string
	ep, err := o.store.UpdateEpisode(projectID, episodeID, func(ep *models.EpisodeManifest) error {

		panelIdx := -1
		for i := range ep.Panels {
			if ep.Panels[i].PanelID == panelID {
				panelIdx = i
				for j := range ep.Panels[i].Candidates {
					if ep.Panels[i].Candidates[j].ID == candidateID {
						c := ep.Panels[i].Candidates[j]
						found = &c
						break
					}
				}
				break
			}
		}

		if panelIdx == -1 {
			return fmt.Errorf("panel #%d not found", panelID)
		}
		if found == nil {
			return fmt.Errorf("candidate %s not found on panel #%d", candidateID, panelID)
		}

		p := &ep.Panels[panelIdx]
		p.ImagePath = found.ImagePath
		p.WebPreviewUrl = found.WebPreviewUrl
		p.Hash = found.Hash
		p.SizeKB = found.SizeKB
		p.ImageEngine = found.Engine
		if found.Prompt != "" {
			p.Prompt = found.Prompt
		}
		p.QaScore = found.QaScore
		p.QaNotes = found.QaSummary
		p.QaFixInstruction = found.QaFixInstruction
		p.Error = ""
		if found.QaPassed {
			p.ImageStatus = "VERIFIED"
		} else {
			p.ImageStatus = "NEEDS_REVIEW"
		}
		status = p.ImageStatus
		return nil
	})
	if err != nil {
		return nil, err
	}

	o.emit(models.PipelineEvent{
		Type:      "panel_progress",
		ProjectID: projectID,
		EpisodeID: episodeID,
		PanelID:   panelID,
		Status:    status,
		Message:   fmt.Sprintf("[%s/%s] Panel #%d switched to candidate (%s, hash %s).", projectID, episodeID, panelID, found.Engine, found.Hash),
	})

	return ep, nil
}

// AcceptPanelReview marks a NEEDS_REVIEW panel as VERIFIED after human sign-off.
func (o *Orchestrator) AcceptPanelReview(projectID, episodeID string, panelID int) (*models.EpisodeManifest, error) {
	ep, err := o.store.UpdateEpisode(projectID, episodeID, func(ep *models.EpisodeManifest) error {

		found := false
		for i := range ep.Panels {
			if ep.Panels[i].PanelID == panelID {
				if ep.Panels[i].ImagePath == "" {
					return fmt.Errorf("panel #%d has no image to accept", panelID)
				}
				ep.Panels[i].ImageStatus = "VERIFIED"
				ep.Panels[i].Error = ""
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("panel #%d not found", panelID)
		}

		allDone := true
		for _, p := range ep.Panels {
			if p.ImageStatus != "VERIFIED" && p.ImageStatus != "RENDERED" {
				allDone = false
				break
			}
		}
		if allDone {
			for i := range ep.Stages {
				if ep.Stages[i].ID == "VISUAL_RENDERING" {
					ep.Stages[i].Status = "COMPLETED"
					ep.Stages[i].Progress = 100
				}
			}
			for i := range ep.Gates {
				if ep.Gates[i].ID == "VISUAL_QA_GATE" {
					ep.Gates[i].Status = "AWAITING_APPROVAL"
				}
			}
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	o.emit(models.PipelineEvent{
		Type:      "panel_progress",
		ProjectID: projectID,
		EpisodeID: episodeID,
		PanelID:   panelID,
		Status:    "VERIFIED",
		Message:   fmt.Sprintf("[%s/%s] Panel #%d accepted by Human Director -> VERIFIED.", projectID, episodeID, panelID),
	})

	return ep, nil
}

// applyWorkerEventToManifest persists structured worker stdout JSON events into manifest.json
// so Go remains the single atomic writer during orchestrated renders.
func (o *Orchestrator) applyWorkerEventToManifest(projectID, episodeID string, panelID int, rawLine string) {
	var ev map[string]interface{}
	if json.Unmarshal([]byte(rawLine), &ev) != nil {
		return
	}
	evType, _ := ev["type"].(string)
	if evType != "panel_candidate_saved" && evType != "panel_complete" && evType != "panel_needs_review" && evType != "panel_failed" {
		return
	}

	o.manifestMu.Lock()
	defer o.manifestMu.Unlock()

	_, _ = o.store.UpdateEpisode(projectID, episodeID, func(ep *models.EpisodeManifest) error {

		var target *models.Panel
		for i := range ep.Panels {
			if ep.Panels[i].PanelID == panelID {
				target = &ep.Panels[i]
				break
			}
		}
		if target == nil {
			return errNoChange
		}

		strField := func(k string) string {
			if v, ok := ev[k].(string); ok {
				return v
			}
			return ""
		}
		floatField := func(k string) float64 {
			if v, ok := ev[k].(float64); ok {
				return v
			}
			return 0
		}

		switch evType {
		case "panel_candidate_saved":
			cand := models.PanelCandidate{
				ID:               strField("candidateId"),
				ImagePath:        strField("imagePath"),
				WebPreviewUrl:    strField("imagePath"),
				Hash:             strField("hash"),
				SizeKB:           floatField("sizeKB"),
				Engine:           strField("engine"),
				Prompt:           strField("promptSent"),
				QaPassed:         ev["qaPassed"] == true,
				QaScore:          int(floatField("qaScore")),
				QaSummary:        strField("qaSummary"),
				QaFixInstruction: strField("qaFixInstruction"),
				CreatedAt:        time.Now().UTC().Format(time.RFC3339),
			}
			// Muse renders: which character sheets and word swaps were used
			for _, k := range []string{"referenceSheets", "museWording"} {
				if v, ok := ev[k]; ok && v != nil {
					if raw, err := json.Marshal(v); err == nil && string(raw) != "[]" && string(raw) != "null" {
						if cand.Extra == nil {
							cand.Extra = models.Extra{}
						}
						cand.Extra[k] = raw
					}
				}
			}
			if cand.ID != "" {
				replaced := false
				for i := range target.Candidates {
					if target.Candidates[i].ID == cand.ID {
						target.Candidates[i] = cand
						replaced = true
						break
					}
				}
				if !replaced {
					target.Candidates = append(target.Candidates, cand)
					if len(target.Candidates) > 8 {
						target.Candidates = target.Candidates[len(target.Candidates)-8:]
					}
				}
			}

		case "panel_complete":
			target.ImageStatus = "VERIFIED"
			if p := strField("imagePath"); p != "" {
				target.ImagePath = p
				target.WebPreviewUrl = p
			}
			if h := strField("hash"); h != "" {
				target.Hash = h
			}
			if s := floatField("sizeKB"); s > 0 {
				target.SizeKB = s
			}
			if eng := strField("engine"); eng != "" {
				target.ImageEngine = eng
			}
			target.Error = ""
			if qa, ok := ev["qaReport"].(map[string]interface{}); ok {
				if sum, ok := qa["summary"].(string); ok {
					target.QaNotes = sum
				}
				if sc, ok := qa["score"].(float64); ok {
					target.QaScore = int(sc)
				}
				target.QaFixInstruction = ""
			}

		case "panel_needs_review":
			target.ImageStatus = "NEEDS_REVIEW"
			if p := strField("imagePath"); p != "" {
				target.ImagePath = p
				target.WebPreviewUrl = p
			}
			if h := strField("hash"); h != "" {
				target.Hash = h
			}
			if s := floatField("sizeKB"); s > 0 {
				target.SizeKB = s
			}
			if eng := strField("engine"); eng != "" {
				target.ImageEngine = eng
			}
			target.Error = strField("error")
			if qa, ok := ev["qaReport"].(map[string]interface{}); ok {
				if sum, ok := qa["summary"].(string); ok {
					target.QaNotes = sum
				}
				if sc, ok := qa["score"].(float64); ok {
					target.QaScore = int(sc)
				}
				if fix, ok := qa["fixInstruction"].(string); ok {
					target.QaFixInstruction = fix
				}
			}

		case "panel_failed":
			if target.ImagePath == "" {
				target.ImageStatus = "FAILED"
			}
			target.Error = strField("error")
		}

		allDone := true
		for _, p := range ep.Panels {
			if p.ImageStatus != "VERIFIED" && p.ImageStatus != "RENDERED" {
				allDone = false
				break
			}
		}
		if allDone {
			for i := range ep.Stages {
				if ep.Stages[i].ID == "VISUAL_RENDERING" {
					ep.Stages[i].Status = "COMPLETED"
					ep.Stages[i].Progress = 100
				}
			}
			for i := range ep.Gates {
				if ep.Gates[i].ID == "VISUAL_QA_GATE" {
					ep.Gates[i].Status = "AWAITING_APPROVAL"
				}
			}
		}

		return nil
	})
}

// errNoChange aborts an UpdateEpisode callback without writing the manifest.
var errNoChange = errors.New("no manifest change")
