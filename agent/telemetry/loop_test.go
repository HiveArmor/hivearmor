package telemetry

import (
	"testing"
	"time"
)

func TestSetScanIntervals_Clamps(t *testing.T) {
	SetScanIntervals(30*time.Minute, 200*time.Hour)
	if got := EffectiveSCAInterval(); got != minScanInterval {
		t.Fatalf("sca clamp min: got %v want %v", got, minScanInterval)
	}
	if got := EffectiveSBOMInterval(); got != maxScanInterval {
		t.Fatalf("sbom clamp max: got %v want %v", got, maxScanInterval)
	}

	SetScanIntervals(0, -time.Hour)
	if got := EffectiveSCAInterval(); got != defaultScanInterval {
		t.Fatalf("sca default: %v", got)
	}
	if got := EffectiveSBOMInterval(); got != defaultScanInterval {
		t.Fatalf("sbom default: %v", got)
	}

	SetScanIntervals(3*time.Hour, 12*time.Hour)
	if EffectiveSCAInterval() != 3*time.Hour || EffectiveSBOMInterval() != 12*time.Hour {
		t.Fatalf("unexpected intervals sca=%v sbom=%v", EffectiveSCAInterval(), EffectiveSBOMInterval())
	}

	// Restore defaults for other tests in the package.
	SetScanIntervals(defaultScanInterval, defaultScanInterval)
}

func TestTimeUntilEarliest(t *testing.T) {
	now := time.Now()
	a := now.Add(2 * time.Hour)
	b := now.Add(30 * time.Minute)
	d := timeUntilEarliest(a, b)
	if d < 29*time.Minute || d > 31*time.Minute {
		t.Fatalf("expected ~30m, got %v", d)
	}
}
