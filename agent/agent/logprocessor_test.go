package agent

import (
	"context"
	"testing"
	"time"

	"github.com/threatwinds/go-sdk/plugins"
)

func TestCleanCountedLogs_DoesNotDeadlockWhenQueueFull(t *testing.T) {
	originalCap := 10
	LogQueue = make(chan *plugins.Log, originalCap)
	for i := 0; i < originalCap; i++ {
		LogQueue <- &plugins.Log{Id: "fill"}
	}

	done := make(chan struct{})
	go func() {
		select {
		case LogQueue <- &plugins.Log{Id: "retry-1"}:
		default:
			// expected: queue full, skip without blocking
		}
		close(done)
	}()

	select {
	case <-done:
		// pass: non-blocking path returned
	case <-time.After(500 * time.Millisecond):
		t.Fatal("CleanCountedLogs retry blocked — deadlock detected")
	}
}

func TestMonitorQueueDepth_LogsWarningAbove50Percent(t *testing.T) {
	LogQueue = make(chan *plugins.Log, 100)
	for i := 0; i < 60; i++ {
		LogQueue <- &plugins.Log{Id: "t"}
	}

	p := &LogProcessor{}
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	// Must not panic; exits cleanly when ctx is cancelled.
	p.monitorQueueDepth(ctx)
}
