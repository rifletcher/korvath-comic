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
}

type Stage struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Status   string `json:"status"` // COMPLETED, IN_PROGRESS, LOCKED_BY_GATE, QUEUED, ERROR
	Progress int    `json:"progress"`
}

type Gate struct {
	ID         string  `json:"id"` // SCRIPT_GATE, VISUAL_QA_GATE, AUDIO_QA_GATE
	Name       string  `json:"name"`
	AfterStage string  `json:"afterStage"`
	Status     string  `json:"status"` // APPROVED, AWAITING_APPROVAL, REJECTED, LOCKED, PENDING
	ApprovedAt *string `json:"approvedAt"`
	Notes      string  `json:"notes"`
}

type DialogueLine struct {
	Speaker string `json:"speaker"`
	Text    string `json:"text"`
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

type Panel struct {
	PanelID       int            `json:"panelId"`
	Name          string         `json:"name"`
	Act           string         `json:"act"`
	Summary       string         `json:"summary"`
	Caption       string         `json:"caption"`
	Dialogue      []DialogueLine `json:"dialogue"`
	Characters    []string       `json:"characters"`
	Objects       []string       `json:"objects"`
	ShotType      string         `json:"shotType"`
	Prompt        string         `json:"prompt"`
	ImageStatus   string         `json:"imageStatus"` // VERIFIED, RENDERED, RENDERING, QUEUED, PENDING, REJECTED
	ImagePath     string         `json:"imagePath"`
	WebPreviewUrl string         `json:"webPreviewUrl"`
	SizeKB        float64        `json:"sizeKB"`
	Hash          string         `json:"hash"`
	AudioStatus   string         `json:"audioStatus"`
	AudioPath     string         `json:"audioPath"`
	QAChecklist   QAChecklist    `json:"qaChecklist"`
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
}

type WorkerJob struct {
	JobID       string `json:"jobId"`
	ProjectID   string `json:"projectId"`
	EpisodeID   string `json:"episodeId"`
	Stage       string `json:"stage"`
	PanelID     int    `json:"panelId,omitempty"`
	AssignedTab string `json:"assignedTab,omitempty"`
	Status      string `json:"status"` // RUNNING, QUEUED, COMPLETED, FAILED
	Message     string `json:"message"`
	StartedAt   string `json:"startedAt"`
}

type PipelineEvent struct {
	Timestamp string `json:"timestamp"`
	Type      string `json:"type"` // stage_update, gate_update, panel_progress, worker_log, error
	ProjectID string `json:"projectId"`
	EpisodeID string `json:"episodeId"`
	Stage     string `json:"stage,omitempty"`
	GateID    string `json:"gateId,omitempty"`
	PanelID   int    `json:"panelId,omitempty"`
	Status    string `json:"status,omitempty"`
	Progress  int    `json:"progress,omitempty"`
	Message   string `json:"message"`
}

type WorkerPoolStatus struct {
	MaxConcurrentComics int             `json:"maxConcurrentComics"`
	ActiveComicJobs     int             `json:"activeComicJobs"`
	MaxCDPTabs          int             `json:"maxCdpTabs"`
	ActiveCDPTabs       int             `json:"activeCdpTabs"`
	CDPOnline           bool            `json:"cdpOnline"`
	ActiveJobs          []WorkerJob     `json:"activeJobs"`
	RecentEvents        []PipelineEvent `json:"recentEvents"`
}

