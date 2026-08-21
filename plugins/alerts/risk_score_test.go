package main

// Validates: Requirements 2.3, 2.4, 2.5, 2.6, 2.7
//
// Property 1: calculateRiskScore is total, deterministic, and always returns a
// value in [0, 100].
//
// The four sub-properties tested here mirror the postconditions defined in the
// Sprint 13 design document § Pure-function contracts:
//   2.3 — result always in [0, 100]
//   2.4 — result == sum*25 when sum ∈ [0, 4]
//   2.5 — result == 100 when sum > 4
//   2.6 — result == 0   when sum < 0
//   2.7 — anchor: (0,0,0,0)==0 and (4,4,4,4)==100

import (
	"math/rand"
	"testing"
	"testing/quick"
)

// domainVal is a helper that returns a value in [-20, 20] from a random source.
func domainVal(r *rand.Rand) int {
	return r.Intn(41) - 20 // [0,40] → [-20, 20]
}

// TestCalculateRiskScore_Property_Bounds verifies that for ALL four-int inputs
// uniformly sampled from [-20, 20] the return value satisfies 0 ≤ result ≤ 100.
// (Requirement 2.3)
func TestCalculateRiskScore_Property_Bounds(t *testing.T) {
	f := func(sw, fw, ac, ti int8) bool {
		// int8 gives us [-128, 127] — more than enough range; we use it
		// as the source type so testing/quick generates it without a
		// custom generator, then cast to int.
		result := calculateRiskScore(int(sw), int(fw), int(ac), int(ti))
		return result >= 0 && result <= 100
	}

	cfg := &quick.Config{MaxCount: 100_000}
	if err := quick.Check(f, cfg); err != nil {
		t.Errorf("Property 2.3 violated (result not in [0,100]): %v", err)
	}
}

// TestCalculateRiskScore_Property_LinearRegion verifies that when
// sum = sw+fw+ac+ti is in [0, 4] the result equals sum*25.
// (Requirement 2.4)
func TestCalculateRiskScore_Property_LinearRegion(t *testing.T) {
	// Exhaustively cover all (sw, fw, ac, ti) combinations in [-20, 20]
	// whose sum lands in [0, 4].  We iterate a focused subset rather than
	// 41^4 ≈ 2.8M combinations to keep the test fast while still hitting
	// every linear-region branch.
	for sum := 0; sum <= 4; sum++ {
		// Pick representative distributions of the sum across four args.
		for sw := max(-20, sum-60); sw <= min(20, sum+20); sw++ {
			for fw := max(-20, sum-sw-40); fw <= min(20, sum-sw+20); fw++ {
				for ac := max(-20, sum-sw-fw-20); ac <= min(20, sum-sw-fw+20); ac++ {
					ti := sum - sw - fw - ac
					if ti < -20 || ti > 20 {
						continue
					}
					result := calculateRiskScore(sw, fw, ac, ti)
					want := sum * 25
					if result != want {
						t.Errorf("Property 2.4 violated: calculateRiskScore(%d,%d,%d,%d) = %d, want %d (sum=%d)",
							sw, fw, ac, ti, result, want, sum)
					}
				}
			}
		}
	}
}

// TestCalculateRiskScore_Property_UpperClamp verifies that when sum > 4
// the result is exactly 100. (Requirement 2.5)
func TestCalculateRiskScore_Property_UpperClamp(t *testing.T) {
	f := func(sw, fw, ac, ti int8) bool {
		s := int(sw) + int(fw) + int(ac) + int(ti)
		if s <= 4 {
			return true // skip — not in the domain we are testing here
		}
		return calculateRiskScore(int(sw), int(fw), int(ac), int(ti)) == 100
	}

	cfg := &quick.Config{MaxCount: 100_000}
	if err := quick.Check(f, cfg); err != nil {
		t.Errorf("Property 2.5 violated (sum>4 should give 100): %v", err)
	}
}

// TestCalculateRiskScore_Property_LowerClamp verifies that when sum < 0
// the result is exactly 0. (Requirement 2.6)
func TestCalculateRiskScore_Property_LowerClamp(t *testing.T) {
	f := func(sw, fw, ac, ti int8) bool {
		s := int(sw) + int(fw) + int(ac) + int(ti)
		if s >= 0 {
			return true // skip — not in the domain we are testing here
		}
		return calculateRiskScore(int(sw), int(fw), int(ac), int(ti)) == 0
	}

	cfg := &quick.Config{MaxCount: 100_000}
	if err := quick.Check(f, cfg); err != nil {
		t.Errorf("Property 2.6 violated (sum<0 should give 0): %v", err)
	}
}

// TestCalculateRiskScore_Property_Anchors verifies the two fixed points.
// (Requirement 2.7)
func TestCalculateRiskScore_Property_Anchors(t *testing.T) {
	if got := calculateRiskScore(0, 0, 0, 0); got != 0 {
		t.Errorf("Anchor (0,0,0,0): got %d, want 0", got)
	}
	if got := calculateRiskScore(4, 4, 4, 4); got != 100 {
		t.Errorf("Anchor (4,4,4,4): got %d, want 100", got)
	}
}

// TestCalculateRiskScore_Property_Deterministic verifies that repeated calls
// with identical arguments produce the same result. (Requirement 2.3 — totality)
func TestCalculateRiskScore_Property_Deterministic(t *testing.T) {
	f := func(sw, fw, ac, ti int8) bool {
		a := calculateRiskScore(int(sw), int(fw), int(ac), int(ti))
		b := calculateRiskScore(int(sw), int(fw), int(ac), int(ti))
		return a == b
	}

	cfg := &quick.Config{MaxCount: 50_000}
	if err := quick.Check(f, cfg); err != nil {
		t.Errorf("Property determinism violated: %v", err)
	}
}

// TestCalculateRiskScore_Property_DomainSampled exercises the explicitly
// requested [-20, 20] domain using a hand-rolled generator to complement the
// int8-based quick.Check tests above.
func TestCalculateRiskScore_Property_DomainSampled(t *testing.T) {
	r := rand.New(rand.NewSource(42)) //nolint:gosec // deterministic seed for reproducibility
	const iterations = 200_000
	for i := 0; i < iterations; i++ {
		sw := domainVal(r)
		fw := domainVal(r)
		ac := domainVal(r)
		ti := domainVal(r)

		result := calculateRiskScore(sw, fw, ac, ti)

		// 2.3 — bounds
		if result < 0 || result > 100 {
			t.Errorf("iteration %d: calculateRiskScore(%d,%d,%d,%d) = %d, out of [0,100]",
				i, sw, fw, ac, ti, result)
			return
		}

		sum := sw + fw + ac + ti
		switch {
		case sum < 0:
			// 2.6 — lower clamp
			if result != 0 {
				t.Errorf("iteration %d: sum=%d<0 but result=%d, want 0", i, sum, result)
				return
			}
		case sum > 4:
			// 2.5 — upper clamp
			if result != 100 {
				t.Errorf("iteration %d: sum=%d>4 but result=%d, want 100", i, sum, result)
				return
			}
		default:
			// 2.4 — linear region [0, 4]
			if want := sum * 25; result != want {
				t.Errorf("iteration %d: sum=%d in [0,4] but result=%d, want %d",
					i, sum, result, want)
				return
			}
		}
	}
}

// max/min helpers (Go 1.21+ provides these as builtins, but keeping explicit
// versions keeps this file self-contained for older toolchains).
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ---------------------------------------------------------------------------
// Property 2: severityToWeight always returns an integer in {1, 2, 3, 4}
// and is identity on {2, 3, 4}.
//
// Validates: Requirements 2.8, 2.9
// ---------------------------------------------------------------------------

// TestSeverityToWeight_Property_ReturnRange verifies that for ALL int inputs
// the return value always lies in {1, 2, 3, 4}.
// (Requirement 2.9)
func TestSeverityToWeight_Property_ReturnRange(t *testing.T) {
	f := func(severity int16) bool {
		result := severityToWeight(int(severity))
		return result == 1 || result == 2 || result == 3 || result == 4
	}

	cfg := &quick.Config{MaxCount: 100_000}
	if err := quick.Check(f, cfg); err != nil {
		t.Errorf("Property 2.9 violated (result not in {1,2,3,4}): %v", err)
	}
}

// TestSeverityToWeight_Property_IdentityOnTwoThreeFour verifies that for
// severity ∈ {2, 3, 4} the function returns the input unchanged.
// (Requirement 2.8)
func TestSeverityToWeight_Property_IdentityOnTwoThreeFour(t *testing.T) {
	for _, severity := range []int{2, 3, 4} {
		if got := severityToWeight(severity); got != severity {
			t.Errorf("Property 2.8 violated: severityToWeight(%d) = %d, want %d",
				severity, got, severity)
		}
	}
}

// TestSeverityToWeight_Property_DefaultToOne verifies that for all severity
// values outside {2, 3, 4} the return value is exactly 1.
// (Requirement 2.9)
func TestSeverityToWeight_Property_DefaultToOne(t *testing.T) {
	f := func(severity int16) bool {
		s := int(severity)
		if s == 2 || s == 3 || s == 4 {
			return true // skip the identity domain; covered by the test above
		}
		return severityToWeight(s) == 1
	}

	cfg := &quick.Config{MaxCount: 100_000}
	if err := quick.Check(f, cfg); err != nil {
		t.Errorf("Property 2.9 violated (non-{2,3,4} input should return 1): %v", err)
	}
}
