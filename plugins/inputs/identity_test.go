package main

import (
	"errors"
	"testing"

	"github.com/threatwinds/go-sdk/plugins"
)

func TestBindLogIdentityDerivesTenantAndRejectsConflict(t *testing.T) {
	identity := &ConnectorIdentity{Type: "agent", ID: 7, ConnectorID: "agent-uuid", TenantID: 42}
	log := &plugins.Log{DataType: "windows"}

	if err := bindLogIdentity(log, identity); err != nil {
		t.Fatal(err)
	}
	if log.TenantId != "42" {
		t.Fatalf("tenant = %q, want 42", log.TenantId)
	}
	if log.DataSource != "agent-uuid" {
		t.Fatalf("dataSource = %q, want agent uuid", log.DataSource)
	}

	conflict := &plugins.Log{TenantId: "99", DataType: "windows", DataSource: "kept"}
	if err := bindLogIdentity(conflict, identity); !errors.Is(err, errTenantConflict) {
		t.Fatalf("got %v, want tenant conflict", err)
	}
	if conflict.TenantId != "99" {
		t.Fatal("conflicting producer tenant must not be overwritten")
	}
}

func TestBindLogIdentityFailsClosedWithoutIdentityOrTenant(t *testing.T) {
	log := &plugins.Log{DataType: "windows", DataSource: "src"}
	if err := bindLogIdentity(log, nil); !errors.Is(err, errMissingIdentity) {
		t.Fatalf("got %v, want missing identity", err)
	}
	if log.TenantId != "" {
		t.Fatal("missing identity must not assign a tenant")
	}

	unbound := &ConnectorIdentity{Type: "collector", ID: 1, ConnectorID: "collector:1", TenantID: 0}
	if err := bindLogIdentity(log, unbound); !errors.Is(err, errTenantUnbound) {
		t.Fatalf("got %v, want unbound tenant", err)
	}
}

func TestCachedIdentityDoesNotStorePresentedSecret(t *testing.T) {
	secret := "ha_agent_super-secret"
	cached := cachedIdentity{
		identity: ConnectorIdentity{Type: "agent", ID: 1, ConnectorID: "uuid", TenantID: 8},
		digest:   presentedKeyDigest(secret),
	}
	if cached.identity.ConnectorID == secret {
		t.Fatal("identity stored the presented secret")
	}
	encoded := string(cached.digest[:])
	if encoded == secret {
		t.Fatal("digest must not equal the presented secret")
	}
}
