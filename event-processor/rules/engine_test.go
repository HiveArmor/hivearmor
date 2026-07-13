package rules

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func queryBool(t *testing.T, exprs []Expression, eventJSON string) map[string]any {
	t.Helper()
	boolQuery := buildBoolQuery(exprs, eventJSON)
	query := map[string]any{
		"query": map[string]any{"bool": boolQuery},
	}
	raw, err := json.Marshal(query)
	require.NoError(t, err)
	var parsed map[string]any
	require.NoError(t, json.Unmarshal(raw, &parsed))
	return parsed["query"].(map[string]any)["bool"].(map[string]any)
}

func TestBuildQuery_MustNotTermExcludesMatchingField(t *testing.T) {
	exprs := []Expression{
		{Field: "logType", Operator: "filter_term", Value: "ConsoleLogin"},
		{Field: "origin.geolocation.countryCode", Operator: "must_not_term", Value: "US"},
	}
	eventJSON := `{"logType":"ConsoleLogin","origin":{"geolocation":{"countryCode":"US"}}}`
	boolClause := queryBool(t, exprs, eventJSON)

	assert.Contains(t, boolClause, "must", "must clause must be present")
	assert.Contains(t, boolClause, "must_not", "must_not clause must be present when must_not_term is used")

	mustNots := boolClause["must_not"].([]any)
	assert.Len(t, mustNots, 1, "exactly one must_not clause expected")

	termClause := mustNots[0].(map[string]any)["term"].(map[string]any)
	assert.Contains(t, termClause, "origin.geolocation.countryCode.keyword")
	assert.Equal(t, "US", termClause["origin.geolocation.countryCode.keyword"])
}

func TestBuildQuery_MustNotMatchExcludesMatchingField(t *testing.T) {
	exprs := []Expression{
		{Field: "message", Operator: "must_not_match", Value: "test"},
	}
	boolClause := queryBool(t, exprs, `{"message":"test"}`)

	assert.Contains(t, boolClause, "must_not")
	mustNots := boolClause["must_not"].([]any)
	assert.Len(t, mustNots, 1)
	matchClause := mustNots[0].(map[string]any)["match"].(map[string]any)
	assert.Equal(t, "test", matchClause["message"])
}

func TestBuildQuery_FilterTermOnly_HasNoMustNot(t *testing.T) {
	exprs := []Expression{
		{Field: "status", Operator: "filter_term", Value: "active"},
	}
	boolClause := queryBool(t, exprs, `{"status":"active"}`)

	assert.NotContains(t, boolClause, "must_not", "must_not must not appear when no must_not_term expressions exist")
}

func TestBuildQuery_EmptyExpressions_ProducesEmptyBool(t *testing.T) {
	boolClause := queryBool(t, nil, `{}`)

	assert.NotContains(t, boolClause, "must_not")
	musts, ok := boolClause["must"].([]any)
	assert.True(t, ok)
	assert.Empty(t, musts, "empty expressions must produce empty must clause")
}

func TestBuildQuery_MixedOperators(t *testing.T) {
	exprs := []Expression{
		{Field: "type", Operator: "filter_term", Value: "login"},
		{Field: "country", Operator: "must_not_term", Value: "US"},
		{Field: "message", Operator: "must_not_match", Value: "error"},
	}
	boolClause := queryBool(t, exprs, `{}`)

	musts := boolClause["must"].([]any)
	assert.Len(t, musts, 1)

	mustNots := boolClause["must_not"].([]any)
	assert.Len(t, mustNots, 2)
}
