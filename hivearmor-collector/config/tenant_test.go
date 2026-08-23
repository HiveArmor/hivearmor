package config

import (
	"os"
	"testing"
)

func TestConfigTenantStringAndRequire(t *testing.T) {
	var nilCfg *Config
	if nilCfg.TenantString() != "" || nilCfg.RequireTenant() == nil {
		t.Fatal("nil config must be unbound and fail closed")
	}

	unbound := &Config{}
	if unbound.TenantString() != "" || unbound.RequireTenant() == nil {
		t.Fatal("zero tenant must fail closed")
	}

	bound := &Config{TenantID: 42}
	if bound.TenantString() != "42" || bound.RequireTenant() != nil {
		t.Fatalf("bound tenant failed: %q %v", bound.TenantString(), bound.RequireTenant())
	}
}

func TestParseTenantIDFromEnv(t *testing.T) {
	t.Setenv("HA_TENANT_ID", "7")
	got, err := ParseTenantID()
	if err != nil || got != 7 {
		t.Fatalf("got %d/%v", got, err)
	}

	t.Setenv("HA_TENANT_ID", "0")
	if _, err := ParseTenantID(); err == nil {
		t.Fatal("expected fail closed for zero tenant")
	}

	t.Setenv("HA_TENANT_ID", "")
	orig := append([]string{}, os.Args...)
	defer func() { os.Args = orig }()
	os.Args = []string{"collector", "install", "host", "key", "yes", "99"}
	got, err = ParseTenantID()
	if err != nil || got != 99 {
		t.Fatalf("got %d/%v from install arg", got, err)
	}
}
