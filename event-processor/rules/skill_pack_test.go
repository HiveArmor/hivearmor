package rules

import (
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func skillPackDir(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	require.True(t, ok)
	return filepath.Join(filepath.Dir(file), "..", "builtin-rules", "skill-content-pack")
}

func TestSkillContentPackLoadsCelSequenceRiskGraph(t *testing.T) {
	snapshotRules(t)
	dir := skillPackDir(t)

	report := LoadFromDir(dir)
	require.Empty(t, report.Invalid, "skill content pack must compile: %v", report.Invalid)
	assert.Equal(t, 16, report.Loaded)
	assert.Equal(t, 0, report.Skipped)

	var sequence, risk, cel int
	seen := map[int64]bool{}
	for _, r := range AllRules() {
		seen[r.ID] = true
		require.NotNil(t, r.MITRE, "rule %d %s missing mitre tags", r.ID, r.Name)
		assert.NotEmpty(t, r.MITRE.Tactics, "rule %d missing mitre.tactics", r.ID)
		assert.NotEmpty(t, r.MITRE.Attacks, "rule %d missing mitre.attacks", r.ID)
		assert.NotEmpty(t, r.References, "rule %d missing references", r.ID)
		assert.NotEmpty(t, r.Description, "rule %d missing description", r.ID)
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
			continue
		}
		if r.HasRiskScore() {
			risk++
			assert.Greater(t, r.RiskScore, 0)
			assert.NotEmpty(t, r.Where)
			assert.False(t, r.HasSequence())
			assert.NotEmpty(t, r.AfterEvents, "risk rule %d should honor afterEvents before scoring", r.ID)
			continue
		}
		cel++
		assert.NotEmpty(t, r.Where)
		assert.NotEmpty(t, r.AfterEvents, "CEL rule %d should document afterEvents lookback", r.ID)
	}
	graph := GraphOffenseRules()
	assert.Equal(t, 5, sequence)
	assert.Equal(t, 3, risk)
	assert.Equal(t, 6, cel)
	require.Len(t, graph, 2)
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
	assert.True(t, graphIDs[9415])
	assert.True(t, graphIDs[9416])
	for _, id := range []int64{9401, 9402, 9403, 9404, 9405, 9406, 9407, 9408, 9409, 9410, 9411, 9412, 9413, 9414} {
		assert.True(t, seen[id], "missing skill pack rule %d", id)
	}
	assert.Contains(t, report.LoadedNames, "CEL-WIN-SHADOW-CREDENTIALS")
	assert.Contains(t, report.LoadedNames, "SEQ-KERBEROAST-THEN-LATERAL")
	assert.Contains(t, report.LoadedNames, "RISK-ASREPROAST")
	assert.Contains(t, report.LoadedNames, "GRAPH-JUMP-HOST-MULTI-ACCOUNT")
}
