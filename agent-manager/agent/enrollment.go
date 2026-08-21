package agent

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/hivearmor/agent-manager/models"
	"golang.org/x/crypto/bcrypt"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	enrollmentTokenPrefix = "ha_enroll_"
	agentCredentialPrefix = "ha_agent_"
	bcryptCost            = 12
	maxEnrollmentPageSize = 100
	maxEnrollmentLifetime = 24 * time.Hour
	maxPolicyIDLength     = 128
	maxActorLength        = 255
)

var (
	errEnrollmentInvalid = errors.New("enrollment token is invalid")
	errEnrollmentExpired = errors.New("enrollment token is expired")
	errEnrollmentRevoked = errors.New("enrollment token is revoked")
	errEnrollmentUsed    = errors.New("enrollment token use limit reached")
)

func generateSecret(prefix string) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate secure secret: %w", err)
	}
	return prefix + base64.RawURLEncoding.EncodeToString(raw), nil
}

func hashSecret(secret string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(secret), bcryptCost)
	if err != nil {
		return "", fmt.Errorf("hash secret: %w", err)
	}
	return string(hash), nil
}

// Enrollment tokens include a public lookup identifier plus a 256-bit secret,
// which intentionally exceeds bcrypt's 72-byte input limit. Pre-hash the
// high-entropy token with a versioned domain separator, encode the digest as
// URL-safe text, then let bcrypt provide the deliberately slow verifier. Text
// encoding avoids null-byte ambiguity in future cross-language implementations;
// the domain separator prevents confusion with device credential verifiers.
func enrollmentVerifierInput(secret string) []byte {
	digest := sha256.Sum256([]byte("hivearmor:enrollment:v1:" + secret))
	return []byte(base64.RawURLEncoding.EncodeToString(digest[:]))
}

func hashEnrollmentSecret(secret string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword(enrollmentVerifierInput(secret), bcryptCost)
	if err != nil {
		return "", fmt.Errorf("hash enrollment secret: %w", err)
	}
	return string(hash), nil
}

func enrollmentTokenID(token string) (string, error) {
	if !strings.HasPrefix(token, enrollmentTokenPrefix) {
		return "", errEnrollmentInvalid
	}
	rest := strings.TrimPrefix(token, enrollmentTokenPrefix)
	separator := strings.IndexByte(rest, '.')
	if separator < 1 || separator == len(rest)-1 {
		return "", errEnrollmentInvalid
	}
	id := rest[:separator]
	if _, err := uuid.Parse(id); err != nil {
		return "", errEnrollmentInvalid
	}
	return id, nil
}

func enrollmentStatus(token *models.EnrollmentToken, now time.Time) string {
	if token.RevokedAt != nil {
		return "revoked"
	}
	if !now.Before(token.ExpiresAt) {
		return "expired"
	}
	if token.UseCount >= token.MaxUses {
		return "used"
	}
	return "active"
}

func validateEnrollment(token *models.EnrollmentToken, plaintext, platform string, now time.Time) error {
	if bcrypt.CompareHashAndPassword([]byte(token.TokenHash), enrollmentVerifierInput(plaintext)) != nil {
		return errEnrollmentInvalid
	}
	switch enrollmentStatus(token, now) {
	case "revoked":
		return errEnrollmentRevoked
	case "expired":
		return errEnrollmentExpired
	case "used":
		return errEnrollmentUsed
	}
	if token.Platform != "any" && token.Platform != canonicalPlatform(platform) {
		return errEnrollmentInvalid
	}
	return nil
}

func canonicalPlatform(platform string) string {
	normalized := strings.ToLower(strings.TrimSpace(platform))
	if normalized == "macos" {
		return "darwin"
	}
	return normalized
}

func validateEnrollmentCreateRequest(req *CreateEnrollmentTokenRequest, now time.Time) error {
	policyID := strings.TrimSpace(req.GetPolicyId())
	creator := strings.TrimSpace(req.GetCreatedBy())
	platform := canonicalPlatform(req.GetPlatform())
	if req.GetTenantId() <= 0 || policyID == "" || platform == "" || creator == "" {
		return status.Error(codes.InvalidArgument, "tenant, policy, platform, and creator are required")
	}
	if utf8.RuneCountInString(policyID) > maxPolicyIDLength || utf8.RuneCountInString(creator) > maxActorLength {
		return status.Error(codes.InvalidArgument, "policy or creator exceeds the supported length")
	}
	if platform != "any" && platform != "windows" && platform != "linux" && platform != "darwin" {
		return status.Error(codes.InvalidArgument, "platform must be any, windows, linux, or darwin")
	}
	if req.GetExpiresAt() == nil || !req.GetExpiresAt().IsValid() {
		return status.Error(codes.InvalidArgument, "expiry must be valid")
	}
	expiresAt := req.GetExpiresAt().AsTime()
	if !expiresAt.After(now) {
		return status.Error(codes.InvalidArgument, "expiry must be in the future")
	}
	if expiresAt.After(now.Add(maxEnrollmentLifetime)) {
		return status.Error(codes.InvalidArgument, "expiry must be within 24 hours")
	}
	if req.GetMaxUses() < 1 || req.GetMaxUses() > 1000 {
		return status.Error(codes.InvalidArgument, "max uses must be between 1 and 1000")
	}
	return nil
}

func (s *AgentService) CreateEnrollmentToken(_ context.Context, req *CreateEnrollmentTokenRequest) (*CreateEnrollmentTokenResponse, error) {
	now := time.Now().UTC()
	if err := validateEnrollmentCreateRequest(req, now); err != nil {
		return nil, err
	}

	id := uuid.NewString()
	secret, err := generateSecret("")
	if err != nil {
		return nil, status.Error(codes.Internal, "could not generate enrollment token")
	}
	plaintext := enrollmentTokenPrefix + id + "." + secret
	hash, err := hashEnrollmentSecret(plaintext)
	if err != nil {
		return nil, status.Error(codes.Internal, "could not protect enrollment token")
	}
	model := &models.EnrollmentToken{
		TokenID: id, TokenHash: hash, TenantID: req.GetTenantId(),
		PolicyID: strings.TrimSpace(req.GetPolicyId()), Platform: canonicalPlatform(req.GetPlatform()),
		ExpiresAt: req.GetExpiresAt().AsTime(), MaxUses: req.GetMaxUses(), CreatedBy: strings.TrimSpace(req.GetCreatedBy()), Version: 1,
	}
	if err := s.DBConnection.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(model).Error; err != nil {
			return err
		}
		return appendEnrollmentAudit(tx, &models.EnrollmentAuditEvent{
			TenantID: model.TenantID, EventType: auditTokenCreated, Actor: model.CreatedBy,
			Reason: "one-time enrollment token created", TokenID: model.TokenID, PolicyID: model.PolicyID,
			Platform: model.Platform, EnrollmentVersion: model.Version, OccurredAt: model.CreatedAt.UTC(),
		})
	}); err != nil {
		return nil, status.Error(codes.Internal, "could not persist enrollment token")
	}
	return &CreateEnrollmentTokenResponse{Enrollment: enrollmentProto(model), Token: plaintext}, nil
}

func (s *AgentService) ListEnrollmentTokens(_ context.Context, req *ListEnrollmentTokensRequest) (*ListEnrollmentTokensResponse, error) {
	if req.GetTenantId() <= 0 {
		return nil, status.Error(codes.InvalidArgument, "tenant is required")
	}
	pageSize := int(req.GetPageSize())
	if pageSize < 1 {
		pageSize = 25
	}
	if pageSize > maxEnrollmentPageSize {
		pageSize = maxEnrollmentPageSize
	}
	page := int(req.GetPageNumber())
	if page < 0 {
		page = 0
	}
	var rows []models.EnrollmentToken
	var total int64
	err := s.DBConnection.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.EnrollmentToken{}).Where("tenant_id = ?", req.GetTenantId()).Count(&total).Error; err != nil {
			return err
		}
		return tx.Where("tenant_id = ?", req.GetTenantId()).Order("created_at DESC").Limit(pageSize).Offset(page * pageSize).Find(&rows).Error
	})
	if err != nil {
		return nil, status.Error(codes.Internal, "could not list enrollment tokens")
	}
	result := &ListEnrollmentTokensResponse{Total: int32(total)}
	for i := range rows {
		result.Rows = append(result.Rows, enrollmentProto(&rows[i]))
	}
	return result, nil
}

func (s *AgentService) RevokeEnrollmentToken(_ context.Context, req *RevokeEnrollmentTokenRequest) (*EnrollmentToken, error) {
	revokedBy := strings.TrimSpace(req.GetRevokedBy())
	reason := strings.TrimSpace(req.GetReason())
	if req.GetTenantId() <= 0 || req.GetId() == "" || revokedBy == "" || reason == "" {
		return nil, status.Error(codes.InvalidArgument, "tenant, token id, actor, and reason are required")
	}
	if _, err := uuid.Parse(req.GetId()); err != nil {
		return nil, status.Error(codes.InvalidArgument, "token id must be a UUID")
	}
	if utf8.RuneCountInString(revokedBy) > maxActorLength || utf8.RuneCountInString(reason) > maxAuditReasonLength {
		return nil, status.Error(codes.InvalidArgument, "actor or reason exceeds the supported length")
	}
	var model models.EnrollmentToken
	err := s.DBConnection.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("token_id = ? AND tenant_id = ?", req.GetId(), req.GetTenantId()).First(&model).Error; err != nil {
			return err
		}
		if req.GetExpectedVersion() > 0 && model.Version != req.GetExpectedVersion() {
			return errors.New("version conflict")
		}
		if model.RevokedAt == nil {
			now := time.Now().UTC()
			model.RevokedAt = &now
			model.RevokedBy = revokedBy
			model.RevocationReason = reason
			model.Version++
			if err := tx.Save(&model).Error; err != nil {
				return err
			}
			return appendEnrollmentAudit(tx, &models.EnrollmentAuditEvent{
				TenantID: model.TenantID, EventType: auditTokenRevoked, Actor: model.RevokedBy,
				Reason: model.RevocationReason, TokenID: model.TokenID, PolicyID: model.PolicyID,
				Platform: model.Platform, EnrollmentVersion: model.Version, OccurredAt: now,
			})
		}
		return nil
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, status.Error(codes.NotFound, "enrollment token not found")
	}
	if err != nil && err.Error() == "version conflict" {
		return nil, status.Error(codes.Aborted, "enrollment token version conflict")
	}
	if err != nil {
		return nil, status.Error(codes.Internal, "could not revoke enrollment token")
	}
	return enrollmentProto(&model), nil
}

func (s *AgentService) RotateAgentCredential(_ context.Context, req *AgentCredentialRequest) (*AgentCredentialResponse, error) {
	return s.changeAgentCredential(req, false)
}

func (s *AgentService) RevokeAgentCredential(_ context.Context, req *AgentCredentialRequest) (*AgentCredentialResponse, error) {
	return s.changeAgentCredential(req, true)
}

func (s *AgentService) changeAgentCredential(req *AgentCredentialRequest, revoke bool) (*AgentCredentialResponse, error) {
	actor := strings.TrimSpace(req.GetActor())
	reason := strings.TrimSpace(req.GetReason())
	if req.GetAgentId() == 0 || req.GetTenantId() <= 0 || actor == "" || reason == "" {
		return nil, status.Error(codes.InvalidArgument, "agent, tenant, actor, and reason are required")
	}
	if utf8.RuneCountInString(actor) > maxActorLength || utf8.RuneCountInString(reason) > maxAuditReasonLength {
		return nil, status.Error(codes.InvalidArgument, "actor or reason exceeds the supported length")
	}
	var model models.Agent
	var plaintext string
	err := s.DBConnection.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND tenant_id = ?", req.GetAgentId(), req.GetTenantId()).First(&model).Error; err != nil {
			return err
		}
		now := time.Now().UTC()
		model.CredentialVersion++
		if revoke {
			model.CredentialRevokedAt = &now
			model.AgentKeyHash = ""
			model.AgentKey = ""
		} else {
			var err error
			plaintext, err = generateSecret(agentCredentialPrefix)
			if err != nil {
				return err
			}
			model.AgentKeyHash, err = hashSecret(plaintext)
			if err != nil {
				return err
			}
			model.AgentKey = ""
			model.CredentialRevokedAt = nil
		}
		if err := tx.Save(&model).Error; err != nil {
			return err
		}
		eventType := auditCredentialRotated
		if revoke {
			eventType = auditCredentialRevoked
		}
		return appendEnrollmentAudit(tx, &models.EnrollmentAuditEvent{
			TenantID: model.TenantID, EventType: eventType, Actor: actor, Reason: reason,
			AgentID: uint32(model.ID), AgentUUID: model.AgentUUID, Platform: canonicalPlatform(model.Platform),
			CredentialVersion: model.CredentialVersion, OccurredAt: now,
		})
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, status.Error(codes.NotFound, "agent not found in tenant")
	}
	if err != nil {
		return nil, status.Error(codes.Internal, "could not change agent credential")
	}
	s.CacheAgentKeyMutex.Lock()
	if revoke {
		delete(s.CacheAgentKey, model.ID)
	} else {
		s.CacheAgentKey[model.ID] = model.AgentKeyHash
	}
	s.CacheAgentKeyMutex.Unlock()
	response := &AgentCredentialResponse{AgentId: uint32(model.ID), AgentUuid: model.AgentUUID, CredentialVersion: model.CredentialVersion, Key: plaintext}
	if model.CredentialRevokedAt != nil {
		response.RevokedAt = timestamppb.New(*model.CredentialRevokedAt)
	}
	return response, nil
}

func consumeEnrollment(ctx context.Context, tx *gorm.DB, req *AgentRequest) (*models.Agent, string, error) {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok || len(md.Get("enrollment-token")) != 1 {
		return nil, "", status.Error(codes.Unauthenticated, "enrollment token is required")
	}
	plaintext := md.Get("enrollment-token")[0]
	tokenID, err := enrollmentTokenID(plaintext)
	if err != nil {
		return nil, "", status.Error(codes.Unauthenticated, "invalid enrollment token")
	}
	var enrollment models.EnrollmentToken
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("token_id = ?", tokenID).First(&enrollment).Error; err != nil {
		return nil, "", status.Error(codes.Unauthenticated, "invalid enrollment token")
	}
	if err := validateEnrollment(&enrollment, plaintext, req.GetPlatform(), time.Now().UTC()); err != nil {
		return nil, "", status.Error(codes.PermissionDenied, err.Error())
	}
	var duplicate int64
	if err := tx.Model(&models.Agent{}).
		Where("tenant_id = ? AND hostname = ? AND mac = ? AND deleted_at IS NULL AND credential_revoked_at IS NULL", enrollment.TenantID, req.GetHostname(), req.GetMac()).
		Count(&duplicate).Error; err != nil {
		return nil, "", err
	}
	if duplicate > 0 {
		return nil, "", status.Error(codes.AlreadyExists, "device is already enrolled; rotate its credential instead")
	}
	credential, err := generateSecret(agentCredentialPrefix)
	if err != nil {
		return nil, "", err
	}
	hash, err := hashSecret(credential)
	if err != nil {
		return nil, "", err
	}
	agent := &models.Agent{
		Ip: req.GetIp(), Hostname: req.GetHostname(), Os: req.GetOs(), Platform: req.GetPlatform(), Version: req.GetVersion(),
		RegisterBy: req.GetRegisterBy(), Mac: req.GetMac(), OsMajorVersion: req.GetOsMajorVersion(), OsMinorVersion: req.GetOsMinorVersion(),
		Aliases: req.GetAliases(), Addresses: req.GetAddresses(), AgentUUID: uuid.NewString(), TenantID: enrollment.TenantID,
		AgentKeyHash: hash, CredentialVersion: 1,
	}
	if err := tx.Create(agent).Error; err != nil {
		return nil, "", err
	}
	now := time.Now().UTC()
	enrollment.UseCount++
	enrollment.LastUsedAt = &now
	enrollment.Version++
	if err := tx.Save(&enrollment).Error; err != nil {
		return nil, "", err
	}
	if err := appendEnrollmentAudit(tx, &models.EnrollmentAuditEvent{
		TenantID: enrollment.TenantID, EventType: auditTokenConsumed, Actor: "agent:" + agent.AgentUUID,
		Reason: "one-time enrollment token consumed by successful registration", TokenID: enrollment.TokenID,
		AgentID: uint32(agent.ID), AgentUUID: agent.AgentUUID, PolicyID: enrollment.PolicyID,
		Platform: canonicalPlatform(agent.Platform), CredentialVersion: agent.CredentialVersion,
		EnrollmentVersion: enrollment.Version, OccurredAt: now,
	}); err != nil {
		return nil, "", err
	}
	return agent, credential, nil
}

func enrollmentProto(model *models.EnrollmentToken) *EnrollmentToken {
	result := &EnrollmentToken{
		Id: model.TokenID, TenantId: model.TenantID, PolicyId: model.PolicyID, Platform: model.Platform,
		ExpiresAt: timestamppb.New(model.ExpiresAt), MaxUses: model.MaxUses, UseCount: model.UseCount,
		CreatedAt: timestamppb.New(model.CreatedAt), CreatedBy: model.CreatedBy, RevokedBy: model.RevokedBy,
		RevocationReason: model.RevocationReason, Version: model.Version, Status: enrollmentStatus(model, time.Now().UTC()),
	}
	if model.LastUsedAt != nil {
		result.LastUsedAt = timestamppb.New(*model.LastUsedAt)
	}
	if model.RevokedAt != nil {
		result.RevokedAt = timestamppb.New(*model.RevokedAt)
	}
	return result
}

func credentialMatches(stored, presented string) bool {
	if strings.HasPrefix(stored, "$2") {
		return bcrypt.CompareHashAndPassword([]byte(stored), []byte(presented)) == nil
	}
	return subtle.ConstantTimeCompare([]byte(stored), []byte(presented)) == 1
}
