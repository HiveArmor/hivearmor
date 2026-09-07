package rules

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/hivearmor/sdk/plugins"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTenantRulesDir(t *testing.T) {
	assert.Equal(t, filepath.Join("/workdir", "tenants", "7", "rules"), TenantRulesDir("/workdir", "7"))
	assert.Empty(t, TenantRulesDir("/workdir", ""))
	assert.Empty(t, TenantRulesDir("/workdir", "  "))
}

func writeTenantTree(t *testing.T, workDir, tenantID string) {
	t.Helper()
	dir := TenantRulesDir(workDir, tenantID)
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "hivearmor"), 0o755))
	require.NoError(t, os.MkdirAll(filepath.Join(dir, "exceptions"), 0o755))
	ruleYAML := `
- id: 9201
  name: ACME-CUSTOM-VPN-GEO-ANOMALY
  dataTypes: [vpn]
  where: 'action == "vpn_login"'
`
	require.NoError(t, os.WriteFile(filepath.Join(dir, "hivearmor", "9201.yaml"), []byte(ruleYAML), 0o644))
	excYAML := `
exceptions:
  - id: 99
    ruleId: "7"
    active: true
    conditions:
      - field: host.name
        operator: is
        value: acme-only
`
	require.NoError(t, os.WriteFile(filepath.Join(dir, "exceptions", "exceptions.yaml"), []byte(excYAML), 0o644))
}

func TestBindTenantTreeMissingWorkdirIsNoop(t *testing.T) {
	t.Cleanup(ResetTenantTreesForTest)
	require.NoError(t, BindTenantTree(t.TempDir(), "99"))
	assert.Nil(t, lookupTenantTree("99"))
}

func TestBindTenantTreeLoadsOverlayAndKeepsPlatformIsolated(t *testing.T) {
	t.Cleanup(ResetTenantTreesForTest)
	workDir := t.TempDir()
	writeTenantTree(t, workDir, "1")

	require.NoError(t, BindTenantTree(workDir, "1"))

	acme := &plugins.Event{DataType: "vpn", TenantId: "1", Action: "vpn_login"}
	rules := GetRulesForEvent(acme)
	require.Len(t, rules, 1)
	assert.Equal(t, "ACME-CUSTOM-VPN-GEO-ANOMALY", rules[0].Name)

	other := &plugins.Event{DataType: "vpn", TenantId: "2", Action: "vpn_login"}
	assert.Empty(t, GetRulesForEvent(other), "tenant 1 overlay must not apply to tenant 2")

	unscoped := &plugins.Event{DataType: "vpn", Action: "vpn_login"}
	assert.Empty(t, GetRulesForEvent(unscoped), "tenant overlay must not apply to unscoped events")
}

func TestTenantExceptionDoesNotBleedAcrossTenants(t *testing.T) {
	t.Cleanup(ResetTenantTreesForTest)
	t.Cleanup(func() { setExceptions(nil) })
	workDir := t.TempDir()
	writeTenantTree(t, workDir, "1")
	require.NoError(t, BindTenantTree(workDir, "1"))

	acme := &plugins.Event{
		TenantId: "1",
		Origin:   &plugins.Side{Host: "acme-only"},
	}
	assert.True(t, ExceptionMatches("7", acme), "Acme exception must apply to Acme events")

	cwm := &plugins.Event{
		TenantId: "2",
		Origin:   &plugins.Side{Host: "acme-only"},
	}
	assert.False(t, ExceptionMatches("7", cwm), "Acme exception must not suppress CWM")

	platform := &plugins.Event{
		Origin: &plugins.Side{Host: "acme-only"},
	}
	assert.False(t, ExceptionMatches("7", platform), "tenant exception must not hit unscoped events")
}

func TestEvaluateUsesTenantOverlayWithoutChangingPlatformStore(t *testing.T) {
	t.Cleanup(ResetTenantTreesForTest)
	workDir := t.TempDir()
	writeTenantTree(t, workDir, "1")
	require.NoError(t, BindTenantTree(workDir, "1"))

	before := AllRules()
	acme := &plugins.Event{
		Id:       "evt-acme",
		DataType: "vpn",
		TenantId: "1",
		Action:   "vpn_login",
	}
	alerts := Evaluate(acme)
	require.Len(t, alerts, 1)
	assert.Equal(t, "ACME-CUSTOM-VPN-GEO-ANOMALY", alerts[0].Name)

	cwm := &plugins.Event{
		Id:       "evt-cwm",
		DataType: "vpn",
		TenantId: "2",
		Action:   "vpn_login",
	}
	assert.Empty(t, Evaluate(cwm))
	assert.Len(t, AllRules(), len(before), "tenant overlay must not mutate the shared rule store")
}
