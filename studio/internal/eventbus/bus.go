package eventbus

import (
	"conan-studio/internal/models"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Handler is a callback invoked asynchronously when a matching event is published.
type Handler func(ev models.PipelineEvent)

type subscription struct {
	id      string
	pattern string
	handler Handler
	inline  bool // called synchronously, in publish order (must never block)
}

// Bus is a thread-safe publish/subscribe event bus with wildcard topic matching
// and bounded event history for the Studio Orchestrator, SSE clients, and Wails UI.
type Bus struct {
	mu      sync.RWMutex
	subs    map[string]subscription
	history []models.PipelineEvent
	maxHist int
	seq     uint64
}

func New(maxHistory int) *Bus {
	if maxHistory <= 0 {
		maxHistory = 100
	}
	return &Bus{
		subs:    make(map[string]subscription),
		history: make([]models.PipelineEvent, 0, maxHistory),
		maxHist: maxHistory,
	}
}

func matchesTopic(pattern, eventType string) bool {
	if pattern == "" || pattern == "*" {
		return true
	}
	if strings.HasSuffix(pattern, "*") {
		prefix := strings.TrimSuffix(pattern, "*")
		return strings.HasPrefix(eventType, prefix)
	}
	return pattern == eventType
}

// Subscribe registers a callback handler for a topic pattern (e.g. "*", "gate_*", "director_complete").
// Returns a subscription ID that can be passed to Unsubscribe.
func (b *Bus) Subscribe(pattern string, handler Handler) string {
	return b.subscribe(pattern, handler, false)
}

func (b *Bus) subscribe(pattern string, handler Handler, inline bool) string {
	id := fmt.Sprintf("sub-%d", atomic.AddUint64(&b.seq, 1))
	b.mu.Lock()
	b.subs[id] = subscription{
		id:      id,
		inline:  inline,
		pattern: pattern,
		handler: handler,
	}
	b.mu.Unlock()
	return id
}

// SubscribeChan returns a buffered channel receiving events matching pattern and an unsubscribe func.
func (b *Bus) SubscribeChan(pattern string, bufSize int) (<-chan models.PipelineEvent, func()) {
	if bufSize <= 0 {
		bufSize = 64
	}
	ch := make(chan models.PipelineEvent, bufSize)
	var once sync.Once
	var closed atomic.Bool

	// Inline so events reach SSE clients in the order they were published.
	subID := b.subscribe(pattern, func(ev models.PipelineEvent) {
		if closed.Load() {
			return
		}
		defer func() { _ = recover() }()
		select {
		case ch <- ev:
		default:
			// Drop oldest-style non-blocking so slow SSE clients never stall the bus
		}
	}, true)

	cancel := func() {
		once.Do(func() {
			closed.Store(true)
			b.Unsubscribe(subID)
			close(ch)
		})
	}
	return ch, cancel
}

func (b *Bus) Unsubscribe(id string) {
	b.mu.Lock()
	delete(b.subs, id)
	b.mu.Unlock()
}

// Publish records the event in history and dispatches it to all matching subscribers.
func (b *Bus) Publish(ev models.PipelineEvent) {
	if ev.Timestamp == "" {
		ev.Timestamp = time.Now().UTC().Format(time.RFC3339)
	}
	if ev.Type == "" {
		ev.Type = "worker_log"
	}

	b.mu.Lock()
	b.history = append([]models.PipelineEvent{ev}, b.history...)
	if len(b.history) > b.maxHist {
		b.history = b.history[:b.maxHist]
	}
	matched := make([]subscription, 0, len(b.subs))
	for _, s := range b.subs {
		if matchesTopic(s.pattern, ev.Type) && s.handler != nil {
			matched = append(matched, s)
		}
	}
	b.mu.Unlock()

	for _, sub := range matched {
		if sub.inline {
			sub.handler(ev)
			continue
		}
		fn := sub.handler
		go fn(ev)
	}
}

// Recent returns up to limit most recent events (newest first).
func (b *Bus) Recent(limit int) []models.PipelineEvent {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if limit <= 0 || limit > len(b.history) {
		limit = len(b.history)
	}
	out := make([]models.PipelineEvent, limit)
	copy(out, b.history[:limit])
	return out
}
