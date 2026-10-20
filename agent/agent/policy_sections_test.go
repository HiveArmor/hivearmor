package agent

import (
	"encoding/json"
	"strings"
	"testing"
)

// --- Event section ---------------------------------------------------------

func TestParseEventSection_FullShape(t *testing.T) {
	raw := `{
		"schema_version": 1,
		"event": {
			"fileLog": {"iis": true, "dhcp": false},
			"eventLogs": [
				{"type": "Security", "include": "ALL", "exclude": "NONE"},
				{"type": "Other", "channel": "Microsoft-Windows-Sysmon/Operational", "include": "4624,4625", "exclude": [1102, "4634"]}
			]
		}
	}`
	doc, err := ParseAgentPolicyDocument(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if doc.Event == nil {
		t.Fatal("event section nil")
	}
	if !doc.Event.FileLog["iis"] || doc.Event.FileLog["dhcp"] {
		t.Fatalf("fileLog: %+v", doc.Event.FileLog)
	}
	if len(doc.Event.EventLogs) != 2 {
		t.Fatalf("eventLogs: %d", len(doc.Event.EventLogs))
	}
	sec := doc.Event.EventLogs[0]
	if sec.Type != "Security" || len(sec.Include) != 1 || sec.Include[0] != "ALL" {
		t.Fatalf("security row: %+v", sec)
	}
	sys := doc.Event.EventLogs[1]
	if sys.Channel != "Microsoft-Windows-Sysmon/Operational" {
		t.Fatalf("channel: %q", sys.Channel)
	}
	if len(sys.Include) != 2 || sys.Include[0] != "4624" || sys.Include[1] != "4625" {
		t.Fatalf("include tokens: %+v", sys.Include)
	}
	// mixed int/string array normalises to strings
	if len(sys.Exclude) != 2 || sys.Exclude[0] != "1102" || sys.Exclude[1] != "4634" {
		t.Fatalf("exclude tokens: %+v", sys.Exclude)
	}
}

func TestParseEventSection_DropsRowMissingType(t *testing.T) {
	raw := `{"schema_version":1,"event":{"eventLogs":[{"channel":"X"},{"type":"System"}]}}`
	doc, err := ParseAgentPolicyDocument(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(doc.Event.EventLogs) != 1 || doc.Event.EventLogs[0].Type != "System" {
		t.Fatalf("expected only the typed row kept: %+v", doc.Event.EventLogs)
	}
}

// --- Inclusion list flexible decoding --------------------------------------

func TestSectionInclusionList_Shapes(t *testing.T) {
	cases := []struct {
		in   string
		want []string
	}{
		{`"ALL"`, []string{"ALL"}},
		{`"none"`, []string{"NONE"}},
		{`"4624, 4625 ,4634"`, []string{"4624", "4625", "4634"}},
		{`[4624, 4625]`, []string{"4624", "4625"}},
		{`["a","b"]`, []string{"a", "b"}},
		{`[4624, "4625", 4634]`, []string{"4624", "4625", "4634"}},
		{`""`, nil},
		{`null`, nil},
		{`{"unexpected":true}`, nil}, // ignore-unknown: object shape → empty, no error
		{`true`, nil},                // bool shape → empty, no error
	}
	for _, c := range cases {
		var l SectionInclusionList
		if err := json.Unmarshal([]byte(c.in), &l); err != nil {
			t.Fatalf("%s: unexpected error %v", c.in, err)
		}
		if len(l) != len(c.want) {
			t.Fatalf("%s: got %v want %v", c.in, []string(l), c.want)
		}
		for i := range c.want {
			if l[i] != c.want[i] {
				t.Fatalf("%s: tok[%d]=%q want %q", c.in, i, l[i], c.want[i])
			}
		}
	}
}

// --- User Log section ------------------------------------------------------

func TestParseUserLogSection(t *testing.T) {
	raw := `{
		"schema_version": 1,
		"userLog": [
			{"fullFileName": "/var/log/app.log", "logPrefix": "APP", "multiline": {"start":"^\\[", "end":"$", "maxLines": 50}},
			{"logPrefix": "NOFILE"},
			{"fullFileName": "   "}
		]
	}`
	doc, err := ParseAgentPolicyDocument(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	// Two entries have no usable fullFileName → dropped; one kept.
	if len(doc.UserLog) != 1 {
		t.Fatalf("expected 1 userLog, got %d: %+v", len(doc.UserLog), doc.UserLog)
	}
	u := doc.UserLog[0]
	if u.FullFileName != "/var/log/app.log" || u.LogPrefix != "APP" {
		t.Fatalf("userLog: %+v", u)
	}
	if u.Multiline == nil || u.Multiline.MaxLines != 50 {
		t.Fatalf("multiline: %+v", u.Multiline)
	}
}

// --- Change section --------------------------------------------------------

func TestParseChangeSection(t *testing.T) {
	raw := `{
		"schema_version": 1,
		"change": {
			"registry": [
				{"rootKey": "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run", "excludeSubkeys": ["Temp", "  "]},
				{"excludeSubkeys": ["x"]}
			],
			"installedSoftware": true
		}
	}`
	doc, err := ParseAgentPolicyDocument(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if doc.Change == nil || !doc.Change.InstalledSoftware {
		t.Fatalf("change: %+v", doc.Change)
	}
	// Row missing rootKey dropped; empty excludeSubkey trimmed out.
	if len(doc.Change.Registry) != 1 {
		t.Fatalf("expected 1 registry row, got %d", len(doc.Change.Registry))
	}
	if len(doc.Change.Registry[0].ExcludeSubkeys) != 1 || doc.Change.Registry[0].ExcludeSubkeys[0] != "Temp" {
		t.Fatalf("exclude: %+v", doc.Change.Registry[0].ExcludeSubkeys)
	}
	keys := RegistryRootKeysFromChange(doc.Change)
	if len(keys) != 1 || !strings.Contains(keys[0], "CurrentVersion") {
		t.Fatalf("root keys: %+v", keys)
	}
}

// --- Script section (parsed only; content never executed/logged) ----------

func TestParseScriptSection(t *testing.T) {
	raw := `{
		"schema_version": 1,
		"script": {
			"wmi": ["SELECT * FROM Win32_Process", "  "],
			"powershell": ["Get-Service", ""]
		}
	}`
	doc, err := ParseAgentPolicyDocument(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if doc.Script == nil || len(doc.Script.WMI) != 1 || len(doc.Script.PowerShell) != 1 {
		t.Fatalf("script: %+v", doc.Script)
	}
	// Capability must honestly report script is NOT enforced.
	if SectionCapabilities()["script"] != EnforcementParsedOnly {
		t.Fatalf("script must be parsed-only, got %q", SectionCapabilities()["script"])
	}
}

// --- Certificate section ---------------------------------------------------

func TestParseCertificateSection(t *testing.T) {
	raw := `{
		"schema_version": 1,
		"certificate": [
			{"store": "MY", "add": true, "delete": true, "expiring": true, "expired": false},
			{"add": true}
		]
	}`
	doc, err := ParseAgentPolicyDocument(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	// Second entry has no store → dropped.
	if len(doc.Certificate) != 1 || doc.Certificate[0].Store != "MY" {
		t.Fatalf("certificate: %+v", doc.Certificate)
	}
	if !doc.Certificate[0].Add || !doc.Certificate[0].Expiring || doc.Certificate[0].Expired {
		t.Fatalf("cert flags: %+v", doc.Certificate[0])
	}
}

// --- IGNORE-UNKNOWN-FIELD SAFETY (the required safety case) ----------------

// A document carrying sections an older agent does not know (scans, osquery, monitor,
// ueba) plus unknown sub-fields inside KNOWN sections must parse without error and must
// not crash apply. This is the PT-0 wire-contract rule: unknown shapes are ignored.
func TestParseAgentPolicyDocument_IgnoresUnknownSectionsAndFields(t *testing.T) {
	raw := `{
		"schema_version": 1,
		"scans": {"cis": {"enabled": true, "profile": "CIS_Windows_2022_L1"}, "vuln": {"mode": "scheduled"}},
		"osquery": {"queries": ["cis_checks"]},
		"monitor": {"items": [{"metric": "cpu", "intervalSec": 300}]},
		"ueba": {"enabled": true},
		"event": {
			"eventLogs": [{"type": "Security", "futureField": "whatever", "include": "ALL"}],
			"brandNewKey": {"nested": [1,2,3]}
		},
		"userLog": [{"fullFileName": "/x", "unknownField": 42}],
		"script": {"wmi": ["Q"], "newExecMode": "sandboxed"},
		"totallyUnknownSection": {"a": 1}
	}`
	doc, err := ParseAgentPolicyDocument(raw)
	if err != nil {
		t.Fatalf("unknown sections/fields must not error: %v", err)
	}
	// Known sections still parsed correctly despite unknown siblings.
	if doc.Event == nil || len(doc.Event.EventLogs) != 1 || doc.Event.EventLogs[0].Type != "Security" {
		t.Fatalf("known event section lost: %+v", doc.Event)
	}
	if len(doc.UserLog) != 1 || doc.UserLog[0].FullFileName != "/x" {
		t.Fatalf("known userLog lost: %+v", doc.UserLog)
	}
	if doc.Script == nil || len(doc.Script.WMI) != 1 {
		t.Fatalf("known script lost: %+v", doc.Script)
	}
	// And apply must not crash on this document.
	resetSectionAppliers()
	if err := applyParsedPolicy(doc); err != nil {
		t.Fatalf("apply of unknown-laden doc must not fail: %v", err)
	}
}

func TestParseAgentPolicyDocument_EmptyStillValid(t *testing.T) {
	doc, err := ParseAgentPolicyDocument(`{"schema_version":1}`)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if doc.Event != nil || doc.UserLog != nil || doc.Change != nil || doc.Script != nil || doc.Certificate != nil {
		t.Fatal("empty doc must leave PT-4 sections nil")
	}
}

// --- Capability advertisement ----------------------------------------------

func TestCapabilityAdvertisement_HonestAndDeterministic(t *testing.T) {
	adv := CapabilityAdvertisement()
	// Deterministic, sorted, data-free.
	for _, want := range []string{
		"certificate=parsed-only",
		"change=partial",
		"event=partial",
		"script=parsed-only",
		"userLog=enforced",
	} {
		if !strings.Contains(adv, want) {
			t.Fatalf("advertisement %q missing %q", adv, want)
		}
	}
	// Must never claim script/certificate as enforced.
	if strings.Contains(adv, "script=enforced") || strings.Contains(adv, "certificate=enforced") {
		t.Fatalf("dishonest capability claim: %q", adv)
	}
	// No path/host separators that would imply customer data leaked in.
	if strings.ContainsAny(adv, "/\\ ") {
		t.Fatalf("advertisement must be compact and data-free: %q", adv)
	}
	// Idempotent / stable ordering.
	if CapabilityAdvertisement() != adv {
		t.Fatal("advertisement must be deterministic")
	}
}

// --- Apply wiring: appliers invoked with normalized data -------------------

func TestApplySections_InvokesAppliers(t *testing.T) {
	resetSectionAppliers()

	var gotTails []UserLogTail
	var gotRootKeys []string
	SetUserLogPolicyApplier(func(tails []UserLogTail) error {
		gotTails = tails
		return nil
	})
	SetChangeRegistryPolicyApplier(func(rootKeys []string) error {
		gotRootKeys = rootKeys
		return nil
	})

	doc, err := ParseAgentPolicyDocument(`{
		"schema_version": 1,
		"userLog": [{"fullFileName": "/var/log/a.log", "logPrefix": "A"}],
		"change": {"registry": [{"rootKey": "HKLM\\SOFTWARE\\X"}]}
	}`)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if err := applyParsedPolicy(doc); err != nil {
		t.Fatalf("apply: %v", err)
	}
	if len(gotTails) != 1 || gotTails[0].FullFileName != "/var/log/a.log" {
		t.Fatalf("userLog applier not invoked correctly: %+v", gotTails)
	}
	if len(gotRootKeys) != 1 || !strings.Contains(gotRootKeys[0], "SOFTWARE") {
		t.Fatalf("change.registry applier not invoked correctly: %+v", gotRootKeys)
	}
	resetSectionAppliers()
}

func TestApplySections_StashesWhenNoApplier(t *testing.T) {
	resetSectionAppliers()
	// Clear any stashed state from prior tests.
	pendingUserLogMu.Lock()
	pendingUserLog = nil
	pendingUserLogSet = false
	pendingUserLogMu.Unlock()

	doc, _ := ParseAgentPolicyDocument(`{"schema_version":1,"userLog":[{"fullFileName":"/var/log/b.log"}]}`)
	if err := applyParsedPolicy(doc); err != nil {
		t.Fatalf("apply: %v", err)
	}
	tails, ok := PeekPendingUserLogPolicy()
	if !ok || len(tails) != 1 || tails[0].FullFileName != "/var/log/b.log" {
		t.Fatalf("userLog should be stashed when no applier: ok=%v %+v", ok, tails)
	}
}

// resetSectionAppliers clears PT-4 appliers so tests do not leak state into each other.
func resetSectionAppliers() {
	SetUserLogPolicyApplier(nil)
	SetChangeRegistryPolicyApplier(nil)
	appliedPolicyMu.Lock()
	appliedPolicy = nil
	appliedPolicyMu.Unlock()
}
