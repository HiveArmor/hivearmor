package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPlatformExceptionSQLExcludesTenantRows(t *testing.T) {
	if !strings.Contains(platformActiveExceptionsSQL, "tenant_id IS NULL") {
		t.Fatalf("DET-MSSP-002a: platform exception select must filter tenant_id IS NULL, got %s", platformActiveExceptionsSQL)
	}
	if !strings.Contains(platformActiveExceptionsSQL, "active = true") {
		t.Fatalf("platform exception select must require active = true")
	}
	if strings.Contains(strings.ToLower(platformActiveExceptionsSQL), "tenant_id is not null") {
		t.Fatal("shared exceptions.yaml must not select tenant-owned rows")
	}
	if !strings.Contains(platformExceptionMaxSQL, "tenant_id IS NULL") {
		t.Fatalf("change-detect max must stay platform-only: %s", platformExceptionMaxSQL)
	}
	if !strings.Contains(platformExceptionCountSQL, "tenant_id IS NULL") {
		t.Fatalf("change-detect count must stay platform-only: %s", platformExceptionCountSQL)
	}
}

func TestTenantRulesDirLayout(t *testing.T) {
	got := TenantRulesDir("/workdir", 42)
	want := filepath.Join("/workdir", "tenants", "42", "rules")
	if got != want {
		t.Fatalf("TenantRulesDir = %q, want %q", got, want)
	}
}

func TestWriteExceptionsToIsolatesTenantFromShared(t *testing.T) {
	root := t.TempDir()
	shared := filepath.Join(root, "rules")
	tenant := TenantRulesDir(root, 7)

	platform := []DetectionException{{
		ID:     1,
		RuleID: "platform-rule",
		Active: true,
		Conditions: []DetectionExceptionCond{
			{Field: "host.name", Operator: "is", Value: "shared-host"},
		},
	}}
	tenantOnly := []DetectionException{{
		ID:     99,
		RuleID: "tenant-rule",
		Active: true,
		Conditions: []DetectionExceptionCond{
			{Field: "host.name", Operator: "is", Value: "acme-only"},
		},
	}}

	if err := writeExceptionsTo(shared, platform); err != nil {
		t.Fatalf("write shared: %v", err)
	}
	if err := writeExceptionsTo(tenant, tenantOnly); err != nil {
		t.Fatalf("write tenant: %v", err)
	}

	sharedBody, err := os.ReadFile(filepath.Join(shared, "exceptions", "exceptions.yaml"))
	if err != nil {
		t.Fatalf("read shared: %v", err)
	}
	tenantBody, err := os.ReadFile(filepath.Join(tenant, "exceptions", "exceptions.yaml"))
	if err != nil {
		t.Fatalf("read tenant: %v", err)
	}
	if strings.Contains(string(sharedBody), "acme-only") || strings.Contains(string(sharedBody), "tenant-rule") {
		t.Fatalf("tenant exception bled into shared exceptions.yaml:\n%s", sharedBody)
	}
	if !strings.Contains(string(sharedBody), "shared-host") {
		t.Fatalf("platform exception missing from shared file:\n%s", sharedBody)
	}
	if strings.Contains(string(tenantBody), "shared-host") {
		t.Fatalf("platform exception leaked into tenant workdir:\n%s", tenantBody)
	}
	if !strings.Contains(string(tenantBody), "acme-only") {
		t.Fatalf("tenant exception missing from tenant workdir:\n%s", tenantBody)
	}
}

func TestWriteRulesToTenantWorkdir(t *testing.T) {
	root := t.TempDir()
	tenant := TenantRulesDir(root, 1)
	rules := []Rule{{
		Id:        9201,
		Name:      "ACME-CUSTOM-VPN-GEO-ANOMALY",
		DataTypes: []string{"vpn"},
		Where:     `action == "vpn_login"`,
	}}
	if err := writeRulesTo(tenant, rules); err != nil {
		t.Fatalf("writeRulesTo: %v", err)
	}
	path := filepath.Join(tenant, "hivearmor", "9201.yaml")
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read tenant rule: %v", err)
	}
	if !strings.Contains(string(body), "ACME-CUSTOM-VPN-GEO-ANOMALY") {
		t.Fatalf("tenant rule missing:\n%s", body)
	}
}

func TestTenantSQLTargetsOwnedRowsOnly(t *testing.T) {
	if !strings.Contains(tenantActiveExceptionsSQL, "tenant_id = $1") {
		t.Fatalf("tenant exception query must bind tenant_id: %s", tenantActiveExceptionsSQL)
	}
	if !strings.Contains(tenantRulesSQL, "tenant_id = $1") {
		t.Fatalf("tenant rule query must bind tenant_id: %s", tenantRulesSQL)
	}
}
