// Package os_test contains property-based tests for the HiveArmor SDK index builders.
// Feature: sprint-22-tenant-index-routing
package os_test

import (
	"fmt"
	"math/rand"
	"testing"
	"time"

	sdkos "github.com/hivearmor/sdk/os"
)

// propertyIterations is the minimum number of random iterations for every property test.
const propertyIterations = 100

// lowerAlpha is the alphabet for generating [a-z]+ type strings.
const lowerAlpha = "abcdefghijklmnopqrstuvwxyz"

// lowerAlphaNum is the alphabet for generating [a-z0-9] characters.
const lowerAlphaNum = "abcdefghijklmnopqrstuvwxyz0123456789"

// lowerAlphaNumHyphen is the alphabet for [a-z0-9-] interior characters in tenant prefixes.
const lowerAlphaNumHyphen = "abcdefghijklmnopqrstuvwxyz0123456789-"

// randTypeString generates a random string matching [a-z]+ with length in [1..16].
func randTypeString(rng *rand.Rand) string {
	n := 1 + rng.Intn(16) // length 1..16
	b := make([]byte, n)
	for i := range b {
		b[i] = lowerAlpha[rng.Intn(len(lowerAlpha))]
	}
	return string(b)
}

// randTenantPrefix generates a random string matching ^[a-z0-9][a-z0-9-]{1,19}$
// (total length 2..20, first char [a-z0-9], remaining chars [a-z0-9-]).
func randTenantPrefix(rng *rand.Rand) string {
	// tail length is 1..19, so total length is 2..20
	tailLen := 1 + rng.Intn(19)
	b := make([]byte, 1+tailLen)
	b[0] = lowerAlphaNum[rng.Intn(len(lowerAlphaNum))]
	for i := 1; i < len(b); i++ {
		b[i] = lowerAlphaNumHyphen[rng.Intn(len(lowerAlphaNumHyphen))]
	}
	return string(b)
}

// TestProperty1_DailyIndexFormatDeterminism verifies that for any [a-z]+ data type:
//   - BuildCurrentDayIndex(typ) == "v3-hive-" + typ + "-" + <today UTC>
//   - BuildIndexPattern(typ)    == "v3-hive-" + typ + "-*"
//
// Validates: Requirements 1.4, 1.5, 1.8
// Feature: sprint-22-tenant-index-routing, Property 1
func TestProperty1_DailyIndexFormatDeterminism(t *testing.T) {
	// Compute today once so the date is stable across all iterations in this run.
	today := time.Now().UTC().Format("2006.01.02")
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))

	for i := 0; i < propertyIterations; i++ {
		typ := randTypeString(rng)

		wantIndex := fmt.Sprintf("v3-hive-%s-%s", typ, today)
		gotIndex := sdkos.BuildCurrentDayIndex(typ)
		if gotIndex != wantIndex {
			t.Fatalf(
				"Property 1 iteration %d: BuildCurrentDayIndex(%q) = %q, want %q",
				i, typ, gotIndex, wantIndex,
			)
		}

		wantPattern := fmt.Sprintf("v3-hive-%s-*", typ)
		gotPattern := sdkos.BuildIndexPattern(typ)
		if gotPattern != wantPattern {
			t.Fatalf(
				"Property 1 iteration %d: BuildIndexPattern(%q) = %q, want %q",
				i, typ, gotPattern, wantPattern,
			)
		}
	}
}

// TestProperty2_TenantFallbackIdentity verifies that for any [a-z]+ data type,
// passing an empty tenant prefix is byte-for-byte identical to the non-tenant functions:
//   - BuildTenantIndex(typ, "")        == BuildCurrentDayIndex(typ)
//   - BuildTenantIndexPattern(typ, "") == BuildIndexPattern(typ)
//
// Validates: Requirements 1.7, 1.10
// Feature: sprint-22-tenant-index-routing, Property 2
func TestProperty2_TenantFallbackIdentity(t *testing.T) {
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))

	for i := 0; i < propertyIterations; i++ {
		typ := randTypeString(rng)

		wantIndex := sdkos.BuildCurrentDayIndex(typ)
		gotIndex := sdkos.BuildTenantIndex(typ, "")
		if gotIndex != wantIndex {
			t.Fatalf(
				"Property 2 iteration %d: BuildTenantIndex(%q, \"\") = %q, want %q (BuildCurrentDayIndex(%q))",
				i, typ, gotIndex, wantIndex, typ,
			)
		}

		wantPattern := sdkos.BuildIndexPattern(typ)
		gotPattern := sdkos.BuildTenantIndexPattern(typ, "")
		if gotPattern != wantPattern {
			t.Fatalf(
				"Property 2 iteration %d: BuildTenantIndexPattern(%q, \"\") = %q, want %q (BuildIndexPattern(%q))",
				i, typ, gotPattern, wantPattern, typ,
			)
		}
	}
}

// TestProperty3_TenantScopedFormat verifies that for any ([a-z]+ type, valid prefix) pair:
//   - BuildTenantIndex(typ, pfx)        == "v3-hive-" + typ + "-" + pfx + "-" + <today UTC>
//   - BuildTenantIndexPattern(typ, pfx) == "v3-hive-" + typ + "-" + pfx + "-*"
//
// Prefix matches ^[a-z0-9][a-z0-9-]{1,19}$ so it passes sanitization unchanged.
//
// Validates: Requirements 1.6, 1.9
// Feature: sprint-22-tenant-index-routing, Property 3
func TestProperty3_TenantScopedFormat(t *testing.T) {
	today := time.Now().UTC().Format("2006.01.02")
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))

	for i := 0; i < propertyIterations; i++ {
		typ := randTypeString(rng)
		pfx := randTenantPrefix(rng)

		wantIndex := fmt.Sprintf("v3-hive-%s-%s-%s", typ, pfx, today)
		gotIndex := sdkos.BuildTenantIndex(typ, pfx)
		if gotIndex != wantIndex {
			t.Fatalf(
				"Property 3 iteration %d: BuildTenantIndex(%q, %q) = %q, want %q",
				i, typ, pfx, gotIndex, wantIndex,
			)
		}

		wantPattern := fmt.Sprintf("v3-hive-%s-%s-*", typ, pfx)
		gotPattern := sdkos.BuildTenantIndexPattern(typ, pfx)
		if gotPattern != wantPattern {
			t.Fatalf(
				"Property 3 iteration %d: BuildTenantIndexPattern(%q, %q) = %q, want %q",
				i, typ, pfx, gotPattern, wantPattern,
			)
		}
	}
}
