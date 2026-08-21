package catcher

import (
	"os"
	"testing"
)

// TestMain configures the catcher package for deterministic test behavior.
//
// The production init() reads env vars (CATCHER_BEAUTY, CATCHER_ASYNC,
// CATCHER_NO_TRACE) and defaults async mode to on and trace to off. Both
// defaults defeat tests in this package:
//
//   - Async mode dispatches log writes to a background goroutine that writes
//     to os.Stdout. Tests that redirect os.Stdout via os.Pipe() and read the
//     captured output cannot rely on the async goroutine having flushed
//     before the pipe writer is closed, causing the reader to see partial or
//     empty output.
//   - Trace-off leaves SdkError.Trace and SdkLog.Trace empty, which breaks
//     tests that assert on those fields.
//
// TestMain forces synchronous mode with trace enabled so every test in this
// package observes deterministic output regardless of the shell environment.
func TestMain(m *testing.M) {
	// Configure(beauty=false, async=false, noTrace=false)
	Configure(false, false, false)
	os.Exit(m.Run())
}
