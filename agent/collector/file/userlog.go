package file

import (
	"context"
	"strings"
	"sync"

	"github.com/hivearmor/agent/agent"
	"github.com/hivearmor/agent/utils"
)

// PT-4 User Log enforcement.
//
// The userLog template section (SPEC-PT-4 §2) tails arbitrary files with an optional
// log prefix. This is a first-class capability for the agent: the file collector already
// tails files, so userLog reuses that machinery directly. This keeps the honest
// capability claim "userLog = enforced".
//
// Design: a self-contained registry that owns the live FileCollector and the desired
// userLog tail set, so wiring userLog does NOT mutate the shared collector config plane
// (schema.ReadCollectorConfig) — important on a deployed agent. Desired tails arriving
// before the collector starts are stashed by the agent package and consumed at Start.

const userLogDataTypePrefix = "userlog"

var (
	userLogMu          sync.Mutex
	liveFileCollector  *FileCollector
	liveFileCtx        context.Context
	currentUserLogKeys map[string]struct{} // active "dataType:path" keys from userLog
)

// RegisterUserLogApplier wires agent APPLY_POLICY userLog → live file tailers.
// Call once at startup (alongside fim.RegisterPolicyApplier). Multiline grouping is not
// yet applied (each line is emitted as-is); logPrefix is honoured as the event dataType.
func RegisterUserLogApplier() {
	agent.SetUserLogPolicyApplier(func(tails []agent.UserLogTail) error {
		return applyUserLogTails(tails)
	})
}

// bindLiveCollector records the running collector + its context so the applier can start
// tail goroutines. Called from Start.
func bindLiveCollector(ctx context.Context, fc *FileCollector) {
	userLogMu.Lock()
	liveFileCollector = fc
	liveFileCtx = ctx
	pending, ok := agent.PeekPendingUserLogPolicy()
	userLogMu.Unlock()
	if ok && len(pending) > 0 {
		if err := applyUserLogTails(pending); err != nil {
			utils.Logger.ErrorF("file collector: userLog startup apply failed: %v", err)
		}
	}
}

// unbindLiveCollector clears the live collector binding on Stop.
func unbindLiveCollector(fc *FileCollector) {
	userLogMu.Lock()
	defer userLogMu.Unlock()
	if liveFileCollector == fc {
		liveFileCollector = nil
		liveFileCtx = nil
		currentUserLogKeys = nil
	}
}

// userLogDataType derives the event dataType from the logPrefix (sanitised, data-free).
func userLogDataType(logPrefix string) string {
	p := strings.TrimSpace(logPrefix)
	if p == "" {
		return userLogDataTypePrefix
	}
	// Keep it simple and safe: lower-case, strip whitespace to underscores.
	p = strings.ToLower(strings.Join(strings.Fields(p), "_"))
	return userLogDataTypePrefix + ":" + p
}

// applyUserLogTails ensures a tail watcher exists for each userLog spec and stops
// watchers for files no longer in the desired set. Safe to call repeatedly.
func applyUserLogTails(tails []agent.UserLogTail) error {
	userLogMu.Lock()
	fc := liveFileCollector
	ctx := liveFileCtx
	userLogMu.Unlock()

	if fc == nil || ctx == nil {
		// Collector not running yet — the agent package has already stashed these;
		// bindLiveCollector will replay them at Start.
		return nil
	}

	desired := make(map[string]struct{}, len(tails))
	for _, t := range tails {
		path := strings.TrimSpace(t.FullFileName)
		if path == "" {
			continue
		}
		dataType := userLogDataType(t.LogPrefix)
		key := dataType + ":" + path
		desired[key] = struct{}{}
		fc.ensureWatcher(ctx, dataType, path)
	}

	// Stop tailers for userLog files that dropped out of the desired set.
	userLogMu.Lock()
	for key := range currentUserLogKeys {
		if _, keep := desired[key]; !keep {
			fc.stopWatcherByKey(key)
		}
	}
	currentUserLogKeys = desired
	userLogMu.Unlock()

	utils.Logger.Info("file collector: userLog applied %d tail spec(s)", len(desired))
	return nil
}
