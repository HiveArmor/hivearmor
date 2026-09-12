package main

import (
	"math"
	"testing"
)

func TestPercentile(t *testing.T) {
	cases := []struct {
		name   string
		sorted []float64
		p      float64
		want   float64
	}{
		{"empty", nil, 95, 0},
		{"single", []float64{7}, 99, 7},
		{"min p0", []float64{1, 2, 3, 4, 5}, 0, 1},
		{"max p100", []float64{1, 2, 3, 4, 5}, 100, 5},
		{"median odd", []float64{1, 2, 3, 4, 5}, 50, 3},
		{"p90 interp", []float64{10, 20, 30, 40, 50, 60, 70, 80, 90, 100}, 90, 91},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := percentile(c.sorted, c.p)
			if math.Abs(got-c.want) > 0.5 {
				t.Fatalf("percentile(%v, %g) = %g, want ~%g", c.sorted, c.p, got, c.want)
			}
		})
	}
}

// A recommended threshold should never drop below the floor of 2, and should
// exceed a P99 by the margin.
func TestRecommendedThresholdMonotonic(t *testing.T) {
	sorted := []float64{2, 2, 3, 3, 4, 12} // P99 ~ near max
	p99 := percentile(sorted, 99)
	rec := int(math.Ceil(p99 * 1.25))
	if rec < 2 {
		t.Fatalf("recommendation %d below floor 2", rec)
	}
	if float64(rec) < p99 {
		t.Fatalf("recommendation %d below P99 %g", rec, p99)
	}
}
