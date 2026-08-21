package tamper

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestWatchdog_DetectsMissingBinary(t *testing.T) {
	triggered := make(chan string, 1)
	w := &Watchdog{
		binaryPath:   "/nonexistent/path/agent",
		baselineHash: "abc123",
		onTampered: func(reason string) {
			triggered <- reason
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Override ticker to fire immediately for testing.
	go func() {
		w.check() // triggers onTampered synchronously in test
	}()

	select {
	case reason := <-triggered:
		assert.Contains(t, reason, "inaccessible")
	case <-ctx.Done():
		t.Fatal("watchdog did not trigger within timeout")
	}
}

func TestWatchdog_DetectsHashChange(t *testing.T) {
	triggered := make(chan string, 1)

	// Create a temp file and hash it.
	f, _ := os.CreateTemp("", "agent-test-*")
	_, _ = f.WriteString("original content")
	f.Close()
	defer os.Remove(f.Name())

	origHash, _ := hashFile(f.Name())
	w := &Watchdog{
		binaryPath:   f.Name(),
		baselineHash: origHash,
		onTampered: func(reason string) {
			triggered <- reason
		},
	}

	// Modify the file to trigger detection. Truncate then write new content.
	ff, _ := os.OpenFile(f.Name(), os.O_WRONLY|os.O_TRUNC, 0644)
	_, _ = ff.WriteString("tampered content")
	_ = ff.Sync()
	ff.Close()

	// check() calls onTampered synchronously (the go keyword is only used when
	// the caller is a goroutine; in tests we call check() directly).
	w.check()

	select {
	case reason := <-triggered:
		assert.Contains(t, reason, "hash mismatch")
	default:
		t.Fatal("watchdog did not detect hash change")
	}
}

func TestHashFile(t *testing.T) {
	f, _ := os.CreateTemp("", "hash-test-*")
	_, _ = f.WriteString("hello world")
	_ = f.Sync()
	f.Close()
	defer os.Remove(f.Name())

	h, err := hashFile(f.Name())
	assert.NoError(t, err)
	assert.Len(t, h, 64, "SHA-256 hex string must be 64 characters")
	assert.NotEmpty(t, h)
}
