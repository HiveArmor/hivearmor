package pipeline

import (
	"path/filepath"
	"testing"

	"github.com/hivearmor/sdk/plugins"
)

// SonicWall emits a native key=value syslog and can also export CEF. The rebuilt parser
// handles both and must populate the fields the shipped SonicWall rules read as log.<x>:
// message, eventName, ipscat, category, fw_action, severity, etc., plus origin/target IPs.

func swExecute(raw string) *plugins.Event {
	Init(filepath.Join("..", "..", "filters", "sonicwall"))
	return Execute(&plugins.Log{
		Id: "sw", DataType: "firewall-sonicwall", DataSource: "x",
		TenantId: "default", Raw: raw, Timestamp: "2026-09-13T00:00:00Z",
	})
}

func TestSonicWallNativeKV(t *testing.T) {
	raw := `<129>id=firewall sn=0017C5000000 time="2026-09-13 12:30:09" fw=10.0.0.1 pri=1 c=1024 m=537 msg="IPS Detection Alert" src=10.10.1.5:1234:X0 dst=8.8.8.8:53:X1 proto=udp/dns fw_action="drop" ipscat="Suspected Botnet"`
	event := swExecute(raw)
	if event == nil {
		t.Fatal("expected the SonicWall KV event to be retained")
	}
	// Spaced quoted values must be fully captured (kv alone would truncate at the space).
	if got := event.Log["message"].GetStringValue(); got != "IPS Detection Alert" {
		t.Fatalf("expected msg quoted value in log.message, got %q", got)
	}
	if got := event.Log["ipscat"].GetStringValue(); got != "Suspected Botnet" {
		t.Fatalf("expected ipscat quoted value, got %q", got)
	}
	if got := event.Log["fw_action"].GetStringValue(); got != "drop" {
		t.Fatalf("expected fw_action=drop, got %q", got)
	}
	// Compound src/dst -> leading IP only.
	if event.Origin == nil || event.Origin.Ip != "10.10.1.5" {
		t.Fatalf("expected origin.ip 10.10.1.5 (leading IP of compound src), got %+v", event.Origin)
	}
	if event.Target == nil || event.Target.Ip != "8.8.8.8" {
		t.Fatalf("expected target.ip 8.8.8.8, got %+v", event.Target)
	}
	if got := event.Log["fw_action"].GetStringValue(); got != "drop" {
		t.Fatalf("expected log.fw_action=drop (rule contract), got %q", got)
	}
	// A single-token kv field is still available.
	if got := event.Log["m"].GetStringValue(); got != "537" {
		t.Fatalf("expected message id m=537 via kv, got %q", got)
	}
}

func TestSonicWallCEF(t *testing.T) {
	raw := `<134>2026-09-13 12:30:09 firewall CEF:0|SonicWall|NSA|6.5.4|537|IPS Detection Alert|5|src=10.10.1.5 dst=8.8.8.8 proto=udp fw_action=drop ipscat=Botnet`
	event := swExecute(raw)
	if event == nil {
		t.Fatal("expected the SonicWall CEF event to be retained")
	}
	if got := event.Log["eventName"].GetStringValue(); got != "IPS Detection Alert" {
		t.Fatalf("expected CEF header eventName, got %q", got)
	}
	if got := event.Log["dvcVendor"].GetStringValue(); got != "SonicWall" {
		t.Fatalf("expected CEF vendor SonicWall, got %q", got)
	}
	if event.Origin == nil || event.Origin.Ip != "10.10.1.5" {
		t.Fatalf("expected origin.ip from CEF extension, got %+v", event.Origin)
	}
	if event.Target == nil || event.Target.Ip != "8.8.8.8" {
		t.Fatalf("expected target.ip from CEF extension, got %+v", event.Target)
	}
	if got := event.Log["ipscat"].GetStringValue(); got != "Botnet" {
		t.Fatalf("expected ipscat from CEF extension, got %q", got)
	}
}
