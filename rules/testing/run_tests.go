// Rule test runner — validates fixture YAML files against correlation rules
// using the same CEL evaluator as the event-processor.
//
// Usage:
//   go run rules/testing/run_tests.go [--fixtures rules/testing/] [--rules rules/] [--fixture path/to/one.test.yml]
//
// Run from the repository root. Paths in fixture `rule:` fields are resolved
// relative to the working directory.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/threatwinds/go-sdk/plugins"
	"google.golang.org/protobuf/types/known/structpb"
	"gopkg.in/yaml.v3"
)

// ---- fixture types --------------------------------------------------------

type Fixture struct {
	Rule        string         `yaml:"rule"`
	Description string         `yaml:"description"`
	Events      []FixtureEvent `yaml:"events"`
	Repeat      int            `yaml:"repeat"`
	Expect      FixtureExpect  `yaml:"expect"`
}

type FixtureEvent struct {
	Timestamp string                 `yaml:"timestamp"`
	DataType  string                 `yaml:"dataType"`
	Action    string                 `yaml:"action"`
	Origin    *FixtureSide           `yaml:"origin"`
	Target    *FixtureSide           `yaml:"target"`
	Log       map[string]interface{} `yaml:"log"`
}

type FixtureSide struct {
	IP           string  `yaml:"ip"`
	Host         string  `yaml:"host"`
	User         string  `yaml:"user"`
	Domain       string  `yaml:"domain"`
	Port         uint32  `yaml:"port"`
	BytesSent    float64 `yaml:"bytesSent"`
	PackagesSent uint64  `yaml:"packagesSent"`
}

type FixtureExpect struct {
	Alert    bool   `yaml:"alert"`
	Severity string `yaml:"severity"`
	Name     string `yaml:"name"`
}

// ---- rule types (mirrors event-processor/rules/types.go) ------------------

type Rule struct {
	ID          int64          `yaml:"id"`
	DataTypes   []string       `yaml:"dataTypes"`
	Name        string         `yaml:"name"`
	Impact      *Impact        `yaml:"impact"`
	Category    string         `yaml:"category"`
	Technique   string         `yaml:"technique"`
	Adversary   string         `yaml:"adversary"`
	Description string         `yaml:"description"`
	Where       string         `yaml:"where"`
	AfterEvents []SearchReq    `yaml:"afterEvents"`
	Correlation []SearchReq    `yaml:"correlation"`
	RiskScore   int            `yaml:"riskScore"`
	Sequence    []SeqStep      `yaml:"sequence"`
}

type Impact struct {
	Confidentiality uint32 `yaml:"confidentiality"`
	Integrity       uint32 `yaml:"integrity"`
	Availability    uint32 `yaml:"availability"`
}

type SearchReq struct {
	IndexPattern string       `yaml:"indexPattern"`
	With         []Expression `yaml:"with"`
	Within       string       `yaml:"within"`
	Count        int64        `yaml:"count"`
	Or           []SearchReq  `yaml:"or"`
}

type Expression struct {
	Field    string `yaml:"field"`
	Operator string `yaml:"operator"`
	Value    string `yaml:"value"`
}

type SeqStep struct {
	Where  string `yaml:"where"`
	Within string `yaml:"within"`
}

func (r *Rule) normalize() {
	if len(r.Correlation) == 0 && len(r.AfterEvents) > 0 {
		r.Correlation = r.AfterEvents
	}
	if r.Impact == nil {
		r.Impact = &Impact{}
	}
}

func (r *Rule) hasRiskScore() bool { return r.RiskScore > 0 }
func (r *Rule) hasSequence() bool  { return len(r.Sequence) > 0 }

// ---- CEL cache (one per run) ----------------------------------------------

var cel = plugins.NewCELCache("com.hivearmor.rules.test")

// ---- event building -------------------------------------------------------

func buildEvent(fe FixtureEvent) *plugins.Event {
	e := &plugins.Event{
		Timestamp: fe.Timestamp,
		DataType:  fe.DataType,
		Action:    fe.Action,
		Log:       make(map[string]*structpb.Value),
	}
	for k, v := range fe.Log {
		sv, err := structpb.NewValue(v)
		if err == nil {
			e.Log[k] = sv
		}
	}
	if fe.Origin != nil {
		e.Origin = &plugins.Side{
			Ip:           fe.Origin.IP,
			Host:         fe.Origin.Host,
			User:         fe.Origin.User,
			Domain:       fe.Origin.Domain,
			Port:         fe.Origin.Port,
			BytesSent:    fe.Origin.BytesSent,
			PackagesSent: fe.Origin.PackagesSent,
		}
	}
	if fe.Target != nil {
		e.Target = &plugins.Side{
			Ip:   fe.Target.IP,
			Host: fe.Target.Host,
			User: fe.Target.User,
		}
	}
	return e
}

// eventToMap mirrors event-processor/rules/engine.go:eventToMap.
func eventToMap(e *plugins.Event) map[string]any {
	m := map[string]any{
		"dataType":     e.DataType,
		"@timestamp":   e.Timestamp,
		"action":       e.Action,
		"actionResult": e.ActionResult,
		"severity":     e.Severity,
		"protocol":     e.Protocol,
	}
	logMap := map[string]any{}
	for k, v := range e.Log {
		if v != nil {
			logMap[k] = v.AsInterface()
		}
	}
	m["log"] = logMap
	if e.Origin != nil {
		m["origin"] = sideToMap(e.Origin)
	}
	if e.Target != nil {
		m["target"] = sideToMap(e.Target)
	}
	return m
}

func sideToMap(s *plugins.Side) map[string]any {
	return map[string]any{
		"ip":           s.Ip,
		"host":         s.Host,
		"user":         s.User,
		"domain":       s.Domain,
		"port":         s.Port,
		"bytesSent":    s.BytesSent,
		"packagesSent": s.PackagesSent,
	}
}

func eventJSON(e *plugins.Event) string {
	b, _ := json.Marshal(eventToMap(e))
	return string(b)
}

// ---- in-memory correlation stub -------------------------------------------
// Counts how many fixture events match the SearchReq expressions, replacing
// the live OpenSearch query used in production.

func correlationMatches(sr SearchReq, events []*plugins.Event, triggerJSON string) bool {
	var count int64
	for _, e := range events {
		flat := flattenMap(eventToMap(e), "")
		if exprMatch(sr.With, flat, triggerJSON) {
			count++
		}
	}
	if count >= sr.Count {
		return true
	}
	for _, or_ := range sr.Or {
		if correlationMatches(or_, events, triggerJSON) {
			return true
		}
	}
	return false
}

func exprMatch(exprs []Expression, flat map[string]any, triggerJSON string) bool {
	for _, ex := range exprs {
		val := resolveTemplate(ex.Value, triggerJSON)
		got := fmt.Sprintf("%v", flat[ex.Field])
		switch ex.Operator {
		case "filter_term", "filter_match":
			if got != val {
				return false
			}
		case "must_not_term", "must_not_match":
			if got == val {
				return false
			}
		}
	}
	return true
}

func resolveTemplate(tmpl, eventJSON string) string {
	if !strings.Contains(tmpl, "{{") {
		return tmpl
	}
	var nested map[string]any
	if err := json.Unmarshal([]byte(eventJSON), &nested); err != nil {
		return tmpl
	}
	flat := flattenMap(nested, "")
	result := tmpl
	for k, v := range flat {
		ph := "{{." + k + "}}"
		if strings.Contains(result, ph) {
			result = strings.ReplaceAll(result, ph, fmt.Sprintf("%v", v))
		}
	}
	return result
}

func flattenMap(m map[string]any, prefix string) map[string]any {
	result := make(map[string]any)
	for k, v := range m {
		key := k
		if prefix != "" {
			key = prefix + "." + k
		}
		if sub, ok := v.(map[string]any); ok {
			for sk, sv := range flattenMap(sub, key) {
				result[sk] = sv
			}
		} else {
			result[key] = v
		}
	}
	return result
}

// ---- sequence stub --------------------------------------------------------

type seqState struct {
	step      int
	stepCount int
}

// runSequence drives the sequence engine steps in-process using the fixture events.
func runSequence(rule *Rule, events []*plugins.Event) bool {
	states := map[string]*seqState{} // keyed by origin IP+user

	for _, e := range events {
		key := ""
		if e.Origin != nil {
			key = e.Origin.Ip + "|" + e.Origin.User
		}
		if key == "" {
			key = "_"
		}
		js := eventJSON(e)

		st, exists := states[key]

		// Try to start step 0
		if !exists {
			ok, _ := cel.Evaluate(&js, rule.Sequence[0].Where)
			if ok {
				if len(rule.Sequence) == 1 {
					return true
				}
				states[key] = &seqState{step: 1}
			}
			continue
		}

		// Advance existing sequence
		if st.step >= len(rule.Sequence) {
			continue
		}
		ok, _ := cel.Evaluate(&js, rule.Sequence[st.step].Where)
		if ok {
			st.step++
			if st.step >= len(rule.Sequence) {
				return true
			}
		}
	}
	return false
}

// ---- risk stub ------------------------------------------------------------

const riskThreshold = 75.0

func runRisk(rule *Rule, events []*plugins.Event) bool {
	score := 0.0
	for _, e := range events {
		js := eventJSON(e)
		ok, _ := cel.Evaluate(&js, rule.Where)
		if ok {
			score += float64(rule.RiskScore)
		}
	}
	return score >= riskThreshold
}

// ---- fixture loading ------------------------------------------------------

func loadFixture(path string) (*Fixture, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var f Fixture
	if err := yaml.Unmarshal(data, &f); err != nil {
		return nil, err
	}
	return &f, nil
}

func loadRule(path string) (*Rule, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	// Try single rule first
	var single Rule
	if err := yaml.Unmarshal(data, &single); err == nil && single.Name != "" {
		single.normalize()
		return &single, nil
	}
	// Try list
	var list []Rule
	if err := yaml.Unmarshal(data, &list); err != nil || len(list) == 0 {
		return nil, fmt.Errorf("no rule found in %s", path)
	}
	list[0].normalize()
	return &list[0], nil
}

// ---- evaluation -----------------------------------------------------------

type result struct {
	fixture string
	pass    bool
	msg     string
}

func runFixture(fixturePath string) result {
	f, err := loadFixture(fixturePath)
	if err != nil {
		return result{fixturePath, false, fmt.Sprintf("load fixture: %v", err)}
	}

	rule, err := loadRule(f.Rule)
	if err != nil {
		return result{fixturePath, false, fmt.Sprintf("load rule %q: %v", f.Rule, err)}
	}

	// Build event list, applying repeat to the last event if set
	var events []*plugins.Event
	for i, fe := range f.Events {
		repeat := 1
		if f.Repeat > 0 && i == len(f.Events)-1 {
			repeat = f.Repeat
		}
		for j := 0; j < repeat; j++ {
			events = append(events, buildEvent(fe))
		}
	}

	name := filepath.Base(fixturePath)
	desc := ""
	if f.Description != "" {
		desc = " — " + f.Description
	}

	var fired bool
	var firedName, firedSeverity string

	switch {
	case rule.hasSequence():
		fired = runSequence(rule, events)
		if fired {
			firedName = rule.Name
			firedSeverity = "3"
		}

	case rule.hasRiskScore():
		fired = runRisk(rule, events)
		if fired {
			firedName = "Risk Threshold Exceeded"
			firedSeverity = "3"
		}

	default:
		for _, e := range events {
			js := eventJSON(e)
			ok, celErr := cel.Evaluate(&js, rule.Where)
			if celErr != nil {
				return result{name, false, fmt.Sprintf("CEL error: %v", celErr)}
			}
			if !ok {
				continue
			}
			// Correlation check (stub)
			if len(rule.Correlation) > 0 {
				if !correlationMatches(rule.Correlation[0], events, js) {
					continue
				}
			}
			fired = true
			firedName = rule.Name
			impactScore := rule.Impact.Confidentiality + rule.Impact.Integrity + rule.Impact.Availability
			switch {
			case impactScore >= 8:
				firedSeverity = "3"
			case impactScore >= 5:
				firedSeverity = "2"
			default:
				firedSeverity = "1"
			}
			break
		}
	}

	if f.Expect.Alert && !fired {
		return result{name, false, fmt.Sprintf("expected alert but none fired%s", desc)}
	}
	if !f.Expect.Alert && fired {
		return result{name, false, fmt.Sprintf("expected no alert but alert fired (name=%q)%s", firedName, desc)}
	}
	if f.Expect.Alert {
		if f.Expect.Name != "" && firedName != f.Expect.Name {
			return result{name, false, fmt.Sprintf("alert name mismatch: got %q want %q%s", firedName, f.Expect.Name, desc)}
		}
		if f.Expect.Severity != "" && firedSeverity != f.Expect.Severity {
			return result{name, false, fmt.Sprintf("severity mismatch: got %q want %q%s", firedSeverity, f.Expect.Severity, desc)}
		}
	}

	label := "alert fired"
	if !f.Expect.Alert {
		label = "no alert"
	}
	return result{name, true, fmt.Sprintf("%s, severity=%s ✓%s", label, firedSeverity, desc)}
}

// ---- main -----------------------------------------------------------------

func main() {
	fixturesDir := flag.String("fixtures", "rules/testing", "directory of *.test.yml files")
	rulesDir := flag.String("rules", "rules", "rules root directory (unused by runner, kept for parity)")
	singleFixture := flag.String("fixture", "", "run a single fixture file")
	flag.Parse()
	_ = rulesDir

	var paths []string
	if *singleFixture != "" {
		paths = []string{*singleFixture}
	} else {
		entries, err := os.ReadDir(*fixturesDir)
		if err != nil {
			fmt.Fprintf(os.Stderr, "cannot read fixtures dir %q: %v\n", *fixturesDir, err)
			os.Exit(1)
		}
		for _, e := range entries {
			if !e.IsDir() && strings.HasSuffix(e.Name(), ".test.yml") {
				paths = append(paths, filepath.Join(*fixturesDir, e.Name()))
			}
		}
	}

	if len(paths) == 0 {
		fmt.Println("No test fixtures found.")
		os.Exit(0)
	}

	passed, failed := 0, 0
	for _, p := range paths {
		r := runFixture(p)
		if r.pass {
			fmt.Printf("✓ %s — %s\n", r.fixture, r.msg)
			passed++
		} else {
			fmt.Printf("✗ %s — FAIL: %s\n", r.fixture, r.msg)
			failed++
		}
	}
	fmt.Printf("\nResults: %d passed, %d failed\n", passed, failed)
	if failed > 0 {
		os.Exit(1)
	}
}
