// rule-test — validates rule test fixtures in rules/testing/*.test.yml.
//
// Usage (from repo root):
//
//	cd event-processor && go run ./cmd/rule-test/ --root .. [flags]
//	cd event-processor && go run ./cmd/rule-test/ --root .. --fixture ../rules/testing/windows-brute-force.test.yml
//
// Flags:
//
//	--root      repository root; rule paths in fixtures are resolved relative to this (default: ..)
//	--fixtures  directory of *.test.yml files (default: <root>/rules/testing)
//	--fixture   run a single fixture file
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

// ---- fixture schema -------------------------------------------------------

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
	Protocol  string                 `yaml:"protocol"`
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

// ---- rule schema (mirrors event-processor/rules/types.go) -----------------

type Rule struct {
	ID          int64       `yaml:"id"`
	DataTypes   []string    `yaml:"dataTypes"`
	Name        string      `yaml:"name"`
	Impact      *Impact     `yaml:"impact"`
	Category    string      `yaml:"category"`
	Technique   string      `yaml:"technique"`
	Adversary   string      `yaml:"adversary"`
	Description string      `yaml:"description"`
	Where       string      `yaml:"where"`
	AfterEvents []SearchReq `yaml:"afterEvents"`
	Correlation []SearchReq `yaml:"correlation"`
	RiskScore   int         `yaml:"riskScore"`
	Sequence    []SeqStep   `yaml:"sequence"`
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

// ---- globals --------------------------------------------------------------

var (
	celCache = plugins.NewCELCache("com.hivearmor.rules.test")
	repoRoot = ".."
)

// ---- event helpers --------------------------------------------------------

func buildEvent(fe FixtureEvent) *plugins.Event {
	e := &plugins.Event{
		Timestamp: fe.Timestamp,
		DataType:  fe.DataType,
		Action:    fe.Action,
		Protocol:  fe.Protocol,
		Log:       make(map[string]*structpb.Value),
	}
	for k, v := range fe.Log {
		if sv, err := structpb.NewValue(v); err == nil {
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
			Port: fe.Target.Port,
		}
	}
	return e
}

// eventToMap mirrors event-processor/rules/engine.go.
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
		m["origin"] = map[string]any{
			"ip":           e.Origin.Ip,
			"host":         e.Origin.Host,
			"user":         e.Origin.User,
			"domain":       e.Origin.Domain,
			"port":         e.Origin.Port,
			"bytesSent":    e.Origin.BytesSent,
			"packagesSent": e.Origin.PackagesSent,
		}
	}
	if e.Target != nil {
		m["target"] = map[string]any{
			"ip":   e.Target.Ip,
			"host": e.Target.Host,
			"user": e.Target.User,
			"port": e.Target.Port,
		}
	}
	return m
}

func toJSON(e *plugins.Event) string {
	b, _ := json.Marshal(eventToMap(e))
	return string(b)
}

func flattenMap(m map[string]any, prefix string) map[string]any {
	out := make(map[string]any)
	for k, v := range m {
		key := k
		if prefix != "" {
			key = prefix + "." + k
		}
		if sub, ok := v.(map[string]any); ok {
			for sk, sv := range flattenMap(sub, key) {
				out[sk] = sv
			}
		} else {
			out[key] = v
		}
	}
	return out
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

// ---- in-memory correlation stub -------------------------------------------
// Replaces the live OpenSearch afterEvents query: counts fixture events that
// match the expressions so threshold rules can be verified without a cluster.

var debugCorrel bool

func correlationMatches(sr SearchReq, events []*plugins.Event, triggerEventJSON string) bool {
	var count int64
	for _, e := range events {
		flat := flattenMap(eventToMap(e), "")
		match := exprsMatch(sr.With, flat, triggerEventJSON)
		if debugCorrel {
			fmt.Fprintf(os.Stderr, "[debug] correl event dataType=%s origin.ip=%v target.port=%v match=%v\n",
				e.DataType, flat["origin.ip"], flat["target.port"], match)
		}
		if match {
			count++
		}
	}
	if debugCorrel {
		fmt.Fprintf(os.Stderr, "[debug] correl count=%d need=%d\n", count, sr.Count)
	}
	if count >= sr.Count {
		return true
	}
	for _, branch := range sr.Or {
		if correlationMatches(branch, events, triggerEventJSON) {
			return true
		}
	}
	return false
}

func exprsMatch(exprs []Expression, flat map[string]any, triggerJSON string) bool {
	for _, ex := range exprs {
		want := resolveTemplate(ex.Value, triggerJSON)
		// Strip OpenSearch .keyword suffix — the stub works on plain field names.
		field := strings.TrimSuffix(ex.Field, ".keyword")
		got := fmt.Sprintf("%v", flat[field])
		switch ex.Operator {
		case "filter_term", "filter_match":
			if got != want {
				return false
			}
		case "must_not_term", "must_not_match":
			if got == want {
				return false
			}
		}
	}
	return true
}

// ---- risk stub ------------------------------------------------------------

const riskThreshold = 75.0

func runRisk(rule *Rule, events []*plugins.Event) bool {
	var score float64
	for _, e := range events {
		js := toJSON(e)
		ok, _ := celCache.Evaluate(&js, rule.Where)
		if ok {
			score += float64(rule.RiskScore)
		}
	}
	return score >= riskThreshold
}

// ---- sequence stub --------------------------------------------------------

func runSequence(rule *Rule, events []*plugins.Event) bool {
	// step tracks which sequence step each adversary key is waiting for.
	step := map[string]int{}

	for _, e := range events {
		key := "_"
		if e.Origin != nil {
			key = e.Origin.Ip + "|" + e.Origin.User
		}
		js := toJSON(e)

		current, started := step[key]
		if !started {
			ok, _ := celCache.Evaluate(&js, rule.Sequence[0].Where)
			if ok {
				if len(rule.Sequence) == 1 {
					return true
				}
				step[key] = 1
			}
			continue
		}
		if current >= len(rule.Sequence) {
			continue
		}
		ok, _ := celCache.Evaluate(&js, rule.Sequence[current].Where)
		if ok {
			current++
			step[key] = current
			if current >= len(rule.Sequence) {
				return true
			}
		}
	}
	return false
}

// ---- loaders --------------------------------------------------------------

func loadFixture(path string) (*Fixture, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var f Fixture
	return &f, yaml.Unmarshal(data, &f)
}

func loadRule(path string) (*Rule, error) {
	if !filepath.IsAbs(path) {
		path = filepath.Join(repoRoot, path)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var single Rule
	if err := yaml.Unmarshal(data, &single); err == nil && single.Name != "" {
		single.normalize()
		return &single, nil
	}
	var list []Rule
	if err := yaml.Unmarshal(data, &list); err != nil || len(list) == 0 {
		return nil, fmt.Errorf("no rule found in %s", path)
	}
	list[0].normalize()
	return &list[0], nil
}

// ---- fixture runner -------------------------------------------------------

type runResult struct {
	name string
	pass bool
	msg  string
}

func runFixture(fixturePath string) runResult {
	f, err := loadFixture(fixturePath)
	if err != nil {
		return runResult{fixturePath, false, fmt.Sprintf("load fixture: %v", err)}
	}
	rule, err := loadRule(f.Rule)
	if err != nil {
		return runResult{filepath.Base(fixturePath), false, fmt.Sprintf("load rule %q: %v", f.Rule, err)}
	}

	// Expand events (repeat applies to the last event block)
	var events []*plugins.Event
	for i, fe := range f.Events {
		n := 1
		if f.Repeat > 0 && i == len(f.Events)-1 {
			n = f.Repeat
		}
		for j := 0; j < n; j++ {
			events = append(events, buildEvent(fe))
		}
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
		for i, e := range events {
			js := toJSON(e)
			ok, celErr := celCache.Evaluate(&js, rule.Where)
			if celErr != nil {
				return runResult{filepath.Base(fixturePath), false, fmt.Sprintf("CEL error on event %d: %v", i, celErr)}
			}
			if debugCorrel {
				fmt.Fprintf(os.Stderr, "[debug] event %d dataType=%s where=%v json=%s\n", i, e.DataType, ok, js)
			}
			if !ok {
				continue
			}
			if len(rule.Correlation) > 0 && !correlationMatches(rule.Correlation[0], events, js) {
				continue
			}
			fired = true
			firedName = rule.Name
			score := rule.Impact.Confidentiality + rule.Impact.Integrity + rule.Impact.Availability
			switch {
			case score >= 8:
				firedSeverity = "3"
			case score >= 5:
				firedSeverity = "2"
			default:
				firedSeverity = "1"
			}
			break
		}
	}

	name := filepath.Base(fixturePath)
	desc := f.Description
	if desc != "" {
		desc = " — " + desc
	}

	if f.Expect.Alert && !fired {
		return runResult{name, false, "expected alert but none fired" + desc}
	}
	if !f.Expect.Alert && fired {
		return runResult{name, false, fmt.Sprintf("expected no alert but %q fired%s", firedName, desc)}
	}
	if fired {
		if f.Expect.Name != "" && firedName != f.Expect.Name {
			return runResult{name, false, fmt.Sprintf("name mismatch: got %q want %q%s", firedName, f.Expect.Name, desc)}
		}
		if f.Expect.Severity != "" && firedSeverity != f.Expect.Severity {
			return runResult{name, false, fmt.Sprintf("severity mismatch: got %q want %q%s", firedSeverity, f.Expect.Severity, desc)}
		}
	}

	outcome := "no alert ✓"
	if fired {
		outcome = fmt.Sprintf("alert fired, severity=%s ✓", firedSeverity)
	}
	return runResult{name, true, outcome + desc}
}

// ---- main -----------------------------------------------------------------

func main() {
	debug := flag.Bool("debug", false, "print correlation debug info")
	root := flag.String("root", "..", "repository root; rule paths in fixtures are resolved relative to this")
	fixturesDir := flag.String("fixtures", "", "directory of *.test.yml files (default: <root>/rules/testing)")
	singleFixture := flag.String("fixture", "", "run a single fixture file instead of the whole directory")
	flag.Parse()

	repoRoot = *root
	debugCorrel = *debug

	if *fixturesDir == "" {
		*fixturesDir = filepath.Join(*root, "rules/testing")
	}

	var paths []string
	if *singleFixture != "" {
		paths = []string{*singleFixture}
	} else {
		entries, err := os.ReadDir(*fixturesDir)
		if err != nil {
			fmt.Fprintf(os.Stderr, "cannot open fixtures dir %q: %v\n", *fixturesDir, err)
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
		return
	}

	passed, failed := 0, 0
	for _, p := range paths {
		r := runFixture(p)
		if r.pass {
			fmt.Printf("✓ %s — %s\n", r.name, r.msg)
			passed++
		} else {
			fmt.Printf("✗ %s — FAIL: %s\n", r.name, r.msg)
			failed++
		}
	}
	fmt.Printf("\nResults: %d passed, %d failed\n", passed, failed)
	if failed > 0 {
		os.Exit(1)
	}
}
