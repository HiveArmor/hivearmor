package main

import (
	"testing"
)

func TestResolveInternalKeyPrefersEnv(t *testing.T) {
	got := resolveInternalKey(" from-compose ", func() string {
		t.Fatal("YAML key must not be read when INTERNAL_KEY is set")
		return "yaml"
	})
	if got != "from-compose" {
		t.Fatalf("got %q, want trimmed INTERNAL_KEY", got)
	}
}

func TestResolveInternalKeyFallsBackToYamlWhenEnvBlank(t *testing.T) {
	got := resolveInternalKey("   ", func() string { return "from-yaml" })
	if got != "from-yaml" {
		t.Fatalf("got %q, want YAML fallback", got)
	}
}
