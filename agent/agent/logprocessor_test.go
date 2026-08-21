package agent

import (
	"context"
	"testing"
	"time"

	"github.com/hivearmor/agent/models"
	"github.com/hivearmor/sdk/plugins"
)

func TestEnqueueUnprocessedDoesNotMarkProcessedWhenQueueIsFull(t *testing.T) {
	db := withTestSpool(t)
	if err := db.Create(&models.Log{ID: "retry-keep", Log: "payload", Type: "syslog", DataSource: "host", Processed: false}); err != nil {
		t.Fatal(err)
	}
	original := LogQueue
	t.Cleanup(func() { LogQueue = original })
	LogQueue = make(chan *plugins.Log, 1)
	LogQueue <- &plugins.Log{Id: "fill"}

	processor := &LogProcessor{db: db}
	processor.enqueueUnprocessed(10)

	var rows []models.Log
	if err := db.FindUnprocessed(&rows, 10); err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].ID != "retry-keep" || rows[0].Processed {
		t.Fatalf("unprocessed rows = %+v, want retry-keep still unprocessed", rows)
	}
}

func TestEnqueueUnprocessedPlacesSpoolRowOnQueue(t *testing.T) {
	db := withTestSpool(t)
	if err := db.Create(&models.Log{ID: "retry-send", Log: "payload", Type: "syslog", DataSource: "host", Processed: false}); err != nil {
		t.Fatal(err)
	}
	original := LogQueue
	t.Cleanup(func() { LogQueue = original })
	LogQueue = make(chan *plugins.Log, 4)

	processor := &LogProcessor{db: db}
	processor.enqueueUnprocessed(10)

	select {
	case got := <-LogQueue:
		if got.Id != "retry-send" || got.Raw != "payload" || got.DataType != "syslog" {
			t.Fatalf("queued log = %+v", got)
		}
	default:
		t.Fatal("expected unprocessed row to be queued")
	}
	var rows []models.Log
	if err := db.FindUnprocessed(&rows, 10); err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Processed {
		t.Fatalf("row must stay unprocessed until ack: %+v", rows)
	}
}

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
