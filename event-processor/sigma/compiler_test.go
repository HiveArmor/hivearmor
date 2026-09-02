package sigma

import (
	"strings"
	"testing"

	"github.com/hivearmor/sdk/plugins"
	"gopkg.in/yaml.v3"
)

// compileYAML is a helper: unmarshal a Sigma YAML doc and compile it.
func compileYAML(t *testing.T, doc string) (*CompiledRule, error) {
	t.Helper()
	var s SigmaRule
	if err := yaml.Unmarshal([]byte(doc), &s); err != nil {
		t.Fatalf("yaml unmarshal: %v", err)
	}
	return Compile(&s)
}

// assertCELCompiles checks the emitted CEL actually compiles + evaluates against
// the standard event fixture (round-trip: a bad translation fails here).
func assertCELCompiles(t *testing.T, where string) {
	t.Helper()
	cel := plugins.NewCELCache("test.sigma")
	fixture := `{"raw":"x","dataType":"windows","action":"","severity":0,` +
		`"log":{"eventCode":4625},"origin":{"ip":"10.0.0.1","host":"h","user":"u",` +
		`"process":"powershell.exe","command":"whoami","parentProcess":"cmd.exe",` +
		`"file":"c:\\a.exe","registryKey":"HKLM\\Run","service":"svc","task":"t","pipe":"p","port":445},` +
		`"target":{"ip":"8.8.8.8","user":"admin","port":443}}`
	if _, err := cel.Evaluate(&fixture, where); err != nil {
		t.Fatalf("emitted CEL failed to compile/evaluate: %v\nWHERE: %s", err, where)
	}
}

func TestCompile_FieldConstructs(t *testing.T) {
	tests := []struct {
		name    string
		detect  string // the detection: block body (indented under detection:)
		wantSub string // substring the emitted CEL must contain
	}{
		{
			name:    "plain string equality → equalsIgnoreCase",
			detect:  "  sel:\n    User: administrator\n  condition: sel",
			wantSub: `equalsIgnoreCase("origin.user", "administrator")`,
		},
		{
			name:    "int equality → equals",
			detect:  "  sel:\n    EventID: 4625\n  condition: sel",
			wantSub: `equals("log.eventCode", 4625)`,
		},
		{
			name:    "list value → OR of equalsIgnoreCase",
			detect:  "  sel:\n    User:\n      - alice\n      - bob\n  condition: sel",
			wantSub: `equalsIgnoreCase("origin.user", "alice") || equalsIgnoreCase("origin.user", "bob")`,
		},
		{
			name:    "contains → case-insensitive regex",
			detect:  "  sel:\n    CommandLine|contains: whoami\n  condition: sel",
			wantSub: `regexMatch("origin.command", "(?i)whoami")`,
		},
		{
			name:    "endswith → anchored regex",
			detect:  "  sel:\n    Image|endswith: '\\net.exe'\n  condition: sel",
			wantSub: `$"`,
		},
		{
			name:    "startswith → anchored regex",
			detect:  "  sel:\n    DestinationIp|startswith: '10.'\n  condition: sel",
			wantSub: `regexMatch("target.ip", "(?i)^10`,
		},
		{
			name:    "contains|all → AND of regexes",
			detect:  "  sel:\n    CommandLine|contains|all:\n      - foo\n      - bar\n  condition: sel",
			wantSub: ` && `,
		},
		{
			name:    "re modifier → regexMatch verbatim",
			detect:  "  sel:\n    CommandLine|re: 'a.*b'\n  condition: sel",
			wantSub: `regexMatch("origin.command", "a.*b")`,
		},
		{
			name:    "cidr modifier → inCIDR",
			detect:  "  sel:\n    ip|cidr: 10.0.0.0/8\n  condition: sel",
			wantSub: `inCIDR("origin.ip", "10.0.0.0/8")`,
		},
		{
			name:    "gte modifier → greaterOrEqual",
			detect:  "  sel:\n    bytes|gte: 1000\n  condition: sel",
			wantSub: `greaterOrEqual("raw", 1000)`,
		},
		{
			name:    "null value → not exists",
			detect:  "  sel:\n    User: null\n  condition: sel",
			wantSub: `!exists("origin.user")`,
		},
		{
			name:    "wildcard value → regex",
			detect:  "  sel:\n    Image: '*\\evil.exe'\n  condition: sel",
			wantSub: `regexMatch("origin.process",`,
		},
		{
			name:    "unmapped field → raw regex fallback",
			detect:  "  sel:\n    WeirdField|contains: needle\n  condition: sel",
			wantSub: `regexMatch("raw", "(?i)needle")`,
		},
		{
			name:    "two fields in a selection → AND",
			detect:  "  sel:\n    Image|endswith: '\\net.exe'\n    CommandLine|contains: group\n  condition: sel",
			wantSub: ` && `,
		},
	}

	base := "title: T\nid: 11111111-1111-1111-1111-111111111111\nlogsource:\n  product: windows\n  category: process_creation\nlevel: medium\ndetection:\n"

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, err := compileYAML(t, base+tt.detect)
			if err != nil {
				t.Fatalf("compile error: %v", err)
			}
			if !strings.Contains(c.Where, tt.wantSub) {
				t.Fatalf("emitted CEL missing %q\ngot: %s", tt.wantSub, c.Where)
			}
			assertCELCompiles(t, c.Where)
		})
	}
}

func TestCompile_ConditionGrammar(t *testing.T) {
	base := "title: T\nid: 22222222-2222-2222-2222-222222222222\nlogsource:\n  product: windows\n  category: process_creation\nlevel: medium\ndetection:\n"
	tests := []struct {
		name   string
		detect string
		want   string
	}{
		{
			"or of two selections",
			"  a:\n    User: x\n  b:\n    User: y\n  condition: a or b",
			"||",
		},
		{
			"and not filter",
			"  sel:\n    User: x\n  filter:\n    User: svc\n  condition: sel and not filter",
			"&& !(",
		},
		{
			"1 of selection glob",
			"  sel_a:\n    User: x\n  sel_b:\n    User: y\n  condition: 1 of sel_*",
			"||",
		},
		{
			"all of them",
			"  a:\n    User: x\n  b:\n    User: y\n  condition: all of them",
			"&&",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, err := compileYAML(t, base+tt.detect)
			if err != nil {
				t.Fatalf("compile error: %v", err)
			}
			if !strings.Contains(c.Where, tt.want) {
				t.Fatalf("condition CEL missing %q\ngot: %s", tt.want, c.Where)
			}
			assertCELCompiles(t, c.Where)
		})
	}
}

func TestCompile_Metadata(t *testing.T) {
	doc := `title: Permission Group Discovery
id: d8e9f0a1-b2c3-4567-defa-678901234558
logsource:
  product: windows
  category: process_creation
level: high
tags:
  - attack.discovery
  - attack.T1069.002
impact:
  confidentiality: medium
  integrity: low
  availability: low
deduplicateBy:
  - ComputerName
groupBy:
  - ComputerName
mitre:
  tactic: discovery
  technique: T1069.002
detection:
  sel:
    Image|endswith: '\dsquery.exe'
  condition: sel`
	c, err := compileYAML(t, doc)
	if err != nil {
		t.Fatalf("compile error: %v", err)
	}
	if c.Severity != 4 {
		t.Errorf("severity: want 4 (high), got %d", c.Severity)
	}
	if !strings.HasPrefix(c.Name, "SIGMA-d8e9f0a1") {
		t.Errorf("name should be SIGMA-prefixed, got %q", c.Name)
	}
	if !contains(c.MitreTactics, "discovery") {
		t.Errorf("tactics should contain discovery, got %v", c.MitreTactics)
	}
	if !contains(c.MitreAttacks, "T1069.002") {
		t.Errorf("attacks should contain T1069.002, got %v", c.MitreAttacks)
	}
	if c.Impact != [3]uint32{2, 1, 1} {
		t.Errorf("impact: want [2 1 1], got %v", c.Impact)
	}
	if len(c.DataTypes) == 0 || c.DataTypes[0] != "windows" {
		t.Errorf("dataTypes: want windows first, got %v", c.DataTypes)
	}
	if len(c.DeduplicateBy) != 1 || c.DeduplicateBy[0] != "origin.host" {
		t.Errorf("deduplicateBy should map ComputerName→origin.host, got %v", c.DeduplicateBy)
	}
}

func TestCompile_FailSafe(t *testing.T) {
	base := "title: T\nid: 33333333-3333-3333-3333-333333333333\nlogsource:\n  product: windows\n  category: process_creation\nlevel: medium\ndetection:\n"
	fail := []struct {
		name   string
		detect string
	}{
		{"base64 modifier unsupported", "  sel:\n    CommandLine|base64: whoami\n  condition: sel"},
		{"windash modifier unsupported", "  sel:\n    CommandLine|windash: /x\n  condition: sel"},
		{"unknown selection ref", "  sel:\n    User: x\n  condition: nope"},
		{"aggregation condition unsupported", "  sel:\n    User: x\n  condition: sel | count() > 5"},
		{"missing condition", "  sel:\n    User: x"},
	}
	for _, tt := range fail {
		t.Run(tt.name, func(t *testing.T) {
			_, err := compileYAML(t, base+tt.detect)
			if err == nil {
				t.Fatalf("expected error, got nil")
			}
		})
	}

	// Unmapped logsource → unsupported (no dataType).
	_, err := compileYAML(t, "title: T\nid: x\nlogsource:\n  product: mainframe\nlevel: low\ndetection:\n  sel:\n    User: x\n  condition: sel")
	if err == nil {
		t.Fatalf("expected unsupported error for unmapped logsource")
	}
}

func contains(ss []string, s string) bool {
	for _, x := range ss {
		if x == s {
			return true
		}
	}
	return false
}
