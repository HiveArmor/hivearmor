package config

import (
	"fmt"
	"strings"
)

const (
	defaultOpenSearchPass = "LocalDev@2024!"
	defaultPostgresPass   = "localdev123!"
	defaultInternalKey    = "local-dev-internal-key-do-not-use-in-prod-12345678"
	defaultSocketSecret   = "change-me-in-production"
)

// IsHardenedProfile is true for staging and production, where default lab
// secrets and the /v1/inject listener are rejected.
func IsHardenedProfile() bool {
	switch strings.ToLower(getEnv("HA_PROFILE", "")) {
	case "staging", "production":
		return true
	default:
		return false
	}
}

// InjectEnabled reports whether the test inject listener may start.
func InjectEnabled() bool {
	return !IsHardenedProfile() && InjectAPIKey != ""
}

// RejectInsecureDefaults fails closed when HA_PROFILE is staging or production
// and a well-known lab secret is still configured.
func RejectInsecureDefaults() error {
	if !IsHardenedProfile() {
		return nil
	}
	var banned []string
	if OpenSearchPass == "" || OpenSearchPass == defaultOpenSearchPass {
		banned = append(banned, "OPENSEARCH_PASSWORD")
	}
	if PostgresPass == "" || PostgresPass == defaultPostgresPass {
		banned = append(banned, "POSTGRESQL_PASSWORD")
	}
	if InternalKey == "" || InternalKey == defaultInternalKey {
		banned = append(banned, "INTERNAL_KEY")
	}
	if SocketSecret == "" || SocketSecret == defaultSocketSecret {
		banned = append(banned, "INPUTS_SOCKET_SECRET")
	}
	if OpenSearchUser == "admin" && OpenSearchPass == defaultOpenSearchPass {
		banned = append(banned, "OPENSEARCH_USER/PASSWORD pair")
	}
	if len(banned) == 0 {
		return nil
	}
	return fmt.Errorf("HA_PROFILE=%s rejects default lab secrets: %s", getEnv("HA_PROFILE", ""), strings.Join(banned, ", "))
}
