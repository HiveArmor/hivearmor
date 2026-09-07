package rules

import (
	"path/filepath"
	"runtime"
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
	assert.Equal(t, 5, report.Loaded)
	assert.Equal(t, 0, report.Skipped)

	var sequence, risk int
	for _, r := range AllRules() {
		if r.HasSequence() {
			sequence++
			require.GreaterOrEqual(t, len(r.Sequence), 2)
			assert.NotEmpty(t, r.Sequence[0].Where)
			assert.NotEmpty(t, r.Sequence[0].Within)
		}
		if r.HasRiskScore() {
			risk++
			assert.Greater(t, r.RiskScore, 0)
			assert.NotEmpty(t, r.Where)
			assert.False(t, r.HasSequence())
		}
	}
	graph := GraphOffenseRules()
	assert.Equal(t, 2, sequence)
	assert.Equal(t, 2, risk)
	require.Len(t, graph, 1)
	assert.True(t, graph[0].IsGraphOffense())
	assert.Contains(t, graph[0].CypherQuery, "LOGGED_INTO")
	assert.Equal(t, int64(9105), graph[0].ID)
}
