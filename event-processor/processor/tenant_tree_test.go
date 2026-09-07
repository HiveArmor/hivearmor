package processor

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/hivearmor/event-processor/config"
	rulesengine "github.com/hivearmor/event-processor/rules"
	"github.com/hivearmor/sdk/plugins"
)

func TestBindTenantLoadsTenantTreeWhenWorkdirExists(t *testing.T) {
	prev := config.WorkDir
	t.Cleanup(func() {
		config.WorkDir = prev
		rulesengine.ResetTenantTreesForTest()
	})

	workDir := t.TempDir()
	config.WorkDir = workDir
	dir := rulesengine.TenantRulesDir(workDir, "1")
	if err := os.MkdirAll(filepath.Join(dir, "hivearmor"), 0o755); err != nil {
		t.Fatal(err)
	}
	ruleYAML := `
- id: 9201
  name: ACME-CUSTOM-VPN-GEO-ANOMALY
  dataTypes: [vpn]
  where: 'action == "vpn_login"'
`
	if err := os.WriteFile(filepath.Join(dir, "hivearmor", "9201.yaml"), []byte(ruleYAML), 0o644); err != nil {
		t.Fatal(err)
	}

	event := &plugins.Event{Id: "evt-bind", TenantId: "1", DataType: "vpn", Action: "vpn_login"}
	if err := BindTenant(event); err != nil {
		t.Fatalf("BindTenant: %v", err)
	}
	rules := rulesengine.GetRulesForEvent(event)
	if len(rules) != 1 || rules[0].Name != "ACME-CUSTOM-VPN-GEO-ANOMALY" {
		t.Fatalf("BindTenant should load tenant tree, got %+v", rules)
	}
}

func TestBindTenantMissingWorkdirLeavesPlatformOnly(t *testing.T) {
	prev := config.WorkDir
	t.Cleanup(func() {
		config.WorkDir = prev
		rulesengine.ResetTenantTreesForTest()
	})
	config.WorkDir = t.TempDir()

	event := &plugins.Event{Id: "evt-missing", TenantId: "8", DataType: "vpn"}
	if err := BindTenant(event); err != nil {
		t.Fatalf("missing workdir must not fail BindTenant: %v", err)
	}
	if got := rulesengine.GetRulesForEvent(event); len(got) != 0 {
		t.Fatalf("missing tenant workdir should stay platform-only, got %d rules", len(got))
	}
}
