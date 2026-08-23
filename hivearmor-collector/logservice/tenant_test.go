package logservice

import (
	"testing"

	"github.com/hivearmor/hivearmor-collector/config"
	"github.com/hivearmor/sdk/plugins"
)

func TestBindTenantFailClosed(t *testing.T) {
	log := &plugins.Log{Raw: "x"}
	if err := BindTenant(&config.Config{}, log); err == nil {
		t.Fatal("expected unbound failure")
	}
	if log.TenantId != "" {
		t.Fatalf("unbound must not stamp tenant: %q", log.TenantId)
	}

	if err := BindTenant(&config.Config{TenantID: 5}, log); err != nil {
		t.Fatal(err)
	}
	if log.TenantId != "5" {
		t.Fatalf("got %q", log.TenantId)
	}
}
