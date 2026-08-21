package config

import (
	"testing"
)

func TestRejectInsecureDefaults_skipsLabProfile(t *testing.T) {
	t.Setenv("HA_PROFILE", "")
	if err := RejectInsecureDefaults(); err != nil {
		t.Fatalf("lab profile must allow local-dev defaults: %v", err)
	}
}

func TestRejectInsecureDefaults_stagingRejectsLabSecrets(t *testing.T) {
	t.Setenv("HA_PROFILE", "staging")
	prevOS, prevPG, prevKey, prevSock := OpenSearchPass, PostgresPass, InternalKey, SocketSecret
	t.Cleanup(func() {
		OpenSearchPass, PostgresPass, InternalKey, SocketSecret = prevOS, prevPG, prevKey, prevSock
	})
	OpenSearchPass = defaultOpenSearchPass
	PostgresPass = defaultPostgresPass
	InternalKey = defaultInternalKey
	SocketSecret = defaultSocketSecret
	if err := RejectInsecureDefaults(); err == nil {
		t.Fatal("expected staging to reject lab secrets")
	}
}

func TestRejectInsecureDefaults_stagingAcceptsNonDefault(t *testing.T) {
	t.Setenv("HA_PROFILE", "staging")
	prevOS, prevPG, prevKey, prevSock := OpenSearchPass, PostgresPass, InternalKey, SocketSecret
	t.Cleanup(func() {
		OpenSearchPass, PostgresPass, InternalKey, SocketSecret = prevOS, prevPG, prevKey, prevSock
	})
	OpenSearchPass = "staging-opensearch-not-default"
	PostgresPass = "staging-postgres-not-default"
	InternalKey = "staging-internal-key-not-default-0123456789"
	SocketSecret = "staging-socket-secret-not-default"
	if err := RejectInsecureDefaults(); err != nil {
		t.Fatalf("non-default staging secrets: %v", err)
	}
}

func TestInjectEnabled_disabledOnStaging(t *testing.T) {
	t.Setenv("HA_PROFILE", "staging")
	prev := InjectAPIKey
	t.Cleanup(func() { InjectAPIKey = prev })
	InjectAPIKey = "anything"
	if InjectEnabled() {
		t.Fatal("/v1/inject must stay disabled on staging")
	}
}
