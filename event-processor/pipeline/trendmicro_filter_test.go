package pipeline

import (
	"path/filepath"
	"testing"

	"github.com/hivearmor/sdk/plugins"
)

// Sample log lines are adapted from the official Trend Micro Deep Security syslog docs:
//   https://help.deepsecurity.trendmicro.com/12_0/aws/Events-Alerts/syslog-parsing.html

func tmExecute(raw string) *plugins.Event {
	filtersDir := filepath.Join("..", "..", "filters", "trendmicro")
	Init(filtersDir)
	return Execute(&plugins.Log{
		Id:         "tm-test-1",
		DataType:   "trendmicro-deep-security",
		DataSource: "ds-manager",
		TenantId:   "default",
		Raw:        raw,
		Timestamp:  "2026-09-12T08:00:00Z",
	})
}

func TestTrendMicroAntiMalwareCEF(t *testing.T) {
	// filePath (single-token here) mid-line, act after it, hash at end.
	raw := `CEF:0|Trend Micro|Deep Security Agent|12.0.0|4000000|Eicar_test_file|6|cn1=1 cn1Label=Host ID dvchost=hostname filePath=C:\\Users\\trend\\eicar.exe act=Delete msg=Realtime TrendMicroDsFileSHA256=275A021BBFB6489E54D471899F7DB9D1663FC695EC2FE2A2C4538AABF651FD0F`
	event := tmExecute(raw)
	if event == nil {
		t.Fatal("expected the anti-malware event to be retained")
	}
	if event.Action != "Delete" {
		t.Fatalf("expected act->action, got %q", event.Action)
	}
	if got := event.Log["name"].GetStringValue(); got != "Eicar_test_file" {
		t.Fatalf("expected CEF header name, got %q", got)
	}
	if got := event.Log["tmFilePath"].GetStringValue(); got != `C:\\Users\\trend\\eicar.exe` {
		t.Fatalf("expected filePath captured up to ' act=', got %q", got)
	}
	if got := event.Log["TrendMicroDsFileSHA256"].GetStringValue(); got == "" {
		t.Fatal("expected SHA256 (single-token, end of line) via kv")
	}
}

func TestTrendMicroLogInspectionSpaceValues(t *testing.T) {
	// cs1 has a spaced value mid-line, followed by fname= — the boundary case.
	raw := `CEF:0|Trend Micro|Deep Security Agent|12.0.0|3002795|Microsoft Windows Events|8|cn1=1 cn1Label=Host ID dvchost=hostname cs1=Multiple Windows Logon Failures cs1Label=LI Description fname=Security src=10.0.0.9 shost=WIN-RM6HM42G65V`
	event := tmExecute(raw)
	if event == nil {
		t.Fatal("expected the log-inspection event to be retained")
	}
	if got := event.Log["tmCs1"].GetStringValue(); got != "Multiple Windows Logon Failures" {
		t.Fatalf("expected cs1 spaced value fully captured, got %q", got)
	}
	if event.Origin == nil || event.Origin.Ip != "10.0.0.9" {
		t.Fatalf("expected src->origin.ip, got %+v", event.Origin)
	}
	if event.Origin.Host != "WIN-RM6HM42G65V" {
		t.Fatalf("expected shost->origin.host, got %q", event.Origin.Host)
	}
}

func TestTrendMicroFirewallCEF(t *testing.T) {
	raw := `CEF:0|Trend Micro|Deep Security Agent|12.0.0|21|Deny Firewall Rule|5|cn1=1 cn1Label=Host ID dvc=10.1.1.10 act=Deny src=192.168.1.105 dst=10.30.128.2 proto=TCP spt=1032 dpt=445 cnt=1`
	event := tmExecute(raw)
	if event == nil {
		t.Fatal("expected the firewall event to be retained")
	}
	if event.Origin == nil || event.Origin.Ip != "192.168.1.105" {
		t.Fatalf("expected src->origin.ip, got %+v", event.Origin)
	}
	if event.Target == nil || event.Target.Ip != "10.30.128.2" {
		t.Fatalf("expected dst->target.ip, got %+v", event.Target)
	}
	if event.Action != "Deny" {
		t.Fatalf("expected act->action, got %q", event.Action)
	}
	if event.Protocol != "TCP" {
		t.Fatalf("expected proto->protocol, got %q", event.Protocol)
	}
}

func TestTrendMicroMsgEndOfLine(t *testing.T) {
	// msg is the LAST field (no trailing key) — verifies end-of-line spaced values.
	raw := `CEF:0|Trend Micro|Deep Security Manager|12.0.0|600|User Signed In|3|src=10.52.116.160 suser=admin target=admin msg=User signed in from a new location`
	event := tmExecute(raw)
	if event == nil {
		t.Fatal("expected the manager system event to be retained")
	}
	if event.Origin == nil || event.Origin.User != "admin" {
		t.Fatalf("expected suser->origin.user, got %+v", event.Origin)
	}
	if got := event.Log["message"].GetStringValue(); got != "User signed in from a new location" {
		t.Fatalf("expected end-of-line msg fully captured into log.message, got %q", got)
	}
}
