package main

// calculateRiskScore computes a composite risk score clamped to [0, 100].
// Four equally-weighted inputs, each ideally in [0, 4], are summed and multiplied by 25.
// The result is clamped to the closed range [0, 100].
//
// Sprint 13 T02: frequencyWeight is always 0; assetCriticality and threatIntelMatch are
// wired in T04 and T03 respectively.
func calculateRiskScore(severityWeight, frequencyWeight, assetCriticality, threatIntelMatch int) int {
	total := (severityWeight + frequencyWeight + assetCriticality + threatIntelMatch) * 25
	if total > 100 {
		total = 100
	}
	if total < 0 {
		total = 0
	}
	return total
}

// severityToWeight maps an alert severity integer to the [1, 4] weight scale.
// Severity values 2, 3, and 4 are returned unchanged; all other values return 1.
func severityToWeight(severity int) int {
	switch severity {
	case 4:
		return 4
	case 3:
		return 3
	case 2:
		return 2
	default:
		return 1
	}
}
