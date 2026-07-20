package neo4j

import (
	"context"
	"time"

	"github.com/hivearmor/entity-graph/extractor"
)

// UpdateRiskScores bumps the riskScore on every entity involved in an alert.
// Formula: riskScore = min(100, current + severity*10).
// Three separate queries (one per label) avoid the UNWIND cross-product that
// would otherwise apply the delta N×M×P times to the same node.
func (c *Client) UpdateRiskScores(ctx context.Context, alert extractor.AlertEntity) error {
	now := time.Now().UTC()
	delta := float64(alert.Severity) * 10.0

	riskCypher := func(matchClause string) string {
		return matchClause + `
		SET n.riskScore = CASE
			WHEN n.riskScore IS NULL    THEN $delta
			WHEN n.riskScore + $delta > 100 THEN 100.0
			ELSE n.riskScore + $delta
		END,
		n.lastAlertTime = $now`
	}
	params := func(values []string) map[string]any {
		return map[string]any{"values": toAnySlice(values), "delta": delta, "now": now}
	}

	if len(alert.InvolvedIPs) > 0 {
		if err := c.run(ctx, riskCypher(`
			UNWIND $values AS v
			MATCH (n:IpAddress {address: v})
		`), params(alert.InvolvedIPs)); err != nil {
			return err
		}
	}
	if len(alert.InvolvedHosts) > 0 {
		if err := c.run(ctx, riskCypher(`
			UNWIND $values AS v
			MATCH (n:Host {hostname: v})
		`), params(alert.InvolvedHosts)); err != nil {
			return err
		}
	}
	if len(alert.InvolvedUsers) > 0 {
		if err := c.run(ctx, riskCypher(`
			UNWIND $values AS v
			MATCH (n:User {username: v})
		`), params(alert.InvolvedUsers)); err != nil {
			return err
		}
	}
	return nil
}

func toAnySlice(ss []string) []any {
	out := make([]any, len(ss))
	for i, s := range ss {
		out[i] = s
	}
	return out
}
