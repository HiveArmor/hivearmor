// tenant_prefix_property_test.go — property-based tests for TenantPrefix
// field, AgentPrefixCache, and ResolveAndSetTenantPrefix.
//
// Package: plugins (internal) — required to access unexported types
// agentPrefixCacheT, agentPrefixEntry, agentPrefixCache, and
// resetAgentPrefixCacheForTest (defined in resolve_tenant_prefix_test.go).
//
// All properties use a manual iteration loop (no external PBT library) to keep
// dependencies contained within sdk/go.mod.  Each property runs at least 100
// iterations, seeded from math/rand.

// Feature: sprint-22-tenant-index-routing

package plugins

import (
	"bytes"
	"context"
	"fmt"
	"math/rand"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
	"unicode/utf8"

	"google.golang.org/protobuf/proto"
)

// ──────────────────────────────────────────────────────────────────────────────
// helpers shared across properties
// ──────────────────────────────────────────────────────────────────────────────

const propIterations = 100

// randString returns a random UTF-8 string of length [1, maxLen] characters.
// It uses printable ASCII so the strings are human-readable in failure output.
func randString(rng *rand.Rand, maxLen int) string {
	if maxLen < 1 {
		maxLen = 1
	}
	n := 1 + rng.Intn(maxLen)
	b := make([]byte, n)
	for i := range b {
		// printable ASCII: 0x20 (' ') through 0x7E ('~')
		b[i] = byte(0x20 + rng.Intn(0x5F))
	}
	return string(b)
}

// ──────────────────────────────────────────────────────────────────────────────
// Property 4 — Event TenantPrefix zero-value and round-trip
// Feature: sprint-22-tenant-index-routing, Property 4
// Validates: Requirements 2.3, 2.4, 2.5
// ──────────────────────────────────────────────────────────────────────────────

// TestProperty4_EventTenantPrefixZeroValueAndRoundTrip asserts:
//
//  1. (&Event{}).TenantPrefix == ""   — zero-value contract.
//  2. (*Event)(nil).GetTenantPrefix() == ""  — nil-receiver safety.
//  3. For any arbitrary TenantPrefix string, proto.Marshal → proto.Unmarshal
//     into a fresh Event preserves the field byte-for-byte.
func TestProperty4_EventTenantPrefixZeroValueAndRoundTrip(t *testing.T) {
	// Feature: sprint-22-tenant-index-routing, Property 4

	// Static zero-value assertions (not random; run once).
	if got := (&Event{}).TenantPrefix; got != "" {
		t.Fatalf("zero-value Event.TenantPrefix = %q, want \"\"", got)
	}
	var nilEvent *Event
	if got := nilEvent.GetTenantPrefix(); got != "" {
		t.Fatalf("nil Event.GetTenantPrefix() = %q, want \"\"", got)
	}

	rng := rand.New(rand.NewSource(42))

	for i := 0; i < propIterations; i++ {
		prefix := randString(rng, 64)

		// Ensure the string is valid UTF-8 — proto requires valid UTF-8.
		if !utf8.ValidString(prefix) {
			// Replace with a simple ASCII fallback for this iteration.
			prefix = fmt.Sprintf("prefix-%d", i)
		}

		src := &Event{TenantPrefix: prefix}

		wire, err := proto.Marshal(src)
		if err != nil {
			t.Fatalf("iteration %d: proto.Marshal failed: %v", i, err)
		}

		dst := &Event{}
		if err := proto.Unmarshal(wire, dst); err != nil {
			t.Fatalf("iteration %d: proto.Unmarshal failed: %v", i, err)
		}

		if dst.TenantPrefix != prefix {
			t.Fatalf("iteration %d: round-trip mismatch: got %q, want %q",
				i, dst.TenantPrefix, prefix)
		}

		// Also verify GetTenantPrefix returns the same value.
		if dst.GetTenantPrefix() != prefix {
			t.Fatalf("iteration %d: GetTenantPrefix() = %q, want %q",
				i, dst.GetTenantPrefix(), prefix)
		}

		// Extra: marshal a second time and confirm the bytes are identical
		// (determinism within the same process and proto version).
		wire2, err := proto.Marshal(dst)
		if err != nil {
			t.Fatalf("iteration %d: second proto.Marshal failed: %v", i, err)
		}
		if !bytes.Equal(wire, wire2) {
			t.Fatalf("iteration %d: proto serialisation is non-deterministic for %q", i, prefix)
		}
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Property 5 — AgentPrefixCache TTL boundary
// Feature: sprint-22-tenant-index-routing, Property 5
// Validates: Requirements 3.5, 3.6
// ──────────────────────────────────────────────────────────────────────────────

// TestProperty5_AgentPrefixCacheTTLBoundary asserts that for any (agentID,
// prefix) pair and any observation offset d in nanoseconds [0, TTL*2):
//
//   - Get returns (prefix, true)  iff d <  agentPrefixCacheTTL
//   - Get returns ("",   false)   iff d >= agentPrefixCacheTTL
//
// The test injects a fake clock via agentPrefixCacheT.nowFunc so that no real
// time passes and the test runs quickly and deterministically.
func TestProperty5_AgentPrefixCacheTTLBoundary(t *testing.T) {
	// Feature: sprint-22-tenant-index-routing, Property 5

	rng := rand.New(rand.NewSource(43))

	// Maximum observation offset: TTL * 2.
	maxOffset := int64(agentPrefixCacheTTL * 2)

	for i := 0; i < propIterations; i++ {
		resetAgentPrefixCacheForTest()

		agentID := fmt.Sprintf("agent-ttl-%d", i)
		prefix := randString(rng, 32)

		// t0 is the wall-clock instant at which Set is called.
		t0 := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)

		// Record t0 in the fake clock so that Set uses time.Now() = t0.
		// We temporarily override Set's time source by injecting nowFunc
		// before calling Set, then restoring it.
		//
		// NOTE: Set uses time.Now() directly (it does not consult nowFunc).
		// We therefore compute expiresAt manually and inject the entry so
		// that expiresAt = t0 + TTL is exact.  This avoids adding a second
		// clock hook to Set (which would change production code more than
		// the spec requires).
		agentPrefixCache.mu.Lock()
		agentPrefixCache.entries[agentID] = agentPrefixEntry{
			prefix:    prefix,
			expiresAt: t0.Add(agentPrefixCacheTTL),
		}
		agentPrefixCache.mu.Unlock()

		// Pick an arbitrary observation offset d in [0, TTL*2).
		d := time.Duration(rng.Int63n(maxOffset))

		// Inject the fake clock: observation time = t0 + d.
		observationTime := t0.Add(d)
		agentPrefixCache.mu.Lock()
		agentPrefixCache.nowFunc = func() time.Time { return observationTime }
		agentPrefixCache.mu.Unlock()

		gotPrefix, gotOK := agentPrefixCache.Get(agentID)

		// Determine expected result based on TTL boundary.
		wantOK := d < agentPrefixCacheTTL

		if wantOK {
			if !gotOK {
				t.Fatalf("iteration %d: d=%v (< TTL=%v): Get returned false, expected true",
					i, d, agentPrefixCacheTTL)
			}
			if gotPrefix != prefix {
				t.Fatalf("iteration %d: d=%v: Get returned prefix=%q, want %q",
					i, d, gotPrefix, prefix)
			}
		} else {
			// d >= TTL: entry should be expired.
			if gotOK {
				t.Fatalf("iteration %d: d=%v (>= TTL=%v): Get returned true, expected false",
					i, d, agentPrefixCacheTTL)
			}
			if gotPrefix != "" {
				t.Fatalf("iteration %d: d=%v: Get returned prefix=%q on expired entry, want \"\"",
					i, d, gotPrefix)
			}
		}
	}

	// Clean up the fake clock.
	agentPrefixCache.mu.Lock()
	agentPrefixCache.nowFunc = nil
	agentPrefixCache.mu.Unlock()
	resetAgentPrefixCacheForTest()
}

// ──────────────────────────────────────────────────────────────────────────────
// Property 6 — AgentPrefixCache concurrent safety and read-only lookup
// Feature: sprint-22-tenant-index-routing, Property 6
// Validates: Requirements 3.5, 3.7, 4.10
// ──────────────────────────────────────────────────────────────────────────────

// TestProperty6_AgentPrefixCacheConcurrentSafetyAndReadOnlyLookup spawns 100
// goroutines for each iteration; each goroutine calls Set then Get on a
// distinct agentID.  A spy AgentPrefixLookupFn is registered; because every
// Get is preceded by a Set, the lookup fn must never be invoked.
//
// Running with go test -race verifies zero data races.
func TestProperty6_AgentPrefixCacheConcurrentSafetyAndReadOnlyLookup(t *testing.T) {
	// Feature: sprint-22-tenant-index-routing, Property 6

	const numGoroutines = 100

	for iter := 0; iter < propIterations; iter++ {
		resetAgentPrefixCacheForTest()

		// Spy: counts how many times the lookup fn is called.
		var lookupCallCount int64
		RegisterAgentPrefixLookup(func(_ context.Context, id string) (string, error) {
			atomic.AddInt64(&lookupCallCount, 1)
			return "spy-prefix", nil
		})

		var wg sync.WaitGroup
		wg.Add(numGoroutines)

		for g := 0; g < numGoroutines; g++ {
			g := g
			go func() {
				defer wg.Done()
				agentID := fmt.Sprintf("agent-p6-iter%d-g%d", iter, g)
				prefix := fmt.Sprintf("pfx-%d-%d", iter, g)

				// Set before Get — Get must not invoke the lookup fn.
				agentPrefixCache.Set(agentID, prefix)

				gotPrefix, gotOK := agentPrefixCache.Get(agentID)
				if !gotOK {
					t.Errorf("iter %d goroutine %d: Get returned false after Set", iter, g)
					return
				}
				if gotPrefix != prefix {
					t.Errorf("iter %d goroutine %d: Get returned %q, want %q",
						iter, g, gotPrefix, prefix)
				}
			}()
		}

		wg.Wait()

		// Assert the spy lookup fn was never called across all goroutines.
		if n := atomic.LoadInt64(&lookupCallCount); n != 0 {
			t.Fatalf("iter %d: spy lookup fn was called %d times; expected 0 (Get must not invoke lookup)",
				iter, n)
		}
	}

	resetAgentPrefixCacheForTest()
}

// ──────────────────────────────────────────────────────────────────────────────
// Property 7 — ResolveAndSetTenantPrefix empty TenantId short-circuit
// Feature: sprint-22-tenant-index-routing, Property 7
// Validates: Requirements 4.3
// ──────────────────────────────────────────────────────────────────────────────

// TestProperty7_ResolveAndSetTenantPrefixEmptyTenantIdShortCircuit asserts that
// for any *Event whose TenantId == "" (with arbitrary values in all other
// fields), ResolveAndSetTenantPrefix:
//   - returns nil
//   - sets e.TenantPrefix = ""
//   - never invokes the registered AgentPrefixLookupFn spy
//   - never invokes agentPrefixCache.Get (verified via spy lookup fn)
func TestProperty7_ResolveAndSetTenantPrefixEmptyTenantIdShortCircuit(t *testing.T) {
	// Feature: sprint-22-tenant-index-routing, Property 7

	rng := rand.New(rand.NewSource(47))
	ctx := context.Background()

	for i := 0; i < propIterations; i++ {
		resetAgentPrefixCacheForTest()

		// Spy lookup fn — must remain uncalled.
		var lookupCallCount int64
		RegisterAgentPrefixLookup(func(_ context.Context, _ string) (string, error) {
			atomic.AddInt64(&lookupCallCount, 1)
			return "should-not-be-returned", nil
		})

		// Build an Event with TenantId == "" and arbitrary other field values.
		e := &Event{
			Id:           fmt.Sprintf("evt-p7-%d", i),
			TenantId:     "", // must be empty — this is the property premise
			TenantName:   randString(rng, 32),
			DataType:     randString(rng, 16),
			DataSource:   randString(rng, 16),
			TenantPrefix: randString(rng, 16), // pre-populate — must be cleared
		}

		err := ResolveAndSetTenantPrefix(ctx, e)
		if err != nil {
			t.Fatalf("iteration %d: ResolveAndSetTenantPrefix returned non-nil error: %v", i, err)
		}
		if e.TenantPrefix != "" {
			t.Fatalf("iteration %d: TenantPrefix = %q after empty-TenantId call, want \"\"",
				i, e.TenantPrefix)
		}
		if n := atomic.LoadInt64(&lookupCallCount); n != 0 {
			t.Fatalf("iteration %d: lookup spy called %d times on empty TenantId; expected 0", i, n)
		}
	}

	resetAgentPrefixCacheForTest()
}

// ──────────────────────────────────────────────────────────────────────────────
// Property 8 — ResolveAndSetTenantPrefix idempotence and negative caching
// Feature: sprint-22-tenant-index-routing, Property 8
// Validates: Requirements 4.4, 4.5, 4.7
// ──────────────────────────────────────────────────────────────────────────────

// lookupBehaviour describes the three possible outcomes of the registered
// AgentPrefixLookupFn for Property 8.
type lookupBehaviour int

const (
	returnsNonEmptyPrefix lookupBehaviour = iota
	returnsEmptyPrefix                    // negative-cache path
	// returnsError is intentionally excluded from the idempotence check per
	// the task description: "the error branch is asserted separately —
	// idempotence covers the two nil-error branches".
)

// TestProperty8_ResolveAndSetTenantPrefixIdempotenceAndNegativeCaching asserts:
//
//  1. Calling ResolveAndSetTenantPrefix twice on the same event with the same
//     registered lookup fn produces the same e.TenantPrefix both times.
//  2. The lookup fn is invoked exactly once across both calls (second call
//     hits the cache).
//
// Both nil-error lookup behaviours are covered: non-empty prefix and empty
// prefix (negative caching).
func TestProperty8_ResolveAndSetTenantPrefixIdempotenceAndNegativeCaching(t *testing.T) {
	// Feature: sprint-22-tenant-index-routing, Property 8

	rng := rand.New(rand.NewSource(48))
	ctx := context.Background()

	for i := 0; i < propIterations; i++ {
		// Alternate between the two nil-error behaviours across iterations.
		behaviour := lookupBehaviour(i % 2)

		resetAgentPrefixCacheForTest()

		tenantID := fmt.Sprintf("tenant-p8-%d", i)

		// Determine the prefix the lookup fn will return.
		var lookupResult string
		switch behaviour {
		case returnsNonEmptyPrefix:
			lookupResult = "pfx-" + randString(rng, 16)
			// Ensure not empty.
			if strings.TrimSpace(lookupResult) == "pfx-" {
				lookupResult = "pfx-fallback"
			}
		case returnsEmptyPrefix:
			lookupResult = ""
		}

		var lookupCallCount int64
		RegisterAgentPrefixLookup(func(_ context.Context, _ string) (string, error) {
			atomic.AddInt64(&lookupCallCount, 1)
			return lookupResult, nil
		})

		e := &Event{
			Id:       fmt.Sprintf("evt-p8-%d", i),
			TenantId: tenantID,
		}

		// First call — cache miss, lookup fn invoked once.
		if err := ResolveAndSetTenantPrefix(ctx, e); err != nil {
			t.Fatalf("iteration %d behaviour %d: first call returned error: %v", i, behaviour, err)
		}
		firstPrefix := e.TenantPrefix

		// Second call — cache hit, lookup fn must NOT be invoked again.
		if err := ResolveAndSetTenantPrefix(ctx, e); err != nil {
			t.Fatalf("iteration %d behaviour %d: second call returned error: %v", i, behaviour, err)
		}
		secondPrefix := e.TenantPrefix

		// Idempotence: both calls must produce the same TenantPrefix.
		if firstPrefix != secondPrefix {
			t.Fatalf("iteration %d behaviour %d: TenantPrefix changed between calls: %q → %q",
				i, behaviour, firstPrefix, secondPrefix)
		}

		// The prefix must equal what the lookup fn returned.
		if firstPrefix != lookupResult {
			t.Fatalf("iteration %d behaviour %d: TenantPrefix = %q, want %q",
				i, behaviour, firstPrefix, lookupResult)
		}

		// Lookup fn must have been called exactly once across both calls.
		if n := atomic.LoadInt64(&lookupCallCount); n != 1 {
			t.Fatalf("iteration %d behaviour %d: lookup fn called %d times, want exactly 1",
				i, behaviour, n)
		}
	}

	resetAgentPrefixCacheForTest()
}
