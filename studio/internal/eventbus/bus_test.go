package eventbus

import (
	"conan-studio/internal/models"
	"fmt"
	"testing"
)

func TestSubscribeChanPreservesPublishOrder(t *testing.T) {
	b := New(10)
	ch, cancel := b.SubscribeChan("*", 2000)
	defer cancel()
	for i := 0; i < 1000; i++ {
		b.Publish(models.PipelineEvent{Type: "director_plan_log", Message: fmt.Sprint(i)})
	}
	for i := 0; i < 1000; i++ {
		ev := <-ch
		if ev.Message != fmt.Sprint(i) {
			t.Fatalf("event %d arrived as %q: out of order", i, ev.Message)
		}
	}
}
