package main

import (
	"strings"
	"testing"
)

// baseImpact is a valid impact block shared by the test cases.
func baseImpact() map[string]any {
	return map[string]any{"confidentiality": 3, "integrity": 2, "availability": 1}
}

func hasViolation(vs []string, substr string) bool {
	for _, v := range vs {
		if strings.Contains(v, substr) {
			return true
		}
	}
	return false
}

// A graph_offense rule triggers via its Cypher query and is routed by
// schedule, so it may legitimately omit dataTypes and where/riskScore/sequence
// (mirrors rules/evaluate.go + rules/tenant_tree.go in the event-processor).
func TestGraphOffenseRuleIsValidWithoutDataTypesOrWhere(t *testing.T) {
	r := &ruleDoc{
		Name:        "GRAPH-MULTI-HOST-C2-BEACON",
		Type:        "graph_offense",
		Category:    "Command and Control",
		Impact:      baseImpact(),
		CypherQuery: "MATCH (h:Host)-[:COMMUNICATED_WITH]->(ip:IpAddress) RETURN ip",
		// no DataTypes, no Where/RiskScore/Sequence — valid for graph_offense
	}
	if vs := r.violations(); len(vs) != 0 {
		t.Fatalf("expected no violations for a valid graph_offense rule, got: %v", vs)
	}
}

// A graph_offense rule with no cypherQuery has no trigger and must fail.
func TestGraphOffenseRuleRequiresCypherQuery(t *testing.T) {
	r := &ruleDoc{
		Name:     "GRAPH-NO-QUERY",
		Type:     "graph_offense",
		Category: "Command and Control",
		Impact:   baseImpact(),
	}
	vs := r.violations()
	if !hasViolation(vs, "cypherQuery") {
		t.Fatalf("expected a cypherQuery violation, got: %v", vs)
	}
}

// A non-graph rule still requires dataTypes and one of where/riskScore/sequence.
func TestNonGraphRuleStillRequiresEvalTrigger(t *testing.T) {
	r := &ruleDoc{
		Name:      "PLAIN-NO-TRIGGER",
		Category:  "Execution",
		Impact:    baseImpact(),
		DataTypes: []string{"wineventlog"},
		// no Where/RiskScore/Sequence
	}
	vs := r.violations()
	if !hasViolation(vs, "at least one of") {
		t.Fatalf("expected an eval-trigger violation for a non-graph rule, got: %v", vs)
	}
}

// A non-graph rule missing dataTypes is still flagged.
func TestNonGraphRuleRequiresDataTypes(t *testing.T) {
	r := &ruleDoc{
		Name:     "PLAIN-NO-DATATYPES",
		Category: "Execution",
		Impact:   baseImpact(),
		Where:    "exists(\"log.message\")",
	}
	vs := r.violations()
	if !hasViolation(vs, "dataTypes") {
		t.Fatalf("expected a dataTypes violation for a non-graph rule, got: %v", vs)
	}
}
