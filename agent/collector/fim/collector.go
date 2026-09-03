package fim

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/hivearmor/sdk/plugins"

	"github.com/hivearmor/agent/agent"
	"github.com/hivearmor/agent/config"
	"github.com/hivearmor/agent/utils"
)

const (
	// DataTypeFIM is the log dataType for file integrity events.
	DataTypeFIM = "fim"

	// baselineDBRelPath is the path of the FIM baseline DB relative to the
	// agent executable directory.
	baselineDBRelPath = "fim" + string(os.PathSeparator) + "baseline.db"

	// maxHashFileSizeBytes is the upper bound for files that will be hashed.
	// Very large files (ISO images, VM disks accidentally on a watched path)
	// are skipped to avoid throughput impact; the change event is still emitted
	// without the hash fields.
	maxHashFileSizeBytes = 100 * 1024 * 1024 // 100 MiB
)

// FIMEvent is the JSON payload written to plugins.Log.Raw for dataType "fim".
type FIMEvent struct {
	// Action is one of CREATE / MODIFY / DELETE / RENAME / PERMISSION_CHANGE
	Action string `json:"action"`

	// Origin fields
	File        string `json:"origin.file"`
	Filename    string `json:"origin.filename"`
	Path        string `json:"origin.path"`
	SHA256      string `json:"origin.sha256,omitempty"`
	MD5         string `json:"origin.md5,omitempty"` //nolint:gosec
	SizeInBytes int64  `json:"origin.sizeInBytes,omitempty"`
	User        string `json:"origin.user,omitempty"`

	// Delta fields (populated for MODIFY / RENAME / PERMISSION_CHANGE)
	OldHash        string `json:"log.old_hash,omitempty"`
	OldPermissions string `json:"log.old_permissions,omitempty"`
	NewPermissions string `json:"log.new_permissions,omitempty"`
	OldOwner       string `json:"log.old_owner,omitempty"`
	NewOwner       string `json:"log.new_owner,omitempty"`

	// Envelope
	Hostname  string `json:"hostname"`
	Timestamp string `json:"@timestamp"`
	DataType  string `json:"dataType"`
}

// Collector implements collector.Collector for FIM.
type Collector struct {
	rules    []WatchRule
	baseline *BaselineDB
	watcher  *fsnotify.Watcher
	queue    chan<- *plugins.Log
	hostname string
	cnf      *config.Config
	cancel   context.CancelFunc
}

// New creates a new FIM Collector using policy-resolved rules (or defaults).
func New(cnf *config.Config) *Collector {
	return &Collector{
		rules: currentStartupRules(),
		cnf:   cnf,
	}
}

// NewWithRules creates a FIM Collector with caller-supplied rules (server policy).
// When replaceDefaults is false, rules are merged with platform defaults.
func NewWithRules(cnf *config.Config, rules []WatchRule) *Collector {
	return &Collector{rules: ResolveWatchRules(rules, agent.FIMModeMerge), cnf: cnf}
}

// NewWithResolvedRules creates a FIM Collector with an already-resolved rule list.
func NewWithResolvedRules(cnf *config.Config, rules []WatchRule) *Collector {
	return &Collector{rules: append([]WatchRule(nil), rules...), cnf: cnf}
}

// Name satisfies the collector.Collector interface.
func (c *Collector) Name() string { return "fim" }

// Start initialises the baseline DB, registers fsnotify watchers, and begins
// emitting FIM events onto queue.  It blocks until ctx is cancelled.
func (c *Collector) Start(ctx context.Context, queue chan<- *plugins.Log) {
	c.queue = queue
	c.hostname, _ = os.Hostname()

	dbPath := filepath.Join(getExecutablePath(), baselineDBRelPath)
	var err error
	c.baseline, err = openBaselineDB(dbPath)
	if err != nil {
		utils.Logger.ErrorF("fim: open baseline DB: %v", err)
		return
	}
	// Defer close immediately after successful open so it runs on any return path,
	// including early returns due to watcher creation failure below.
	defer func() { _ = c.baseline.close() }()

	c.watcher, err = fsnotify.NewWatcher()
	if err != nil {
		utils.Logger.ErrorF("fim: fsnotify.NewWatcher: %v", err)
		return // baseline.close() called by defer above — no leak
	}
	defer c.watcher.Close()

	// Seed baseline and register watchers for all rules (exclude patterns skipped).
	for _, rule := range c.rules {
		if rule.Recursive {
			if err := c.addRecursive(rule); err != nil {
				utils.Logger.ErrorF("fim: add recursive watch %s: %v", rule.Path, err)
			}
		} else {
			if isExcluded(rule.Path, rule) {
				continue
			}
			if err := c.watcher.Add(rule.Path); err != nil {
				utils.Logger.ErrorF("fim: add watch %s: %v", rule.Path, err)
			}
			_ = c.seedBaseline(rule.Path, rule)
		}
	}

	utils.Logger.Info("fim: collector started; watching %d rules", len(c.rules))

	runtimeRulesMu.Lock()
	liveCollector = c
	runtimeRulesMu.Unlock()
	defer func() {
		runtimeRulesMu.Lock()
		if liveCollector == c {
			liveCollector = nil
		}
		runtimeRulesMu.Unlock()
	}()

	childCtx, cancel := context.WithCancel(ctx)
	c.cancel = cancel
	defer cancel()

	// Start Windows Registry FIM in a sibling goroutine (no-op on Linux/macOS).
	startRegistryFIM(childCtx, queue, c.hostname)

	c.loop(childCtx)
}

// replaceWatchRules swaps the active rule set and refreshes watches.
//
// Hot-apply (STAGING CANDIDATE):
//   - New exclude patterns take effect immediately (event filter + skip seed/watch).
//   - New watch roots are registered immediately.
//   - Best-effort Remove of old root paths no longer in the rule set.
//
// Restart still required for a fully clean watch set: recursive subdir watches
// added under a removed root are not enumerated for bulk Remove (fsnotify has
// no portable remove-all). Stale events from leftover watches are dropped when
// no covering rule remains or the path matches exclude.
func (c *Collector) replaceWatchRules(rules []WatchRule) error {
	old := c.rules
	c.rules = append([]WatchRule(nil), rules...)
	if c.watcher == nil {
		return nil
	}

	newRoots := make(map[string]struct{}, len(rules))
	for _, r := range rules {
		newRoots[filepath.Clean(r.Path)] = struct{}{}
	}
	for _, r := range old {
		root := filepath.Clean(r.Path)
		if _, keep := newRoots[root]; keep {
			continue
		}
		if err := c.watcher.Remove(root); err != nil {
			utils.Logger.LogF(100, "fim: best-effort unwatch %s: %v (subdir watches may linger until restart)", root, err)
		}
	}

	for _, rule := range rules {
		if rule.Recursive {
			if err := c.addRecursive(rule); err != nil {
				utils.Logger.ErrorF("fim: policy re-watch recursive %s: %v", rule.Path, err)
			}
		} else {
			if isExcluded(rule.Path, rule) {
				continue
			}
			if err := c.watcher.Add(rule.Path); err != nil {
				utils.Logger.ErrorF("fim: policy re-watch %s: %v", rule.Path, err)
			}
			_ = c.seedBaseline(rule.Path, rule)
		}
	}
	utils.Logger.Info("fim: applied policy watch rules (%d)", len(rules))
	return nil
}

// Stop cancels the collector goroutine.
func (c *Collector) Stop() {
	if c.cancel != nil {
		c.cancel()
	}
}

// loop is the event dispatch loop. It runs until ctx is cancelled.
func (c *Collector) loop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return

		case event, ok := <-c.watcher.Events:
			if !ok {
				return
			}
			c.handleEvent(event)

		case watchErr, ok := <-c.watcher.Errors:
			if !ok {
				return
			}
			utils.Logger.ErrorF("fim: watcher error: %v", watchErr)
		}
	}
}

// handleEvent processes a single fsnotify event and emits a FIM log entry.
func (c *Collector) handleEvent(event fsnotify.Event) {
	path := filepath.Clean(event.Name)

	rule, ok := coveringRule(path, c.rules)
	if !ok {
		// Stale watch after policy replace, or path outside current rules.
		return
	}
	if isExcluded(path, rule) {
		return
	}

	// Skip directories themselves — we watch their contents.
	if info, err := os.Stat(path); err == nil && info.IsDir() {
		// If a new directory was created inside a recursive watch, add it
		// (respecting the covering rule's exclude patterns).
		if event.Op.Has(fsnotify.Create) && rule.Recursive {
			_ = c.addRecursiveUnder(rule, path)
		}
		return
	}

	action := fsnotifyOpToFIMAction(event.Op)
	if action == "" {
		return
	}

	fimEvt := FIMEvent{
		Action:    action,
		File:      path,
		Filename:  filepath.Base(path),
		Path:      filepath.Dir(path),
		Hostname:  c.hostname,
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		DataType:  DataTypeFIM,
	}

	// Load existing baseline for delta computation.
	old, _ := c.baseline.get(path)
	if old != nil {
		fimEvt.OldHash = old.SHA256
		fimEvt.OldPermissions = old.Permissions
		fimEvt.OldOwner = old.Owner
	}

	switch action {
	case "DELETE":
		_ = c.baseline.delete(path)

	default: // CREATE, MODIFY, RENAME, PERMISSION_CHANGE
		info, err := os.Stat(path)
		if err != nil {
			// File vanished between event and stat — treat as DELETE.
			_ = c.baseline.delete(path)
			fimEvt.Action = "DELETE"
			break
		}

		fimEvt.SizeInBytes = info.Size()
		fimEvt.NewPermissions = fmt.Sprintf("%04o", info.Mode().Perm())
		fimEvt.NewOwner = fileOwner(info)

		if info.Size() <= maxHashFileSizeBytes && !info.IsDir() {
			sha, md5sum, _, hashErr := computeHashes(path)
			if hashErr == nil {
				fimEvt.SHA256 = sha
				fimEvt.MD5 = md5sum
			}
		}

		entry := &BaselineEntry{
			Path:        path,
			SHA256:      fimEvt.SHA256,
			MD5:         fimEvt.MD5,
			SizeBytes:   fimEvt.SizeInBytes,
			Permissions: fimEvt.NewPermissions,
			Owner:       fimEvt.NewOwner,
			ModTime:     time.Now().UnixNano(),
		}
		// Preserve the existing ID so GORM does an UPDATE not INSERT.
		if old != nil {
			entry.ID = old.ID
			// Only emit MODIFY if hash actually changed.
			if action == "MODIFY" && old.SHA256 != "" && fimEvt.SHA256 != "" && old.SHA256 == fimEvt.SHA256 &&
				old.Permissions == fimEvt.NewPermissions && old.Owner == fimEvt.NewOwner {
				// No real change (e.g. access-time update); skip.
				return
			}
		}
		_ = c.baseline.upsert(entry)
	}

	raw, err := json.Marshal(fimEvt)
	if err != nil {
		utils.Logger.ErrorF("fim: marshal event: %v", err)
		return
	}

	hostname := c.hostname
	if c.cnf != nil {
		hostname = fmt.Sprintf("%s (agent-%d)", c.hostname, c.cnf.AgentID)
	}

	log := &plugins.Log{
		DataType:   DataTypeFIM,
		DataSource: hostname,
		Timestamp:  fimEvt.Timestamp,
		Raw:        string(raw),
	}

	agent.Offer(c.queue, "fim", log)
}

// addRecursive registers all subdirectories under rule.Path with fsnotify and
// seeds the baseline for each non-excluded file found.
func (c *Collector) addRecursive(rule WatchRule) error {
	return c.addRecursiveUnder(rule, rule.Path)
}

// addRecursiveUnder walks root (must be under rule.Path) applying rule excludes.
func (c *Collector) addRecursiveUnder(rule WatchRule, root string) error {
	return filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // skip unreadable dirs
		}
		if isExcluded(path, rule) {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if d.IsDir() {
			if watchErr := c.watcher.Add(path); watchErr != nil {
				utils.Logger.ErrorF("fim: watch %s: %v", path, watchErr)
			}
		} else {
			_ = c.seedBaseline(path, rule)
		}
		return nil
	})
}

// seedBaseline computes and stores the initial baseline for path if it is not
// already present in the DB.  Skips excluded paths and files above maxHashFileSizeBytes.
func (c *Collector) seedBaseline(path string, rule WatchRule) error {
	if isExcluded(path, rule) {
		return nil
	}
	existing, err := c.baseline.get(path)
	if err != nil {
		return err
	}
	if existing != nil {
		return nil // already have a baseline for this file
	}

	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return nil
	}

	entry := &BaselineEntry{
		Path:        path,
		Permissions: fmt.Sprintf("%04o", info.Mode().Perm()),
		Owner:       fileOwner(info),
		SizeBytes:   info.Size(),
		ModTime:     info.ModTime().UnixNano(),
	}

	if info.Size() <= maxHashFileSizeBytes {
		sha, md5sum, _, hashErr := computeHashes(path)
		if hashErr == nil {
			entry.SHA256 = sha
			entry.MD5 = md5sum
		}
	}

	return c.baseline.upsert(entry)
}

// fsnotifyOpToFIMAction converts an fsnotify.Op to a FIM action string.
func fsnotifyOpToFIMAction(op fsnotify.Op) string {
	switch {
	case op.Has(fsnotify.Create):
		return "CREATE"
	case op.Has(fsnotify.Write):
		return "MODIFY"
	case op.Has(fsnotify.Remove):
		return "DELETE"
	case op.Has(fsnotify.Rename):
		return "RENAME"
	case op.Has(fsnotify.Chmod):
		return "PERMISSION_CHANGE"
	default:
		return ""
	}
}

// coveringRule returns the most specific watch rule that covers path.
// Specificity is the longest matching rule.Path prefix. Non-recursive rules
// only cover the root itself or its immediate children.
func coveringRule(path string, rules []WatchRule) (WatchRule, bool) {
	clean := filepath.Clean(path)
	var best WatchRule
	bestLen := -1
	found := false
	for _, r := range rules {
		root := filepath.Clean(r.Path)
		if !pathUnderRoot(clean, root, r.Recursive) {
			continue
		}
		if len(root) > bestLen {
			best = r
			bestLen = len(root)
			found = true
		}
	}
	return best, found
}

// pathUnderRoot reports whether path is the root or a descendant allowed by recursive.
func pathUnderRoot(path, root string, recursive bool) bool {
	if path == root {
		return true
	}
	sep := string(os.PathSeparator)
	if !strings.HasPrefix(path, root+sep) {
		return false
	}
	if recursive {
		return true
	}
	rel, err := filepath.Rel(root, path)
	if err != nil || rel == "." {
		return false
	}
	// Non-recursive: only immediate children.
	return !strings.Contains(rel, sep)
}

// isExcluded returns true if path matches any exclusion glob in rule.
func isExcluded(path string, rule WatchRule) bool {
	if len(rule.Exclude) == 0 {
		return false
	}
	root := filepath.Clean(rule.Path)
	clean := filepath.Clean(path)
	for _, pattern := range rule.Exclude {
		pattern = strings.TrimSpace(pattern)
		if pattern == "" {
			continue
		}
		rel, err := filepath.Rel(root, clean)
		if err != nil {
			continue
		}
		matched, err := filepath.Match(pattern, rel)
		if err == nil && matched {
			return true
		}
		// Also check if the pattern matches just the basename.
		if matched2, err2 := filepath.Match(pattern, filepath.Base(clean)); err2 == nil && matched2 {
			return true
		}
	}
	return false
}

// shouldDropPath is true when path has no covering rule or matches exclude.
// Exported for tests via this package-level helper name used by unit tests.
func shouldDropPath(path string, rules []WatchRule) bool {
	rule, ok := coveringRule(path, rules)
	if !ok {
		return true
	}
	return isExcluded(path, rule)
}

// getExecutablePath returns the directory of the running executable.
// The FIM baseline DB is stored adjacent to the agent binary.
func getExecutablePath() string {
	exe, err := os.Executable()
	if err != nil {
		return "."
	}
	return filepath.Dir(exe)
}
