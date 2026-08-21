package rules

import (
	"path/filepath"
	"runtime"
	"testing"

	"github.com/hivearmor/sdk/plugins"
	"google.golang.org/protobuf/types/known/structpb"
)

func pilotDir(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("caller")
	}
	return filepath.Join(filepath.Dir(file), "..", "builtin-rules", "pilot")
}

func snapshotRules(t *testing.T) {
	t.Helper()
	mu.Lock()
	oldBy := byType
	oldGraph := graphOffenseList
	oldReport := lastReport
	mu.Unlock()
	t.Cleanup(func() {
		mu.Lock()
		byType = oldBy
		graphOffenseList = oldGraph
		lastReport = oldReport
		mu.Unlock()
	})
}

func TestPilotPack_compilesAndLoadsRequiredRules(t *testing.T) {
	snapshotRules(t)
	report := LoadFromDir(pilotDir(t))
	if !report.PilotPackOK {
		t.Fatalf("pilot pack missing=%v invalid=%v", report.PilotMissing, report.Invalid)
	}
	if report.Loaded < 3 {
		t.Fatalf("expected at least 3 pilot rules, loaded=%d skipped=%d invalid=%v", report.Loaded, report.Skipped, report.Invalid)
	}
}

func TestPilotPack_positiveEncodedPowerShell(t *testing.T) {
	snapshotRules(t)
	LoadFromDir(pilotDir(t))
	event := &plugins.Event{
		Id:         "pos-ps-1",
		DataType:   "powershell",
		DataSource: "agent-1",
		TenantId:   "1",
		Raw:        `powershell.exe -EncodedCommand SQBFAFgA`,
		Origin:     &plugins.Side{Host: "win-1", Process: "powershell.exe", Command: "powershell.exe -EncodedCommand SQBFAFgA"},
	}
	alerts := Evaluate(event)
	if !containsRule(alerts, "PILOT-WIN-PS-ENCODED") {
		t.Fatalf("expected PILOT-WIN-PS-ENCODED, got %#v", alertNames(alerts))
	}
}

func TestPilotPack_negativePlainPowerShell(t *testing.T) {
	snapshotRules(t)
	LoadFromDir(pilotDir(t))
	event := &plugins.Event{
		Id:         "neg-ps-1",
		DataType:   "powershell",
		DataSource: "agent-1",
		TenantId:   "1",
		Raw:        `powershell.exe -NoProfile Get-Process`,
		Origin:     &plugins.Side{Host: "win-1", Process: "powershell.exe", Command: "powershell.exe -NoProfile Get-Process"},
	}
	alerts := Evaluate(event)
	if containsRule(alerts, "PILOT-WIN-PS-ENCODED") {
		t.Fatal("plain PowerShell must not fire encoded-command rule")
	}
}

func TestPilotPack_positiveFailedLogon(t *testing.T) {
	snapshotRules(t)
	LoadFromDir(pilotDir(t))
	event := &plugins.Event{
		Id:         "pos-4625",
		DataType:   "wineventlog",
		DataSource: "agent-1",
		TenantId:   "1",
		Raw:        `{"eventId":4625,"message":"An account failed to log on"}`,
		Log: map[string]*structpb.Value{
			"eventCode": structpb.NewNumberValue(4625),
			"eventId":   structpb.NewStringValue("4625"),
		},
		Origin: &plugins.Side{Host: "win-1", User: "alice"},
	}
	alerts := Evaluate(event)
	if !containsRule(alerts, "PILOT-WIN-FAILED-LOGON") {
		t.Fatalf("expected PILOT-WIN-FAILED-LOGON, got %#v", alertNames(alerts))
	}
}

func TestPilotPack_negativeSuccessfulLogon(t *testing.T) {
	snapshotRules(t)
	LoadFromDir(pilotDir(t))
	event := &plugins.Event{
		Id:         "neg-4624",
		DataType:   "wineventlog",
		DataSource: "agent-1",
		TenantId:   "1",
		Raw:        `{"eventId":4624,"message":"An account was successfully logged on"}`,
		Log: map[string]*structpb.Value{
			"eventCode": structpb.NewNumberValue(4624),
			"eventId":   structpb.NewStringValue("4624"),
		},
	}
	alerts := Evaluate(event)
	if containsRule(alerts, "PILOT-WIN-FAILED-LOGON") {
		t.Fatal("successful logon 4624 must not fire failed-logon rule")
	}
}

func TestPilotPack_positiveLinuxAuthFailure(t *testing.T) {
	snapshotRules(t)
	LoadFromDir(pilotDir(t))
	event := &plugins.Event{
		Id:         "pos-ssh",
		DataType:   "linux",
		DataSource: "agent-1",
		TenantId:   "1",
		Raw:        "sshd[1204]: Failed password for root from 203.0.113.10 port 22 ssh2",
	}
	alerts := Evaluate(event)
	if !containsRule(alerts, "PILOT-LIN-AUTH-FAIL") {
		t.Fatalf("expected PILOT-LIN-AUTH-FAIL, got %#v", alertNames(alerts))
	}
}

func TestPilotPack_negativeLinuxAcceptedPassword(t *testing.T) {
	snapshotRules(t)
	LoadFromDir(pilotDir(t))
	event := &plugins.Event{
		Id:         "neg-ssh",
		DataType:   "linux",
		DataSource: "agent-1",
		TenantId:   "1",
		Raw:        "sshd[1204]: Accepted password for alice from 10.0.0.8 port 22 ssh2",
	}
	alerts := Evaluate(event)
	if containsRule(alerts, "PILOT-LIN-AUTH-FAIL") {
		t.Fatal("successful SSH must not fire auth-failure rule")
	}
}

func TestDeterministicAlertID_isStable(t *testing.T) {
	rule := &Rule{ID: 5101, Name: "PILOT-WIN-PS-ENCODED"}
	a := deterministicAlertID("evt-1", rule)
	b := deterministicAlertID("evt-1", rule)
	if a != b || a == "" {
		t.Fatalf("expected stable alert id, got %q %q", a, b)
	}
	if deterministicAlertID("evt-2", rule) == a {
		t.Fatal("different events must not share alert ids")
	}
}

func containsRule(alerts []*plugins.Alert, name string) bool {
	for _, a := range alerts {
		if a != nil && a.Name == name {
			return true
		}
	}
	return false
}

func alertNames(alerts []*plugins.Alert) []string {
	var names []string
	for _, a := range alerts {
		if a != nil {
			names = append(names, a.Name)
		}
	}
	return names
}
