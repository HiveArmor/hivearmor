package plugins

// resolve_tenant_prefix_test.go — example unit tests for AgentPrefixCache and
// ResolveAndSetTenantPrefix.
//
// Package: plugins (internal) — required so the test can access the unexported
// agentPrefixCache variable, agentPrefixEntry type, and agentPrefixCacheT type
// in order to reset state between cases.
//
// Requirements: 4.9, 4.10

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
)

// resetAgentPrefixCacheForTest clears the in-memory cache and unregisters any
// lookup function.  It must be called after every test case to prevent state
// from leaking between cases.
func resetAgentPrefixCacheForTest() {
	agentPrefixCache.mu.Lock()
	agentPrefixCache.entries = make(map[string]agentPrefixEntry)
	agentPrefixCache.lookup = nil
	agentPrefixCache.mu.Unlock()
}

// TestResolveAndSetTenantPrefix is a table-driven test covering the seven
// required cases from Requirement 4.9.
func TestResolveAndSetTenantPrefix(t *testing.T) {
	ctx := context.Background()

	tests := []struct {
		name        string
		setup       func()
		event       *Event
		wantErr     bool
		wantPrefix  string
		wantCached  bool   // whether the TenantId should be in the cache after the call
		cachedID    string // the agentID to check in the cache post-call
	}{
		{
			// (a) nil event must return a non-nil error.
			name:    "nil event",
			setup:   func() {},
			event:   nil,
			wantErr: true,
		},
		{
			// (b) empty TenantId must set TenantPrefix = "" and return nil without
			// touching the cache or the lookup function.
			name:  "empty TenantId",
			setup: func() {},
			event: &Event{
				Id:       "evt-empty-tenant",
				TenantId: "",
			},
			wantErr:    false,
			wantPrefix: "",
			wantCached: false,
		},
		{
			// (c) cache hit: pre-populate the cache then call — no lookup needed.
			name: "cache hit",
			setup: func() {
				agentPrefixCache.Set("agent-cached", "acme")
				// Register a spy that would panic if called; the cache hit
				// path must never invoke the lookup function.
				agentPrefixCache.mu.Lock()
				agentPrefixCache.lookup = func(_ context.Context, id string) (string, error) {
					panic(fmt.Sprintf("lookup must not be called on cache hit for id=%q", id))
				}
				agentPrefixCache.mu.Unlock()
			},
			event: &Event{
				Id:       "evt-cache-hit",
				TenantId: "agent-cached",
			},
			wantErr:    false,
			wantPrefix: "acme",
			wantCached: true,
			cachedID:   "agent-cached",
		},
		{
			// (d) cache miss with successful non-empty lookup: the result must be
			// cached and assigned to event.TenantPrefix.
			name: "cache miss successful lookup",
			setup: func() {
				RegisterAgentPrefixLookup(func(_ context.Context, id string) (string, error) {
					return "tenant-" + id, nil
				})
			},
			event: &Event{
				Id:       "evt-miss-ok",
				TenantId: "agent-miss",
			},
			wantErr:    false,
			wantPrefix: "tenant-agent-miss",
			wantCached: true,
			cachedID:   "agent-miss",
		},
		{
			// (e) cache miss with lookup error: ResolveAndSetTenantPrefix must
			// return a non-nil error and must NOT cache the failing agent ID.
			name: "cache miss lookup error",
			setup: func() {
				RegisterAgentPrefixLookup(func(_ context.Context, _ string) (string, error) {
					return "", errors.New("db error")
				})
			},
			event: &Event{
				Id:       "evt-miss-err",
				TenantId: "agent-err",
			},
			wantErr:    true,
			wantCached: false,
			cachedID:   "agent-err",
		},
		{
			// (f) cache miss with empty-string lookup result: the empty string is a
			// valid (negative-cached) result — it must be stored and assigned.
			name: "cache miss empty-string lookup result",
			setup: func() {
				RegisterAgentPrefixLookup(func(_ context.Context, _ string) (string, error) {
					return "", nil
				})
			},
			event: &Event{
				Id:       "evt-miss-empty",
				TenantId: "agent-empty",
			},
			wantErr:    false,
			wantPrefix: "",
			wantCached: true,
			cachedID:   "agent-empty",
		},
		{
			// (g) no lookup function registered: must set TenantPrefix = "" and
			// return nil — single-tenant / unregistered deployment path.
			name:  "no lookup function registered",
			setup: func() { /* deliberately leave lookup == nil */ },
			event: &Event{
				Id:       "evt-no-lookup",
				TenantId: "agent-no-lookup",
			},
			wantErr:    false,
			wantPrefix: "",
			wantCached: false,
			cachedID:   "agent-no-lookup",
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			// Always start from a clean state.
			resetAgentPrefixCacheForTest()
			tc.setup()

			err := ResolveAndSetTenantPrefix(ctx, tc.event)

			// Error expectation.
			if tc.wantErr && err == nil {
				t.Fatalf("expected non-nil error, got nil")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("expected nil error, got: %v", err)
			}

			// No further assertions for the nil-event case.
			if tc.event == nil {
				return
			}

			// TenantPrefix assertion.
			if !tc.wantErr && tc.event.TenantPrefix != tc.wantPrefix {
				t.Fatalf("event.TenantPrefix = %q, want %q", tc.event.TenantPrefix, tc.wantPrefix)
			}

			// Cache state assertion.
			if tc.cachedID != "" {
				_, cached := agentPrefixCache.Get(tc.cachedID)
				if tc.wantCached && !cached {
					t.Fatalf("expected %q to be cached after call, but Get returned false", tc.cachedID)
				}
				if !tc.wantCached && cached {
					t.Fatalf("expected %q NOT to be cached after call, but Get returned true", tc.cachedID)
				}
			}

			// Clean up after each sub-test.
			resetAgentPrefixCacheForTest()
		})
	}
}

// TestResolveAndSetTenantPrefix_Concurrent spawns exactly 100 goroutines, each
// calling ResolveAndSetTenantPrefix with a distinct TenantId.  After all
// goroutines complete, the test asserts that agentPrefixCache.Get returns
// (prefix, true) for every distinct id — confirming that concurrent writes do
// not corrupt the cache and that all entries are persisted.
//
// This test is also expected to pass cleanly under the -race detector.
//
// Requirement: 4.10
func TestResolveAndSetTenantPrefix_Concurrent(t *testing.T) {
	const numGoroutines = 100

	// Always start from a clean state.
	resetAgentPrefixCacheForTest()
	defer resetAgentPrefixCacheForTest()

	ctx := context.Background()

	// Register a single deterministic lookup function that derives the prefix
	// from the agentID.  The lookup function is safe for concurrent use.
	RegisterAgentPrefixLookup(func(_ context.Context, agentID string) (string, error) {
		return "prefix-" + agentID, nil
	})

	// Build the set of distinct TenantId values upfront.
	ids := make([]string, numGoroutines)
	for i := 0; i < numGoroutines; i++ {
		ids[i] = fmt.Sprintf("agent-%d", i)
	}

	var wg sync.WaitGroup
	wg.Add(numGoroutines)

	for i := 0; i < numGoroutines; i++ {
		i := i
		go func() {
			defer wg.Done()
			ev := &Event{
				Id:       fmt.Sprintf("evt-%d", i),
				TenantId: ids[i],
			}
			if err := ResolveAndSetTenantPrefix(ctx, ev); err != nil {
				// Cannot call t.Fatalf from a non-test goroutine; record via t.Errorf
				// is fine because we check after Wait.
				t.Errorf("goroutine %d: unexpected error: %v", i, err)
			}
		}()
	}

	wg.Wait()

	// After all goroutines have completed, every distinct id must be cached.
	for i := 0; i < numGoroutines; i++ {
		id := ids[i]
		prefix, ok := agentPrefixCache.Get(id)
		if !ok {
			t.Errorf("agentPrefixCache.Get(%q) returned false; expected cached entry", id)
			continue
		}
		want := "prefix-" + id
		if prefix != want {
			t.Errorf("agentPrefixCache.Get(%q) = %q, want %q", id, prefix, want)
		}
	}
}
