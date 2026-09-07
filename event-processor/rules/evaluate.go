package rules

import (
	"encoding/json"
	"fmt"
	"strings"

	"gopkg.in/yaml.v3"
)

const (
	EngineCEL      = "cel"
	EngineSequence = "sequence"
	EngineRisk     = "risk"
	EngineGraph    = "graph"

	EngineParityGo          = "go"
	EngineParityUnavailable = "unavailable"
)

// SequenceStepResult is one sequence step evaluated against a single event.
type SequenceStepResult struct {
	Index   int    `json:"index"`
	Where   string `json:"where"`
	Matched bool   `json:"matched"`
	Error   string `json:"error,omitempty"`
}

// DraftEvaluation is the INTERNAL_KEY dry-run result for a rule + event.
// Sequence hits are never inferred from a single CEL step match.
type DraftEvaluation struct {
	Engine           string               `json:"engine"`
	EngineParity     string               `json:"engineParity"`
	EvaluationMode   string               `json:"evaluationMode"`
	Matched          bool                 `json:"matched"`
	WouldAlert       bool                 `json:"wouldAlert"`
	OpenSearchQueried bool                `json:"openSearchQueried"`
	SyntaxOK         bool                 `json:"syntaxOk"`
	Explanation      string               `json:"explanation"`
	Honesty          string               `json:"honesty"`
	MatchedFields    []string             `json:"matchedFields"`
	RuleName         string               `json:"ruleName,omitempty"`
	SequenceComplete bool                 `json:"sequenceComplete"`
	StepMatches      []SequenceStepResult `json:"stepMatches,omitempty"`
	RiskScoreDelta   int                  `json:"riskScoreDelta,omitempty"`
	RiskWhereMatched bool                 `json:"riskWhereMatched,omitempty"`
	GraphEvaluated   bool                 `json:"graphEvaluated,omitempty"`
}

// ParseRuleYAML unmarshals a single native rule document.
func ParseRuleYAML(ruleYAML string) (*Rule, error) {
	trimmed := strings.TrimSpace(ruleYAML)
	if trimmed == "" {
		return nil, fmt.Errorf("rule YAML is empty")
	}
	var single Rule
	if err := yaml.Unmarshal([]byte(trimmed), &single); err == nil && strings.TrimSpace(single.Name) != "" {
		single.Normalize()
		return &single, nil
	}
	var list []Rule
	if err := yaml.Unmarshal([]byte(trimmed), &list); err == nil && len(list) > 0 && strings.TrimSpace(list[0].Name) != "" {
		list[0].Normalize()
		return &list[0], nil
	}
	if err := yaml.Unmarshal([]byte(trimmed), &single); err != nil {
		return nil, fmt.Errorf("rule YAML parse: %w", err)
	}
	single.Normalize()
	return &single, nil
}

// ClassifyEngine returns sequence / risk / graph / cel from a parsed rule.
func ClassifyEngine(r *Rule) string {
	if r == nil {
		return EngineCEL
	}
	if r.IsGraphOffense() {
		return EngineGraph
	}
	if r.HasSequence() {
		return EngineSequence
	}
	if r.HasRiskScore() {
		return EngineRisk
	}
	return EngineCEL
}

// ClassifyEngineFromText inspects raw YAML/text when a parsed rule is incomplete.
func ClassifyEngineFromText(text string) string {
	blob := strings.ToLower(text)
	if strings.Contains(blob, "type: graph_offense") || strings.Contains(blob, "type:graph_offense") {
		return EngineGraph
	}
	if strings.Contains(text, "\nsequence:") || strings.HasPrefix(strings.TrimSpace(text), "sequence:") {
		return EngineSequence
	}
	if strings.Contains(blob, "riskscore:") {
		return EngineRisk
	}
	return EngineCEL
}

// EvaluateDraft runs Go CEL / sequence / risk / graph honesty against one event.
// Sequence matched=true only when every step matches this same event (never step-0 as a hit).
func EvaluateDraft(ruleYAML string, event map[string]any) DraftEvaluation {
	if event == nil {
		event = map[string]any{}
	}
	eval := DraftEvaluation{
		EngineParity:      EngineParityGo,
		EvaluationMode:    "ep_evaluate",
		OpenSearchQueried: false,
		MatchedFields:     []string{},
	}

	rule, err := ParseRuleYAML(ruleYAML)
	engine := ClassifyEngineFromText(ruleYAML)
	if err == nil && rule != nil {
		if classified := ClassifyEngine(rule); classified != EngineCEL {
			engine = classified
		} else if engine == EngineCEL {
			engine = ClassifyEngine(rule)
		}
		eval.RuleName = rule.Name
	}
	eval.Engine = engine

	switch engine {
	case EngineSequence:
		return evaluateSequence(eval, rule, ruleYAML, event)
	case EngineRisk:
		return evaluateRisk(eval, rule, ruleYAML, event)
	case EngineGraph:
		return evaluateGraph(eval, rule)
	default:
		return evaluateCEL(eval, rule, ruleYAML, event)
	}
}

func evaluateCEL(eval DraftEvaluation, rule *Rule, ruleYAML string, event map[string]any) DraftEvaluation {
	where := ""
	if rule != nil {
		where = strings.TrimSpace(rule.Where)
	}
	if where == "" {
		where = strings.TrimSpace(ruleYAML)
	}
	if where == "" {
		eval.SyntaxOK = false
		eval.Explanation = "No CEL where expression to evaluate."
		eval.Honesty = goHonesty(EngineCEL)
		return eval
	}
	ok, err := evaluateCELExpr(event, where)
	eval.SyntaxOK = err == nil
	eval.Matched = err == nil && ok
	eval.WouldAlert = eval.Matched
	if err != nil {
		eval.Explanation = "Go CEL evaluate error: " + err.Error()
	} else if ok {
		eval.MatchedFields = []string{"where"}
		eval.Explanation = "Go CEL where matched. engineParity=go."
	} else {
		eval.Explanation = "Go CEL where did not match. engineParity=go."
	}
	eval.Honesty = goHonesty(EngineCEL)
	return eval
}

func evaluateSequence(eval DraftEvaluation, rule *Rule, ruleYAML string, event map[string]any) DraftEvaluation {
	if rule == nil || !rule.HasSequence() {
		eval.SyntaxOK = false
		eval.Explanation = "Sequence block could not be parsed from rule YAML."
		eval.Honesty = goHonesty(EngineSequence)
		return eval
	}
	eval.SyntaxOK = true
	steps := make([]SequenceStepResult, 0, len(rule.Sequence))
	allMatched := len(rule.Sequence) > 0
	anyStepErr := false
	for i, step := range rule.Sequence {
		res := SequenceStepResult{Index: i, Where: step.Where}
		ok, err := evaluateCELExpr(event, step.Where)
		if err != nil {
			res.Error = err.Error()
			anyStepErr = true
			allMatched = false
		} else {
			res.Matched = ok
			if !ok {
				allMatched = false
			}
		}
		steps = append(steps, res)
	}
	eval.StepMatches = steps
	eval.SequenceComplete = allMatched && !anyStepErr
	// Never treat a partial/step-0 CEL match as a sequence hit.
	eval.Matched = eval.SequenceComplete
	eval.WouldAlert = eval.SequenceComplete
	if eval.SequenceComplete {
		eval.MatchedFields = []string{"sequence"}
		eval.Explanation = fmt.Sprintf(
			"Go sequence engine: all %d steps matched this single event (sequenceComplete=true). engineParity=go.",
			len(steps))
	} else {
		matchedSteps := 0
		for _, s := range steps {
			if s.Matched {
				matchedSteps++
			}
		}
		eval.Explanation = fmt.Sprintf(
			"Go sequence engine: %d/%d steps matched this single event; sequenceComplete=false. "+
				"A step CEL match is not a sequence hit. engineParity=go.",
			matchedSteps, len(steps))
	}
	eval.Honesty = goHonesty(EngineSequence)
	_ = ruleYAML
	return eval
}

func evaluateRisk(eval DraftEvaluation, rule *Rule, ruleYAML string, event map[string]any) DraftEvaluation {
	if rule == nil || !rule.HasRiskScore() {
		eval.SyntaxOK = false
		eval.Explanation = "riskScore rule could not be parsed from YAML."
		eval.Honesty = goHonesty(EngineRisk)
		return eval
	}
	where := strings.TrimSpace(rule.Where)
	if where == "" {
		eval.SyntaxOK = false
		eval.Explanation = "Risk rule is missing CEL where."
		eval.Honesty = goHonesty(EngineRisk)
		return eval
	}
	ok, err := evaluateCELExpr(event, where)
	eval.SyntaxOK = err == nil
	eval.RiskWhereMatched = err == nil && ok
	eval.Matched = eval.RiskWhereMatched
	eval.WouldAlert = false // threshold is stateful; a single event does not fake a fire
	if eval.RiskWhereMatched {
		eval.RiskScoreDelta = rule.RiskScore
		eval.MatchedFields = []string{"where"}
		eval.Explanation = fmt.Sprintf(
			"Go risk engine: where matched; riskScoreDelta=%d. wouldAlert=false (threshold is stateful). engineParity=go.",
			rule.RiskScore)
	} else if err != nil {
		eval.Explanation = "Go risk engine CEL error: " + err.Error()
	} else {
		eval.Explanation = "Go risk engine: where did not match; no score increment. engineParity=go."
	}
	eval.Honesty = goHonesty(EngineRisk)
	_ = ruleYAML
	return eval
}

func evaluateGraph(eval DraftEvaluation, rule *Rule) DraftEvaluation {
	eval.SyntaxOK = rule != nil && rule.IsGraphOffense() && strings.TrimSpace(rule.CypherQuery) != ""
	eval.Matched = false
	eval.WouldAlert = false
	eval.GraphEvaluated = false
	eval.Explanation = "Go graph_offense engine: single-event evaluate does not run Cypher. " +
		"graphEvaluated=false. Graph rules require Neo4j (NEO4J_ENABLED). engineParity=go."
	eval.Honesty = goHonesty(EngineGraph)
	return eval
}

func evaluateCELExpr(event map[string]any, expression string) (bool, error) {
	expr := strings.TrimSpace(expression)
	if expr == "" {
		return false, fmt.Errorf("empty CEL expression")
	}
	js, err := json.Marshal(event)
	if err != nil {
		return false, err
	}
	s := string(js)
	return getCEL().Evaluate(&s, expr)
}

func goHonesty(engine string) string {
	return "STAGING CANDIDATE — event-processor INTERNAL_KEY evaluate (engineParity=go). " +
		"Does not persist events or alerts. Sequence hits are never faked from Java CEL or a single step match. " +
		"engine=" + engine
}
