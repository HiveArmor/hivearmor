package pipeline

import (
	"path/filepath"
	"testing"

	"github.com/hivearmor/sdk/plugins"
)

func TestPowerShellFilterNormalizesRawETWScriptBlock(t *testing.T) {
	filtersDir := filepath.Join("..", "..", "filters", "endpoint")
	Init(filtersDir)

	raw := `{"eventType":"POWERSHELL_SCRIPTBLOCK","dataType":"powershell","@timestamp":"2026-08-13T08:00:00Z","pid":7124,"scriptBlock":"powershell.exe -EncodedCommand SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAKQA=","scriptPath":"","hostname":"E2E-WKS-041","userName":"analyst-e2e","sourceIp":"198.51.100.41","dataSource":"E2E-WKS-041 (agent-41)","severity":"HIGH"}`
	event := Execute(&plugins.Log{
		Id:         "raw-e2e-powershell-001",
		DataType:   "powershell",
		DataSource: "E2E-WKS-041 (agent-41)",
		TenantId:   "default",
		Raw:        raw,
		Timestamp:  "2026-08-13T08:00:00Z",
	})

	if event == nil {
		t.Fatal("expected the raw PowerShell event to be retained")
	}
	if event.Raw != raw {
		t.Fatal("expected the original raw payload to be preserved")
	}
	if event.Origin == nil {
		t.Fatal("expected normalized origin context")
	}
	if event.Origin.Host != "E2E-WKS-041" {
		t.Fatalf("expected normalized host, got %q", event.Origin.Host)
	}
	if event.Origin.Process != "powershell.exe" {
		t.Fatalf("expected normalized process, got %q", event.Origin.Process)
	}
	if event.Origin.User != "analyst-e2e" {
		t.Fatalf("expected normalized user, got %q", event.Origin.User)
	}
	if event.Origin.Ip != "198.51.100.41" {
		t.Fatalf("expected normalized source IP, got %q", event.Origin.Ip)
	}
	if event.Action != "POWERSHELL_SCRIPTBLOCK" {
		t.Fatalf("expected normalized action, got %q", event.Action)
	}
	if event.Severity != "HIGH" {
		t.Fatalf("expected normalized severity, got %q", event.Severity)
	}
	if got := event.Log["scriptBlock"].GetStringValue(); got == "" {
		t.Fatal("expected log.scriptBlock to be available to detection rules")
	}
	if got := event.Log["pid"].GetNumberValue(); got != 7124 {
		t.Fatalf("expected the collector PID to be retained, got %v", got)
	}
}
