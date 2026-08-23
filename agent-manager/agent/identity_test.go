package agent

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/hivearmor/agent-manager/models"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestVerifiedAgentIdentityBindsTenantAndOmitsSecret(t *testing.T) {
	hash, err := hashSecret("device-secret")
	if err != nil {
		t.Fatal(err)
	}
	agentUUID := uuid.NewString()
	agent := models.Agent{
		AgentKeyHash:      hash,
		AgentUUID:         agentUUID,
		TenantID:          42,
		CredentialVersion: 3,
	}
	agent.ID = 7

	got, err := verifiedAgentIdentity(agent, "device-secret")
	if err != nil {
		t.Fatalf("expected verified identity, got %v", err)
	}
	if got.GetId() != 7 || got.GetUuid() != agentUUID || got.GetTenantId() != 42 || got.GetCredentialVersion() != 3 {
		t.Fatalf("unexpected identity %#v", got)
	}
	if got.GetRevoked() || got.GetConnectorType() != ConnectorType_AGENT {
		t.Fatalf("unexpected flags %#v", got)
	}
	encoded := got.String()
	if strings.Contains(encoded, "device-secret") || strings.Contains(encoded, hash) {
		t.Fatal("identity response leaked credential material")
	}
}

func TestVerifiedAgentIdentityRejectsWrongRevokedAndUnbound(t *testing.T) {
	hash, err := hashSecret("device-secret")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	base := models.Agent{AgentKeyHash: hash, AgentUUID: uuid.NewString(), TenantID: 9, CredentialVersion: 1}
	base.ID = 3

	tests := []struct {
		name     string
		mutate   func(*models.Agent)
		secret   string
		wantCode codes.Code
	}{
		{name: "wrong secret", secret: "other", wantCode: codes.Unauthenticated},
		{name: "revoked", mutate: func(a *models.Agent) { a.CredentialRevokedAt = &now }, secret: "device-secret", wantCode: codes.PermissionDenied},
		{name: "unbound tenant", mutate: func(a *models.Agent) { a.TenantID = 0 }, secret: "device-secret", wantCode: codes.FailedPrecondition},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			candidate := base
			if test.mutate != nil {
				test.mutate(&candidate)
			}
			_, err := verifiedAgentIdentity(candidate, test.secret)
			if status.Code(err) != test.wantCode {
				t.Fatalf("got %v, want %v", err, test.wantCode)
			}
		})
	}
}

func TestAuthorizationFromAgentOmitsSecrets(t *testing.T) {
	now := time.Now().UTC()
	agent := models.Agent{
		AgentKey:            "legacy-secret",
		AgentKeyHash:        "$2a$12$not-a-real-hash-but-must-not-appear",
		AgentUUID:           "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
		TenantID:            11,
		CredentialVersion:   4,
		CredentialRevokedAt: &now,
	}
	agent.ID = 15

	got := authorizationFromAgent(agent)
	if got.GetId() != 15 || got.GetTenantId() != 11 || !got.GetRevoked() {
		t.Fatalf("unexpected authorization %#v", got)
	}
	if strings.Contains(got.String(), "legacy-secret") || strings.Contains(got.String(), "not-a-real-hash") {
		t.Fatal("authorization projection leaked credential material")
	}
}

func TestVerifiedCollectorIdentityBindsTenantAndRejectsUnbound(t *testing.T) {
	collector := models.Collector{CollectorKey: "collector-secret", TenantID: 11}
	collector.ID = 4
	got, err := verifiedCollectorIdentity(collector, "collector-secret")
	if err != nil {
		t.Fatal(err)
	}
	if got.GetTenantId() != 11 || got.GetUuid() != "collector:4" || got.GetConnectorType() != ConnectorType_COLLECTOR {
		t.Fatalf("unexpected collector identity: %#v", got)
	}
	if strings.Contains(got.String(), "collector-secret") {
		t.Fatal("identity response leaked credential material")
	}
	if _, err := verifiedCollectorIdentity(collector, "wrong"); status.Code(err) != codes.Unauthenticated {
		t.Fatalf("got %v, want Unauthenticated", err)
	}

	unbound := collector
	unbound.TenantID = 0
	if _, err := verifiedCollectorIdentity(unbound, "collector-secret"); status.Code(err) != codes.FailedPrecondition {
		t.Fatalf("got %v, want FailedPrecondition for unbound collector", err)
	}
}

func TestResolveCollectorTenantOnReregister(t *testing.T) {
	tests := []struct {
		name        string
		stored      int64
		requested   int64
		want        int64
		wantUpdate  bool
		wantCode    codes.Code
	}{
		{name: "return stored", stored: 7, requested: 0, want: 7},
		{name: "same tenant ok", stored: 7, requested: 7, want: 7},
		{name: "conflict", stored: 7, requested: 9, wantCode: codes.FailedPrecondition},
		{name: "still unbound", stored: 0, requested: 0, wantCode: codes.FailedPrecondition},
		{name: "bind unbound", stored: 0, requested: 42, want: 42, wantUpdate: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, needsUpdate, err := resolveCollectorTenantOnReregister(test.stored, test.requested)
			if test.wantCode != codes.OK {
				if status.Code(err) != test.wantCode {
					t.Fatalf("got %v, want %v", err, test.wantCode)
				}
				return
			}
			if err != nil || got != test.want || needsUpdate != test.wantUpdate {
				t.Fatalf("got %d update=%v err=%v, want %d update=%v", got, needsUpdate, err, test.want, test.wantUpdate)
			}
		})
	}
}

func TestAuthorizationFromCollectorIncludesTenant(t *testing.T) {
	collector := models.Collector{CollectorKey: "must-not-leak", TenantID: 99}
	collector.ID = 8
	got := authorizationFromCollector(collector)
	if got.GetId() != 8 || got.GetTenantId() != 99 || got.GetUuid() != "collector:8" {
		t.Fatalf("unexpected authorization %#v", got)
	}
	if strings.Contains(got.String(), "must-not-leak") {
		t.Fatal("authorization projection leaked credential material")
	}
}
