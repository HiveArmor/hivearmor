package agent

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/hivearmor/agent-manager/models"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func TestEnrollmentTokenID(t *testing.T) {
	id := uuid.NewString()
	tests := []struct {
		name    string
		token   string
		wantID  string
		wantErr bool
	}{
		{name: "valid", token: enrollmentTokenPrefix + id + ".secret", wantID: id},
		{name: "wrong prefix", token: "legacy_" + id + ".secret", wantErr: true},
		{name: "missing secret", token: enrollmentTokenPrefix + id + ".", wantErr: true},
		{name: "invalid identifier", token: enrollmentTokenPrefix + "not-a-uuid.secret", wantErr: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := enrollmentTokenID(test.token)
			if test.wantErr && err == nil {
				t.Fatal("expected an error")
			}
			if !test.wantErr && (err != nil || got != test.wantID) {
				t.Fatalf("got id=%q err=%v", got, err)
			}
		})
	}
}

func TestValidateEnrollmentRejectsInactiveAndWrongScope(t *testing.T) {
	plaintext := enrollmentTokenPrefix + uuid.NewString() + ".secret"
	hash, err := hashEnrollmentSecret(plaintext)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	base := models.EnrollmentToken{TokenHash: hash, Platform: "linux", ExpiresAt: now.Add(time.Hour), MaxUses: 1}

	tests := []struct {
		name     string
		mutate   func(*models.EnrollmentToken)
		secret   string
		platform string
		wantErr  error
	}{
		{name: "valid", mutate: func(*models.EnrollmentToken) {}, secret: plaintext, platform: "linux"},
		{name: "wrong secret", mutate: func(*models.EnrollmentToken) {}, secret: plaintext + "x", platform: "linux", wantErr: errEnrollmentInvalid},
		{name: "wrong platform", mutate: func(*models.EnrollmentToken) {}, secret: plaintext, platform: "windows", wantErr: errEnrollmentInvalid},
		{name: "expired", mutate: func(v *models.EnrollmentToken) { v.ExpiresAt = now.Add(-time.Second) }, secret: plaintext, platform: "linux", wantErr: errEnrollmentExpired},
		{name: "used", mutate: func(v *models.EnrollmentToken) { v.UseCount = v.MaxUses }, secret: plaintext, platform: "linux", wantErr: errEnrollmentUsed},
		{name: "revoked", mutate: func(v *models.EnrollmentToken) { v.RevokedAt = &now }, secret: plaintext, platform: "linux", wantErr: errEnrollmentRevoked},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			candidate := base
			test.mutate(&candidate)
			got := validateEnrollment(&candidate, test.secret, test.platform, now)
			if got != test.wantErr {
				t.Fatalf("got %v, want %v", got, test.wantErr)
			}
		})
	}
}

func TestCredentialMatchesHashedAndLegacy(t *testing.T) {
	hash, err := hashSecret("device-secret")
	if err != nil {
		t.Fatal(err)
	}
	if !credentialMatches(hash, "device-secret") || credentialMatches(hash, "wrong") {
		t.Fatal("bcrypt credential comparison failed")
	}
	if !credentialMatches("legacy-secret", "legacy-secret") || credentialMatches("legacy-secret", "wrong") {
		t.Fatal("constant-time legacy credential comparison failed")
	}
}

func TestValidateEnrollmentCreateRequestFailsClosed(t *testing.T) {
	now := time.Now().UTC()
	valid := func() *CreateEnrollmentTokenRequest {
		return &CreateEnrollmentTokenRequest{
			TenantId: 42, PolicyId: "endpoint-default", Platform: "linux", CreatedBy: "soc-manager",
			ExpiresAt: timestamppb.New(now.Add(time.Hour)), MaxUses: 1,
		}
	}
	tests := []struct {
		name   string
		mutate func(*CreateEnrollmentTokenRequest)
	}{
		{name: "unknown platform", mutate: func(req *CreateEnrollmentTokenRequest) { req.Platform = "solaris" }},
		{name: "expired", mutate: func(req *CreateEnrollmentTokenRequest) { req.ExpiresAt = timestamppb.New(now.Add(-time.Second)) }},
		{name: "excessive lifetime", mutate: func(req *CreateEnrollmentTokenRequest) {
			req.ExpiresAt = timestamppb.New(now.Add(maxEnrollmentLifetime + time.Second))
		}},
		{name: "policy too long", mutate: func(req *CreateEnrollmentTokenRequest) { req.PolicyId = strings.Repeat("p", maxPolicyIDLength+1) }},
		{name: "creator too long", mutate: func(req *CreateEnrollmentTokenRequest) { req.CreatedBy = strings.Repeat("a", maxActorLength+1) }},
		{name: "zero uses", mutate: func(req *CreateEnrollmentTokenRequest) { req.MaxUses = 0 }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			req := valid()
			test.mutate(req)
			err := validateEnrollmentCreateRequest(req, now)
			if status.Code(err) != codes.InvalidArgument {
				t.Fatalf("got %v, want InvalidArgument", err)
			}
		})
	}
}

func TestCanonicalPlatformAcceptsMacOSAlias(t *testing.T) {
	if got := canonicalPlatform(" macOS "); got != "darwin" {
		t.Fatalf("got %q, want darwin", got)
	}
}

func TestEnrollmentAuditListValidationFailsClosed(t *testing.T) {
	tests := []struct {
		name    string
		request *ListEnrollmentAuditEventsRequest
	}{
		{name: "missing tenant", request: &ListEnrollmentAuditEventsRequest{}},
		{name: "invalid token", request: &ListEnrollmentAuditEventsRequest{TenantId: 1, TokenId: "not-a-uuid"}},
		{name: "invalid agent UUID", request: &ListEnrollmentAuditEventsRequest{TenantId: 1, AgentUuid: "not-a-uuid"}},
		{name: "unknown event", request: &ListEnrollmentAuditEventsRequest{TenantId: 1, EventType: "credential.secret.viewed"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if code := status.Code(validateEnrollmentAuditListRequest(test.request)); code != codes.InvalidArgument {
				t.Fatalf("got %s, want InvalidArgument", code)
			}
		})
	}
}

func TestCredentialChangeRequiresAuditableReason(t *testing.T) {
	service := &AgentService{}
	_, err := service.RevokeAgentCredential(nil, &AgentCredentialRequest{AgentId: 1, TenantId: 42, Actor: "soc-manager"})
	if code := status.Code(err); code != codes.InvalidArgument {
		t.Fatalf("got %s, want InvalidArgument", code)
	}
}

func TestEnrollmentAuditEventTypesAreAllowlisted(t *testing.T) {
	for _, eventType := range []string{
		auditTokenCreated, auditTokenConsumed, auditTokenRevoked, auditCredentialRotated, auditCredentialRevoked,
	} {
		if !isEnrollmentAuditEventType(eventType) {
			t.Fatalf("expected %q to be allowed", eventType)
		}
	}
	if isEnrollmentAuditEventType("enrollment.secret.exposed") {
		t.Fatal("unknown audit event type was accepted")
	}
}
