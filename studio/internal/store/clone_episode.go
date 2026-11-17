package store

import (
	"conan-studio/internal/models"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// engineShortNames gives readable episode-ID suffixes for alternate renders.
var engineShortNames = map[string]string{
	"meta-ai-cdp":            "meta",
	"meta-muse-image":        "muse",
	"grok-imagine-image-2-0": "grok",
	"flux-2-pro":             "flux",
	"recraft-v4":             "recraft",
	"lustify-v8":             "lustify",
}

var engineLabels = map[string]string{
	"meta-ai-cdp":            "Meta AI",
	"meta-muse-image":        "Muse Image",
	"grok-imagine-image-2-0": "Grok Imagine",
	"flux-2-pro":             "Flux 2 Pro",
	"recraft-v4":             "Recraft v4",
	"lustify-v8":             "Lustify v8",
}

var baseEpisodeID = regexp.MustCompile(`^ep(\d+)$`)

// nextEpisodeNumber returns the next free "epNN" number, ignoring alternate
// renders such as "ep01-grok" so they don't shift the numbering.
func nextEpisodeNumber(episodes []string) int {
	max := 0
	for _, id := range episodes {
		if m := baseEpisodeID.FindStringSubmatch(id); m != nil {
			if n, err := strconv.Atoi(m[1]); err == nil && n > max {
				max = n
			}
		}
	}
	return max + 1
}

// CloneEpisodeForEngine creates a sibling episode (e.g. "ep01-grok") that keeps
// the source episode's approved script, prompts, dialogue and mixed voice audio,
// but has fresh, un-rendered panels set to the given image engine. The source
// episode is not modified, so both renders are kept side by side.
func (s *Store) CloneEpisodeForEngine(projectID, sourceEpisodeID, engine string) (*models.EpisodeManifest, error) {
	engine = strings.ToLower(strings.TrimSpace(engine))
	short, ok := engineShortNames[engine]
	if !ok {
		return nil, fmt.Errorf("unsupported image engine %q", engine)
	}

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

	srcDir := filepath.Join(s.projectsDir(), projectID, "episodes", sourceEpisodeID)
	srcPath := filepath.Join(srcDir, "manifest.json")
	unlock, err := lockManifestFile(srcPath)
	if err != nil {
		return nil, err
	}
	srcBytes, err := os.ReadFile(srcPath)
	unlock()
	if err != nil {
		return nil, fmt.Errorf("episode %s/%s not found: %w", projectID, sourceEpisodeID, err)
	}
	var ep models.EpisodeManifest
	if err := json.Unmarshal(srcBytes, &ep); err != nil {
		return nil, err
	}

	scriptApproved := false
	for _, g := range ep.Gates {
		if g.ID == "SCRIPT_GATE" && g.Status == "APPROVED" {
			scriptApproved = true
		}
	}
	if !scriptApproved {
		return nil, fmt.Errorf("approve the script (Gate A) on %s before re-rendering it with another model", sourceEpisodeID)
	}

	// Pick a free ID: ep01-grok, ep01-grok-2, ...
	baseID := sourceEpisodeID + "-" + short
	newID := baseID
	for n := 2; ; n++ {
		taken := false
		for _, id := range proj.Episodes {
			if id == newID {
				taken = true
				break
			}
		}
		if _, err := os.Stat(filepath.Join(s.projectsDir(), projectID, "episodes", newID)); err == nil {
			taken = true
		}
		if !taken {
			break
		}
		newID = fmt.Sprintf("%s-%d", baseID, n)
	}
	newDir := filepath.Join(s.projectsDir(), projectID, "episodes", newID)

	// Reuse the already-mixed voice audio and the script so nothing is re-synthesised.
	audioCopied := copyDirFiles(filepath.Join(srcDir, "audio"), filepath.Join(newDir, "audio")) == nil
	_ = copyFile(filepath.Join(srcDir, "script.json"), filepath.Join(newDir, "script.json"))

	srcSeg := "/episodes/" + sourceEpisodeID + "/"
	newSeg := "/episodes/" + newID + "/"

	ep.EpisodeID = newID
	ep.ImageEngine = engine
	ep.Title = strings.TrimSpace(ep.Title) + " [" + engineLabels[engine] + "]"
	ep.AssignedWorkerTab = nil
	ep.Outputs = models.EpisodeOutputs{}
	ep.CurrentStage = "VISUAL_RENDERING"
	ep.OverallProgress = 30

	for i := range ep.Panels {
		p := &ep.Panels[i]
		p.ImageEngine = engine
		p.ImageStatus = "PENDING"
		p.ImagePath = ""
		p.WebPreviewUrl = ""
		p.Hash = ""
		p.SizeKB = 0
		p.Error = ""
		p.QaNotes = ""
		p.QaScore = 0
		p.QaFixInstruction = ""
		p.Candidates = nil
		p.QAChecklist = models.Panel{}.QAChecklist
		if audioCopied && p.AudioPath != "" {
			p.AudioPath = strings.Replace(filepath.ToSlash(p.AudioPath), srcSeg, newSeg, 1)
		} else {
			p.AudioPath = ""
			if p.AudioStatus != "" {
				p.AudioStatus = "LOCKED_BY_GATE"
			}
		}
	}

	for i := range ep.Stages {
		st := &ep.Stages[i]
		switch st.ID {
		case "SCRIPT_GENERATION", "PROMPT_EXPANSION":
			// keep the approved script as-is
		case "VISUAL_RENDERING":
			st.Status = "IN_PROGRESS"
			st.Progress = 5
		default:
			st.Status = "LOCKED_BY_GATE"
			st.Progress = 0
		}
	}
	for i := range ep.Gates {
		g := &ep.Gates[i]
		switch g.ID {
		case "SCRIPT_GATE":
			// stays APPROVED
		case "VISUAL_QA_GATE":
			g.Status = "PENDING"
			g.ApprovedAt = nil
			g.Notes = fmt.Sprintf("Re-render of %s with %s", sourceEpisodeID, engineLabels[engine])
		default:
			g.Status = "LOCKED"
			g.ApprovedAt = nil
			g.Notes = ""
		}
	}

	newPath := filepath.Join(newDir, "manifest.json")
	unlockNew, err := lockManifestFile(newPath)
	if err != nil {
		return nil, err
	}
	err = s.writeEpisodeFile(&ep)
	unlockNew()
	if err != nil {
		return nil, err
	}

	// Insert right after the source episode so the list stays grouped.
	inserted := false
	var episodes []string
	for _, id := range proj.Episodes {
		episodes = append(episodes, id)
		if id == sourceEpisodeID && !inserted {
			episodes = append(episodes, newID)
			inserted = true
		}
	}
	if !inserted {
		episodes = append(episodes, newID)
	}
	proj.Episodes = episodes
	proj.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	newProjBytes, err := json.MarshalIndent(proj, "", "  ")
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(projPath, newProjBytes, 0644); err != nil {
		return nil, err
	}
	return &ep, nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return err
	}
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// copyDirFiles copies the regular files of src (not subfolders) into dst.
func copyDirFiles(src, dst string) error {
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if e.Type().IsRegular() {
			if err := copyFile(filepath.Join(src, e.Name()), filepath.Join(dst, e.Name())); err != nil {
				return err
			}
		}
	}
	return nil
}
