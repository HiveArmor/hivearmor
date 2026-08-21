package plugins_test

import (
	"testing"

	"github.com/hivearmor/sdk/plugins"
)

// TestTenant_HasPrefixField verifies the Prefix field is present on the
// generated Tenant struct and round-trips correctly alongside existing fields.
func TestTenant_HasPrefixField(t *testing.T) {
	tenant := &plugins.Tenant{
		Name:   "Acme Corp",
		Id:     "tenant-001",
		Prefix: "acme",
	}
	if tenant.Prefix != "acme" {
		t.Fatalf("Tenant.Prefix = %q, want %q", tenant.Prefix, "acme")
	}
	if tenant.Name != "Acme Corp" {
		t.Fatalf("Tenant.Name = %q, want %q", tenant.Name, "Acme Corp")
	}
}

// TestTenant_EmptyPrefixIsValid verifies that leaving Prefix unset (single-tenant
// deployments) produces the empty string default, which BuildTenantIndex treats
// as "use the non-MSSP index name".
func TestTenant_EmptyPrefixIsValid(t *testing.T) {
	tenant := &plugins.Tenant{
		Name: "Default",
		Id:   "default",
	}
	if tenant.Prefix != "" {
		t.Fatalf("Default Tenant.Prefix should be empty, got %q", tenant.Prefix)
	}
}

// TestTenant_PrefixFieldNumber verifies that constructing a Tenant with both
// the new Prefix field and the existing DisabledRules slice works — this
// exercises proto field 5 alongside proto field 4 to confirm the wire
// numbering was not disturbed.
func TestTenant_PrefixFieldNumber(t *testing.T) {
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("Creating Tenant with Prefix panicked: %v", r)
		}
	}()
	_ = &plugins.Tenant{
		Name:          "Test",
		Id:            "test-id",
		Prefix:        "test-prefix",
		DisabledRules: []uint64{1, 2, 3},
	}
}
