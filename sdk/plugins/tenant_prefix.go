package plugins

import (
	"context"
	"sync"
	"time"

	"github.com/hivearmor/sdk/catcher"
)

// agentPrefixCacheTTL is the fixed time-to-live for every AgentPrefixCache entry.
const agentPrefixCacheTTL = 5 * time.Minute

// agentPrefixEntry holds the cached tenant prefix and its expiry deadline.
type agentPrefixEntry struct {
	prefix    string
	expiresAt time.Time
}

// agentPrefixCacheT is a sync.RWMutex-guarded in-memory cache that maps agent
// identifiers to their resolved tenant prefix values.  The TTL is fixed at
// agentPrefixCacheTTL and is NOT mutable at runtime.
//
// nowFunc is an optional clock override used exclusively in tests to simulate
// time passage for TTL boundary assertions.  Production callers leave it nil,
// in which case Get() falls back to time.Now().
type agentPrefixCacheT struct {
	mu      sync.RWMutex
	entries map[string]agentPrefixEntry
	ttl     time.Duration
	lookup  func(ctx context.Context, agentID string) (string, error)
	nowFunc func() time.Time // nil in production; injected by tests
}

// agentPrefixCache is the package-scoped singleton.
var agentPrefixCache = &agentPrefixCacheT{
	entries: make(map[string]agentPrefixEntry),
	ttl:     agentPrefixCacheTTL,
}

// Get returns (prefix, true) when a fresh (non-expired) entry exists for
// agentID.  If the entry is absent or stale it returns ("", false).
//
// Get acquires only the read lock and MUST NOT invoke c.lookup; that
// responsibility belongs exclusively to the caller (ResolveAndSetTenantPrefix).
//
// If c.nowFunc is set (test injection only) it is used instead of time.Now()
// so that TTL boundary tests can control the clock without sleeping.
func (c *agentPrefixCacheT) Get(agentID string) (string, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	now := time.Now()
	if c.nowFunc != nil {
		now = c.nowFunc()
	}

	entry, ok := c.entries[agentID]
	if !ok || entry.expiresAt.Before(now) || entry.expiresAt.Equal(now) {
		return "", false
	}
	return entry.prefix, true
}

// Set stores prefix under agentID with expiresAt = now + TTL.
// It acquires the write lock for the duration of the map write.
func (c *agentPrefixCacheT) Set(agentID, prefix string) {
	c.mu.Lock()
	c.entries[agentID] = agentPrefixEntry{
		prefix:    prefix,
		expiresAt: time.Now().Add(c.ttl),
	}
	c.mu.Unlock()
}

// RegisterAgentPrefixLookup stores fn as the callback invoked on a cache miss.
// It should be called once at plugin startup.  Any previously registered
// callback is replaced.
func RegisterAgentPrefixLookup(fn func(ctx context.Context, agentID string) (string, error)) {
	agentPrefixCache.mu.Lock()
	agentPrefixCache.lookup = fn
	agentPrefixCache.mu.Unlock()
}

// ResolveAndSetTenantPrefix populates event.TenantPrefix once, before the
// correlation pipeline processes the event.  It must be called exactly once per
// event immediately after event decoding and before any correlation, enrichment,
// or write-path call.
//
// Behaviour summary:
//   - nil event              → error (catcher.Error)
//   - empty event.TenantId  → sets TenantPrefix = ""; returns nil; no cache access
//   - cache hit              → sets TenantPrefix from cache; returns nil
//   - cache miss, fn nil    → sets TenantPrefix = ""; returns nil
//   - cache miss, fn ok     → calls fn; on success caches result (incl. ""); returns nil
//   - cache miss, fn error  → does NOT cache; returns wrapped error
func ResolveAndSetTenantPrefix(ctx context.Context, event *Event) error {
	if event == nil {
		return catcher.Error("nil event passed to ResolveAndSetTenantPrefix", nil, nil)
	}

	// Empty TenantId ⇒ untagged / single-tenant event — no lookup needed.
	if event.TenantId == "" {
		event.TenantPrefix = ""
		return nil
	}

	// Fast path: cache hit.
	if prefix, ok := agentPrefixCache.Get(event.TenantId); ok {
		event.TenantPrefix = prefix
		return nil
	}

	// Slow path: snapshot the lookup callback under a read lock, then invoke
	// it outside the lock so that concurrent readers are not blocked.
	agentPrefixCache.mu.RLock()
	fn := agentPrefixCache.lookup
	agentPrefixCache.mu.RUnlock()

	if fn == nil {
		// No lookup registered — single-tenant deployment; treat as untagged.
		event.TenantPrefix = ""
		return nil
	}

	prefix, err := fn(ctx, event.TenantId)
	if err != nil {
		// Do NOT cache on error.
		// Do NOT log agentID or error content per Req 3.10 / 7.1.
		return catcher.Error("failed to resolve agent tenant prefix", err, map[string]any{
			"agent_id": event.TenantId,
		})
	}

	// Cache both positive and negative (empty-string) results.
	agentPrefixCache.Set(event.TenantId, prefix)
	event.TenantPrefix = prefix
	return nil
}
