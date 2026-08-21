package main

import (
	"os"
	"strings"

	"github.com/threatwinds/go-sdk/plugins"
)

// hiveArmorInternalKey returns the shared backend/agent-manager/inputs secret.
// INTERNAL_KEY from the process environment wins so Compose can inject the
// same value used by agent-manager without requiring a matching YAML copy.
func hiveArmorInternalKey() string {
	return resolveInternalKey(os.Getenv("INTERNAL_KEY"), yamlInternalKey)
}

func yamlInternalKey() string {
	return plugins.PluginCfg("com.hivearmor").Get("internalKey").String()
}

func resolveInternalKey(env string, yamlKey func() string) string {
	if trimmed := strings.TrimSpace(env); trimmed != "" {
		return trimmed
	}
	return yamlKey()
}
