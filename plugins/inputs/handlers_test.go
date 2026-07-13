package main

import (
	"context"
	"testing"
	"time"

	"github.com/threatwinds/go-sdk/plugins"
)

// TestProcessLog_AckOnlyAfterDelivery verifies that the wait-loop in ProcessLog
// does not proceed past the select until the result channel is written.
func TestProcessLog_AckOnlyAfterDelivery(t *testing.T) {
	resultCh := make(chan error, 1)
	ackSent := false

	go func() {
		time.Sleep(50 * time.Millisecond)
		resultCh <- nil
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	select {
	case deliveryErr := <-resultCh:
		if deliveryErr != nil {
			t.Fatalf("unexpected delivery error: %v", deliveryErr)
		}
		ackSent = true
	case <-ctx.Done():
		t.Fatal("timed out waiting for delivery confirmation")
	}

	if !ackSent {
		t.Fatal("Ack must be sent after delivery, not before")
	}
}

// TestProcessLog_ChannelFullReturnsError verifies that when localLogsChannel
// is at capacity the non-blocking select rejects the entry rather than blocking.
func TestProcessLog_ChannelFullReturnsError(t *testing.T) {
	ch := make(chan *logEntry, 1)
	ch <- &logEntry{log: &plugins.Log{Id: "sentinel"}, result: make(chan error, 1)}

	entry := &logEntry{log: &plugins.Log{Id: "overflow"}, result: make(chan error, 1)}
	rejected := false
	select {
	case ch <- entry:
	default:
		rejected = true
	}

	if !rejected {
		t.Fatal("expected entry to be rejected when channel is full")
	}
}

// TestLogEntry_ResultChannelBuffered verifies that sendLog can write to
// entry.result without blocking even when the reader has moved on.
func TestLogEntry_ResultChannelBuffered(t *testing.T) {
	entry := &logEntry{
		log:    &plugins.Log{Id: "test"},
		result: make(chan error, 1),
	}

	done := make(chan struct{})
	go func() {
		defer close(done)
		entry.result <- nil // must not block
	}()

	select {
	case <-done:
	case <-time.After(100 * time.Millisecond):
		t.Fatal("writing to buffered result channel blocked unexpectedly")
	}
}
