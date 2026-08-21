package agent

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/hivearmor/agent-manager/models"
	"github.com/hivearmor/agent-manager/utils"
	"github.com/threatwinds/go-sdk/catcher"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gorm.io/gorm"
)

// VerifyConnectorIdentity confirms a presented connector secret against the
// stored verifier and returns tenant-bound identity metadata. The presented
// secret is never copied into the response, logs or the authorization list.
func (s *AgentService) VerifyConnectorIdentity(ctx context.Context, req *VerifyConnectorIdentityRequest) (*VerifyConnectorIdentityResponse, error) {
	if req.GetConnectorId() == 0 || strings.TrimSpace(req.GetPresentedKey()) == "" {
		return nil, status.Error(codes.InvalidArgument, "connector id and presented key are required")
	}

	switch req.GetConnectorType() {
	case ConnectorType_AGENT:
		agent := models.Agent{}
		if err := s.DBConnection.GetFirst(&agent, "id = ?", req.GetConnectorId()); err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, status.Error(codes.NotFound, "connector not found")
			}
			catcher.Error("failed to load connector for identity verification", err, map[string]any{
				"process":        "agent-manager",
				"connector_id":   req.GetConnectorId(),
				"connector_type": "agent",
			})
			return nil, status.Error(codes.Internal, "failed to verify connector identity")
		}
		identity, err := verifiedAgentIdentity(agent, req.GetPresentedKey())
		if err != nil {
			return nil, err
		}
		catcher.Info("connector identity verified", map[string]any{
			"process":        "agent-manager",
			"connector_id":   identity.Id,
			"connector_type": "agent",
			"tenant_id":      identity.TenantId,
		})
		return identity, nil
	case ConnectorType_COLLECTOR:
		collector := models.Collector{}
		if err := s.DBConnection.GetFirst(&collector, "id = ?", req.GetConnectorId()); err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, status.Error(codes.NotFound, "connector not found")
			}
			catcher.Error("failed to load connector for identity verification", err, map[string]any{
				"process":        "agent-manager",
				"connector_id":   req.GetConnectorId(),
				"connector_type": "collector",
			})
			return nil, status.Error(codes.Internal, "failed to verify connector identity")
		}
		if _, err := verifiedCollectorSecret(collector, req.GetPresentedKey()); err != nil {
			return nil, err
		}
		return nil, status.Error(codes.FailedPrecondition, "collector identity has no tenant binding")
	default:
		return nil, status.Error(codes.InvalidArgument, "connector type is required")
	}
}

// ListConnectorAuthorization returns a secret-free, page-bounded projection of
// connector authorization state. Inputs uses this to drop revoked cache entries
// instead of synchronizing plaintext keys.
func (s *AgentService) ListConnectorAuthorization(ctx context.Context, req *ListConnectorAuthorizationRequest) (*ListConnectorAuthorizationResponse, error) {
	pageNumber, pageSize := utils.BoundInventoryPage(req.GetPageNumber(), req.GetPageSize())
	page := utils.NewPaginator(pageSize, pageNumber, "")

	switch req.GetConnectorType() {
	case ConnectorType_AGENT:
		agents := []models.Agent{}
		total, err := s.DBConnection.GetByPagination(&agents, page, utils.NewFilter(""), "", false)
		if err != nil {
			catcher.Error("failed to list connector authorization", err, map[string]any{"process": "agent-manager", "connector_type": "agent"})
			return nil, status.Error(codes.Internal, "failed to list connector authorization")
		}
		rows := make([]*ConnectorAuthorization, 0, len(agents))
		for _, agent := range agents {
			rows = append(rows, authorizationFromAgent(agent))
		}
		return &ListConnectorAuthorizationResponse{Rows: rows, Total: int32(total)}, nil
	case ConnectorType_COLLECTOR:
		collectors := []models.Collector{}
		total, err := s.DBConnection.GetByPagination(&collectors, page, utils.NewFilter(""), "", false)
		if err != nil {
			catcher.Error("failed to list connector authorization", err, map[string]any{"process": "agent-manager", "connector_type": "collector"})
			return nil, status.Error(codes.Internal, "failed to list connector authorization")
		}
		rows := make([]*ConnectorAuthorization, 0, len(collectors))
		for _, collector := range collectors {
			rows = append(rows, authorizationFromCollector(collector))
		}
		return &ListConnectorAuthorizationResponse{Rows: rows, Total: int32(total)}, nil
	default:
		return nil, status.Error(codes.InvalidArgument, "connector type is required")
	}
}

func verifiedAgentIdentity(agent models.Agent, presentedKey string) (*VerifyConnectorIdentityResponse, error) {
	stored := strings.TrimSpace(agent.AgentKeyHash)
	if stored == "" {
		stored = agent.AgentKey
	}
	if stored == "" || !credentialMatches(stored, presentedKey) {
		return nil, status.Error(codes.Unauthenticated, "invalid key")
	}
	if agent.CredentialRevokedAt != nil {
		return nil, status.Error(codes.PermissionDenied, "credential revoked")
	}
	if agent.TenantID <= 0 {
		return nil, status.Error(codes.FailedPrecondition, "connector identity has no tenant binding")
	}
	uuid := strings.TrimSpace(agent.AgentUUID)
	if uuid == "" {
		uuid = fmt.Sprintf("agent:%d", agent.ID)
	}
	return &VerifyConnectorIdentityResponse{
		Id:                uint32(agent.ID),
		Uuid:              uuid,
		TenantId:          agent.TenantID,
		CredentialVersion: agent.CredentialVersion,
		Revoked:           false,
		ConnectorType:     ConnectorType_AGENT,
	}, nil
}

func verifiedCollectorSecret(collector models.Collector, presentedKey string) (*VerifyConnectorIdentityResponse, error) {
	if strings.TrimSpace(collector.CollectorKey) == "" || !credentialMatches(collector.CollectorKey, presentedKey) {
		return nil, status.Error(codes.Unauthenticated, "invalid key")
	}
	return &VerifyConnectorIdentityResponse{
		Id:            uint32(collector.ID),
		Uuid:          fmt.Sprintf("collector:%d", collector.ID),
		ConnectorType: ConnectorType_COLLECTOR,
	}, nil
}

func authorizationFromAgent(agent models.Agent) *ConnectorAuthorization {
	uuid := strings.TrimSpace(agent.AgentUUID)
	if uuid == "" {
		uuid = fmt.Sprintf("agent:%d", agent.ID)
	}
	return &ConnectorAuthorization{
		Id:                uint32(agent.ID),
		Uuid:              uuid,
		TenantId:          agent.TenantID,
		Revoked:           agent.CredentialRevokedAt != nil,
		CredentialVersion: agent.CredentialVersion,
		ConnectorType:     ConnectorType_AGENT,
	}
}

func authorizationFromCollector(collector models.Collector) *ConnectorAuthorization {
	return &ConnectorAuthorization{
		Id:            uint32(collector.ID),
		Uuid:          fmt.Sprintf("collector:%d", collector.ID),
		TenantId:      0,
		Revoked:       false,
		ConnectorType: ConnectorType_COLLECTOR,
	}
}
