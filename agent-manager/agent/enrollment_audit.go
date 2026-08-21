package agent

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/hivearmor/agent-manager/models"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
	"gorm.io/gorm"
)

const (
	auditTokenCreated       = "enrollment.token.created"
	auditTokenConsumed      = "enrollment.token.consumed"
	auditTokenRevoked       = "enrollment.token.revoked"
	auditCredentialRotated  = "agent.credential.rotated"
	auditCredentialRevoked  = "agent.credential.revoked"
	maxAuditReasonLength    = 512
	maxAuditEventTypeLength = 64
)

func appendEnrollmentAudit(tx *gorm.DB, event *models.EnrollmentAuditEvent) error {
	if event.ID == "" {
		event.ID = uuid.NewString()
	}
	if event.OccurredAt.IsZero() {
		event.OccurredAt = time.Now().UTC()
	}
	event.Actor = strings.TrimSpace(event.Actor)
	event.Reason = strings.TrimSpace(event.Reason)
	event.EventType = strings.TrimSpace(event.EventType)
	if event.TenantID <= 0 || !isEnrollmentAuditEventType(event.EventType) || event.Actor == "" || event.Reason == "" {
		return status.Error(codes.InvalidArgument, "audit tenant, event type, actor, and reason are required")
	}
	if utf8.RuneCountInString(event.Actor) > maxActorLength || utf8.RuneCountInString(event.Reason) > maxAuditReasonLength {
		return status.Error(codes.InvalidArgument, "audit actor or reason exceeds the supported length")
	}
	return tx.Create(event).Error
}

func isEnrollmentAuditEventType(eventType string) bool {
	switch eventType {
	case auditTokenCreated, auditTokenConsumed, auditTokenRevoked, auditCredentialRotated, auditCredentialRevoked:
		return true
	default:
		return false
	}
}

func validateEnrollmentAuditListRequest(req *ListEnrollmentAuditEventsRequest) error {
	if req.GetTenantId() <= 0 {
		return status.Error(codes.InvalidArgument, "tenant is required")
	}
	if value := strings.TrimSpace(req.GetTokenId()); value != "" {
		if _, err := uuid.Parse(value); err != nil {
			return status.Error(codes.InvalidArgument, "token id must be a UUID")
		}
	}
	if value := strings.TrimSpace(req.GetAgentUuid()); value != "" {
		if _, err := uuid.Parse(value); err != nil {
			return status.Error(codes.InvalidArgument, "agent UUID must be valid")
		}
	}
	if value := strings.TrimSpace(req.GetEventType()); value != "" {
		if utf8.RuneCountInString(value) > maxAuditEventTypeLength || !isEnrollmentAuditEventType(value) {
			return status.Error(codes.InvalidArgument, "event type is not supported")
		}
	}
	return nil
}

func (s *AgentService) ListEnrollmentAuditEvents(_ context.Context, req *ListEnrollmentAuditEventsRequest) (*ListEnrollmentAuditEventsResponse, error) {
	if err := validateEnrollmentAuditListRequest(req); err != nil {
		return nil, err
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

	var rows []models.EnrollmentAuditEvent
	var total int64
	err := s.DBConnection.Transaction(func(tx *gorm.DB) error {
		query := tx.Model(&models.EnrollmentAuditEvent{}).Where("tenant_id = ?", req.GetTenantId())
		if value := strings.TrimSpace(req.GetTokenId()); value != "" {
			query = query.Where("token_id = ?", value)
		}
		if value := strings.TrimSpace(req.GetAgentUuid()); value != "" {
			query = query.Where("agent_uuid = ?", value)
		}
		if value := strings.TrimSpace(req.GetEventType()); value != "" {
			query = query.Where("event_type = ?", value)
		}
		if err := query.Count(&total).Error; err != nil {
			return err
		}
		return query.Order("occurred_at DESC, id DESC").Limit(pageSize).Offset(page * pageSize).Find(&rows).Error
	})
	if err != nil {
		return nil, status.Error(codes.Internal, "could not list enrollment audit events")
	}
	result := &ListEnrollmentAuditEventsResponse{Total: total}
	for index := range rows {
		result.Rows = append(result.Rows, enrollmentAuditProto(&rows[index]))
	}
	return result, nil
}

// Enrollment audit rows are append-only. Retention is operator export/backup of copies;
// ListEnrollmentAuditEvents never deletes source rows.


func enrollmentAuditProto(event *models.EnrollmentAuditEvent) *EnrollmentAuditEvent {
	return &EnrollmentAuditEvent{
		Id: event.ID, TenantId: event.TenantID, EventType: event.EventType, Actor: event.Actor, Reason: event.Reason,
		TokenId: event.TokenID, AgentId: event.AgentID, AgentUuid: event.AgentUUID, PolicyId: event.PolicyID,
		Platform: event.Platform, CredentialVersion: event.CredentialVersion, EnrollmentVersion: event.EnrollmentVersion,
		OccurredAt: timestamppb.New(event.OccurredAt),
	}
}
