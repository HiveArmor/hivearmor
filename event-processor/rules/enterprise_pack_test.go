package rules

import (
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEnterprisePackLoadsSequenceRiskGraph(t *testing.T) {
	_, file, _, ok := runtime.Caller(0)
	require.True(t, ok)
	dir := filepath.Join(filepath.Dir(file), "..", "builtin-rules", "enterprise-pack")

	report := LoadFromDir(dir)
	require.Empty(t, report.Invalid, "enterprise pack must compile: %v", report.Invalid)
	assert.Equal(t, 18, report.Loaded)
	assert.Equal(t, 0, report.Skipped)

	var sequence, risk int
	seen := map[int64]bool{}
	for _, r := range AllRules() {
		seen[r.ID] = true
		require.NotNil(t, r.MITRE, "rule %d %s missing mitre tags", r.ID, r.Name)
		assert.NotEmpty(t, r.MITRE.Tactics, "rule %d missing mitre.tactics", r.ID)
		assert.NotEmpty(t, r.MITRE.Attacks, "rule %d missing mitre.attacks", r.ID)
		for _, req := range r.AfterEvents {
			assert.Equal(t, "v3-hive-log-*", req.IndexPattern, "rule %d afterEvents must use v3-hive-log-*", r.ID)
			assert.NotContains(t, req.IndexPattern, "v11-log")
		}
		if r.HasSequence() {
			sequence++
			require.GreaterOrEqual(t, len(r.Sequence), 2)
			assert.NotEmpty(t, r.Sequence[0].Where)
			assert.NotEmpty(t, r.Sequence[0].Within)
			assert.NotEmpty(t, r.AfterEvents, "sequence rule %d should document afterEvents lookback", r.ID)
		}
		if r.HasRiskScore() {
			risk++
			assert.Greater(t, r.RiskScore, 0)
			assert.NotEmpty(t, r.Where)
			assert.False(t, r.HasSequence())
		}
	}
	graph := GraphOffenseRules()
	assert.Equal(t, 7, sequence)
	assert.Equal(t, 6, risk)
	require.Len(t, graph, 5)
	graphIDs := map[int64]bool{}
	for _, g := range graph {
		assert.True(t, g.IsGraphOffense())
		assert.NotEmpty(t, g.CypherQuery)
		require.NotNil(t, g.MITRE, "graph rule %d missing mitre tags", g.ID)
		assert.NotEmpty(t, g.MITRE.Attacks)
		assert.True(t, strings.Contains(g.Description, "Neo4j") || strings.Contains(g.Description, "NEO4J"),
			"graph rule %d must document Neo4j requirement", g.ID)
		graphIDs[g.ID] = true
	}
	assert.True(t, graphIDs[9105])
	assert.True(t, graphIDs[9115])
	assert.True(t, graphIDs[9116])
	assert.True(t, graphIDs[9117])
	assert.True(t, graphIDs[9118])
	assert.True(t, seen[9101])
	assert.True(t, seen[9114])
}
