package rules

import (
	"strings"
	"testing"
)

func TestClassifyEngineFromText(t *testing.T) {
	if got := ClassifyEngineFromText("type: graph_offense\ncypherQuery: MATCH (n) RETURN n"); got != EngineGraph {
		t.Fatalf("graph: got %s", got)
	}
	if got := ClassifyEngineFromText("name: SEQ\nsequence:\n  - where: 'action == \"x\"'\n"); got != EngineSequence {
		t.Fatalf("sequence: got %s", got)
	}
	if got := ClassifyEngineFromText("name: RISK\nriskScore: 25\nwhere: 'true'\n"); got != EngineRisk {
		t.Fatalf("risk: got %s", got)
	}
	if got := ClassifyEngineFromText("name: CEL\nwhere: 'action == \"x\"'\n"); got != EngineCEL {
		t.Fatalf("cel: got %s", got)
	}
}

func TestEvaluateDraft_sequenceNeverFakesHitFromStepCEL(t *testing.T) {
	yaml := `
id: 9101
name: SEQ-BRUTE-FORCE-THEN-SUCCESS
sequence:
  - where: 'action == "failed_auth"'
    within: 15m
  - where: 'action == "authentication_success"'
    within: 30m
`
	step0 := EvaluateDraft(yaml, map[string]any{"action": "failed_auth"})
	if step0.Engine != EngineSequence || step0.EngineParity != EngineParityGo {
		t.Fatalf("engine=%s parity=%s", step0.Engine, step0.EngineParity)
	}
	if step0.Matched || step0.WouldAlert || step0.SequenceComplete {
		t.Fatalf("step-0 CEL must not be a sequence hit: %+v", step0)
	}
	if len(step0.StepMatches) != 2 || !step0.StepMatches[0].Matched || step0.StepMatches[1].Matched {
		t.Fatalf("expected step0 match only, got %+v", step0.StepMatches)
	}
	if !strings.Contains(step0.Explanation, "sequenceComplete=false") {
		t.Fatalf("explanation should deny sequence complete: %s", step0.Explanation)
	}

	complete := EvaluateDraft(yaml, map[string]any{"action": "failed_auth"})
	// A single event cannot satisfy two different action equalities.
	if complete.Matched {
		t.Fatal("two-step sequence must not complete on one event")
	}
}

func TestEvaluateDraft_oneStepSequenceCanComplete(t *testing.T) {
	yaml := `
name: SEQ-ONE
sequence:
  - where: 'action == "failed_auth"'
    within: 5m
`
	got := EvaluateDraft(yaml, map[string]any{"action": "failed_auth"})
	if !got.SequenceComplete || !got.Matched || !got.WouldAlert {
		t.Fatalf("one-step sequence should complete: %+v", got)
	}
}

func TestEvaluateDraft_riskWhereDoesNotFakeAlert(t *testing.T) {
	yaml := `
name: RISK-FAILED-AUTH
riskScore: 25
where: 'action == "failed_auth"'
`
	hit := EvaluateDraft(yaml, map[string]any{"action": "failed_auth"})
	if hit.Engine != EngineRisk || !hit.RiskWhereMatched || !hit.Matched {
		t.Fatalf("risk where should match: %+v", hit)
	}
	if hit.WouldAlert {
		t.Fatal("risk evaluate must not fake wouldAlert from a single increment")
	}
	if hit.RiskScoreDelta != 25 {
		t.Fatalf("riskScoreDelta=%d", hit.RiskScoreDelta)
	}

	miss := EvaluateDraft(yaml, map[string]any{"action": "ok"})
	if miss.Matched || miss.RiskWhereMatched || miss.RiskScoreDelta != 0 {
		t.Fatalf("risk miss: %+v", miss)
	}
}

func TestEvaluateDraft_graphDoesNotRunCypher(t *testing.T) {
	yaml := `
name: GRAPH-PRIVILEGED-PIVOT-THEN-C2
type: graph_offense
cypherQuery: |
  MATCH (u:User) RETURN u.username AS user
`
	got := EvaluateDraft(yaml, map[string]any{"user": "admin"})
	if got.Engine != EngineGraph || got.EngineParity != EngineParityGo {
		t.Fatalf("graph engine/parity: %+v", got)
	}
	if got.Matched || got.WouldAlert || got.GraphEvaluated {
		t.Fatalf("graph must not fake a Cypher hit: %+v", got)
	}
}

func TestLoadReportLists_onlyLoadedNames(t *testing.T) {
	report := LoadReport{
		Loaded:      1,
		LoadedNames: []string{"PILOT-WIN-FAILED-LOGON"},
	}
	if !report.Lists("PILOT-WIN-FAILED-LOGON") {
		t.Fatal("expected listed rule")
	}
	if report.Lists("STAGED-SIGMA-NOT-ON-DISK") {
		t.Fatal("unlisted rule must not count as loaded")
	}
	if report.Lists("") {
		t.Fatal("blank name is not loaded")
	}
}

func TestLoadFromDir_populatesLoadedNames(t *testing.T) {
	snapshotRules(t)
	report := LoadFromDir(pilotDir(t))
	if !report.Lists("PILOT-WIN-FAILED-LOGON") {
		t.Fatalf("pilot rule missing from LoadedNames=%v invalid=%v", report.LoadedNames, report.Invalid)
	}
	if report.Lists("not-a-real-rule") {
		t.Fatal("unknown name listed")
	}
}
