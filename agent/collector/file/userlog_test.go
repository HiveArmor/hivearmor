package file

import (
	"context"
	"testing"
)

func TestUserLogDataType(t *testing.T) {
	cases := map[string]string{
		"":          "userlog",
		"APP":       "userlog:app",
		"  My App ": "userlog:my_app",
		"Nginx":     "userlog:nginx",
	}
	for in, want := range cases {
		if got := userLogDataType(in); got != want {
			t.Fatalf("userLogDataType(%q)=%q want %q", in, got, want)
		}
	}
}

// RegisterUserLogApplier must be safe to call and wire the agent applier without panic.
func TestRegisterUserLogApplier_NoPanic(t *testing.T) {
	RegisterUserLogApplier()
	// No live collector bound → applying tails is a safe no-op (stashing handled by the
	// agent package), must not panic.
	if err := applyUserLogTails(nil); err != nil {
		t.Fatalf("applyUserLogTails(nil) with no live collector: %v", err)
	}
}

// TestIsUserLogWatcher pins which watchers reconcile must preserve.
func TestIsUserLogWatcher(t *testing.T) {
	cases := []struct {
		dataType string
		want     bool
	}{
		{"userlog", true},
		{"userlog:nginx", true},
		{"userlog:my_app", true},
		{"syslog", false},
		{"iis", false},
		{"", false},
		{"useful", false},   // must not match on prefix substring
		{"userlogs", false}, // not the exact token and not "userlog:"
	}
	for _, c := range cases {
		got := isUserLogWatcher(&fileWatcher{dataType: c.dataType})
		if got != c.want {
			t.Fatalf("isUserLogWatcher(dataType=%q)=%v want %v", c.dataType, got, c.want)
		}
	}
	if isUserLogWatcher(nil) {
		t.Fatalf("isUserLogWatcher(nil) must be false")
	}
}

// TestReconcilePreservesUserLogWatchers is the Finding-A regression guard: userLog
// tailers are owned by the userLog applier (not by cnf.FileIntegrations), so a
// reconcile pass (fired by the config-file watch and the fallback ticker) must NOT
// tear them down. A config-type watcher absent from the desired set is still removed.
func TestReconcilePreservesUserLogWatchers(t *testing.T) {
	fc := New()

	// A userLog-owned tailer (cancel is a no-op so reconcile's teardown path is inert).
	userKey := "userlog:app:/var/log/app.log"
	fc.watchers[userKey] = &fileWatcher{dataType: "userlog:app", path: "/var/log/app.log", cancel: func() {}}

	// A config-owned tailer not present in any (empty) desired set.
	cfgKey := "syslog:/var/log/orphan.log"
	fc.watchers[cfgKey] = &fileWatcher{dataType: "syslog", path: "/var/log/orphan.log", cancel: func() {}}

	// reconcile reads schema.ReadCollectorConfig(); with no file integrations the
	// desired set is empty (or the read errors and reconcile returns early). In the
	// empty-config case the config-owned watcher is removed and the userLog one is kept;
	// in the early-return case both remain. Either way, the userLog watcher must survive.
	fc.reconcile(context.Background())

	fc.mu.RLock()
	_, userAlive := fc.watchers[userKey]
	fc.mu.RUnlock()
	if !userAlive {
		t.Fatalf("reconcile tore down the userLog watcher %q; it must be preserved", userKey)
	}
}
