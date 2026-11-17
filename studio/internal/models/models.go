package models

type Project struct {
	ID                      string   `json:"id"`
	Title                   string   `json:"title"`
	Subtitle                string   `json:"subtitle"`
	Genre                   string   `json:"genre"`
	ArtStyleAnchor          string   `json:"artStyleAnchor"`
	DefaultImageEngine      string   `json:"defaultImageEngine"`
	DefaultVoiceEngine      string   `json:"defaultVoiceEngine"`
	TargetEpisodeCount      int      `json:"targetEpisodeCount"`
	DefaultPanelsPerEpisode int      `json:"defaultPanelsPerEpisode"`
	CreatedAt               string   `json:"createdAt"`
	UpdatedAt               string   `json:"updatedAt"`
	CoverImage              string   `json:"coverImage"`
	Invariants              []string `json:"invariants"`
	Episodes                []string `json:"episodes"`
	Extra                   Extra    `json:"-"` // fields this struct does not declare, preserved on save
}

type ProjectWithEpisodes struct {
	Project  Project           `json:"project"`
	Episodes []EpisodeManifest `json:"episodes"`
}

type EpisodeOutputs struct {
	MasterVideoPath *string  `json:"masterVideoPath"`
	GrokVideoPath   *string  `json:"grokVideoPath,omitempty"`
	WebReaderPath   *string  `json:"webReaderPath,omitempty"`
	WebReviewPath   *string  `json:"webReviewPath,omitempty"`
	DurationSeconds *float64 `json:"durationSeconds"`
	Resolution      string   `json:"resolution"`
	Extra           Extra    `json:"-"` // fields this struct does not declare, preserved on save
}

type Stage struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Status   string `json:"status"` // COMPLETED, IN_PROGRESS, LOCKED_BY_GATE, QUEUED, ERROR
	Progress int    `json:"progress"`
	Extra    Extra  `json:"-"` // fields this struct does not declare, preserved on save
}

type Gate struct {
	ID         string  `json:"id"` // SCRIPT_GATE, VISUAL_QA_GATE, AUDIO_QA_GATE
	Name       string  `json:"name"`
	AfterStage string  `json:"afterStage"`
	Status     string  `json:"status"` // APPROVED, AWAITING_APPROVAL, REJECTED, LOCKED, PENDING
	ApprovedAt *string `json:"approvedAt"`
	Notes      string  `json:"notes"`
	Extra      Extra   `json:"-"` // fields this struct does not declare, preserved on save
}

type DialogueLine struct {
	Speaker string `json:"speaker"`
	Text    string `json:"text"`
	Extra   Extra  `json:"-"` // fields this struct does not declare, preserved on save
}

type QAChecklist struct {
	FacialLikeness          bool `json:"facialLikeness"`
	WardrobeContinuity      bool `json:"wardrobeContinuity"`
	SingleSwordInvariant    bool `json:"singleSwordInvariant"`
	CardinalityGuard        bool `json:"cardinalityGuard"`
	HandAnatomyGuard        bool `json:"handAnatomyGuard"`
	EnvironmentalContinuity bool `json:"environmentalContinuity"`
	FrazettaInkStyle        bool `json:"frazettaInkStyle"`
	CaptionSpeechLegibility bool `json:"captionSpeechLegibility"`
}

type PanelCandidate struct {
	ID               string  `json:"id"`
	ImagePath        string  `json:"imagePath"`
	WebPreviewUrl    string  `json:"webPreviewUrl"`
	Hash             string  `json:"hash"`
	SizeKB           float64 `json:"sizeKB"`
	Engine           string  `json:"engine"`
	Prompt           string  `json:"prompt,omitempty"`
	QaPassed         bool    `json:"qaPassed"`
	QaScore          int     `json:"qaScore,omitempty"`
	QaSummary        string  `json:"qaSummary,omitempty"`
	QaFixInstruction string  `json:"qaFixInstruction,omitempty"`
	CreatedAt        string  `json:"createdAt"`
	Extra            Extra   `json:"-"` // fields this struct does not declare, preserved on save
}

type Panel struct {
	PanelID          int              `json:"panelId"`
	Name             string           `json:"name"`
	Act              string           `json:"act"`
	Summary          string           `json:"summary"`
	Caption          string           `json:"caption"`
	Dialogue         []DialogueLine   `json:"dialogue"`
	Characters       []string         `json:"characters"`
	Objects          []string         `json:"objects"`
	ShotType         string           `json:"shotType"`
	Prompt           string           `json:"prompt"`
	ImageEngine      string           `json:"imageEngine,omitempty"`
	ImageStatus      string           `json:"imageStatus"` // VERIFIED, NEEDS_REVIEW, RENDERING, QUEUED, PENDING, FAILED
	ImagePath        string           `json:"imagePath"`
	WebPreviewUrl    string           `json:"webPreviewUrl"`
	SizeKB           float64          `json:"sizeKB"`
	Hash             string           `json:"hash"`
	Error            string           `json:"error,omitempty"`
	QaNotes          string           `json:"qaNotes,omitempty"`
	QaScore          int              `json:"qaScore,omitempty"`
	QaFixInstruction string           `json:"qaFixInstruction,omitempty"`
	Candidates       []PanelCandidate `json:"candidates,omitempty"`
	AudioStatus      string           `json:"audioStatus"`
	AudioPath        string           `json:"audioPath"`
	QAChecklist      QAChecklist      `json:"qaChecklist"`
	Extra            Extra            `json:"-"` // fields this struct does not declare, preserved on save
}

type EpisodeManifest struct {
	ProjectID         string         `json:"projectId"`
	EpisodeID         string         `json:"episodeId"`
	EpisodeNumber     int            `json:"episodeNumber"`
	Title             string         `json:"title"`
	Theme             string         `json:"theme"`
	ImageEngine       string         `json:"imageEngine,omitempty"`
	TargetPanelCount  int            `json:"targetPanelCount"`
	CurrentStage      string         `json:"currentStage"`
	OverallProgress   int            `json:"overallProgress"`
	AssignedWorkerTab *string        `json:"assignedWorkerTab"`
	UpdatedAt         string         `json:"updatedAt"`
	Outputs           EpisodeOutputs `json:"outputs"`
	Stages            []Stage        `json:"stages"`
	Gates             []Gate         `json:"gates"`
	Panels            []Panel        `json:"panels"`
	Extra             Extra          `json:"-"` // fields this struct does not declare, preserved on save
}

type WorkerJob struct {
	JobID       string `json:"jobId"`
	ProjectID   string `json:"projectId"`
	EpisodeID   string `json:"episodeId"`
	Stage       string `json:"stage"`
	PanelID     int    `json:"panelId,omitempty"`
	AssignedTab string `json:"assignedTab,omitempty"`
	Status      string `json:"status"` // RUNNING, QUEUED, COMPLETED, FAILED
	Progress    int    `json:"progress,omitempty"`
	Message     string `json:"message"`
	StartedAt   string `json:"startedAt"`
}

type PipelineEvent struct {
	Timestamp string      `json:"timestamp"`
	Type      string      `json:"type"` // stage_update, gate_update, panel_progress, worker_log, error
	ProjectID string      `json:"projectId"`
	EpisodeID string      `json:"episodeId"`
	Stage     string      `json:"stage,omitempty"`
	GateID    string      `json:"gateId,omitempty"`
	PanelID   int         `json:"panelId,omitempty"`
	Status    string      `json:"status,omitempty"`
	Progress  int         `json:"progress,omitempty"`
	Message   string      `json:"message"`
	Data      interface{} `json:"data,omitempty"`
}

type WorkerPoolStatus struct {
	MaxConcurrentComics int             `json:"maxConcurrentComics"`
	ActiveComicJobs     int             `json:"activeComicJobs"`
	MaxCDPTabs          int             `json:"maxCdpTabs"`
	ActiveCDPTabs       int             `json:"activeCdpTabs"`
	CDPOnline           bool            `json:"cdpOnline"`
	QueuePaused         bool            `json:"queuePaused"`
	ActiveJobs          []WorkerJob     `json:"activeJobs"`
	RecentEvents        []PipelineEvent `json:"recentEvents"`
}
