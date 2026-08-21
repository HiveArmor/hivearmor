package main

import (
	"context"
	"crypto/subtle"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/threatwinds/go-sdk/catcher"
	"github.com/threatwinds/go-sdk/plugins"

	"github.com/hivearmor/plugins/inputs/agent"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

const missRefreshCooldown = 2 * time.Second

type cachedIdentity struct {
	identity ConnectorIdentity
	digest   [32]byte
}

type LogAuthService struct {
	Mutex              *sync.Mutex
	identities         map[string]cachedIdentity
	revoked            map[string]struct{}
	negativeUntil      map[string]time.Time
	ConnectionKeyCache string
	limiter            *ingressLimiter

	lastProjectionTime time.Time
}

func NewLogAuthService() *LogAuthService {
	authService := &LogAuthService{
		Mutex:         &sync.Mutex{},
		identities:    make(map[string]cachedIdentity),
		revoked:       make(map[string]struct{}),
		negativeUntil: make(map[string]time.Time),
		limiter:       newIngressLimiter(),
	}

	authService.syncConnectionKey()
	authService.syncAuthorization(agent.ConnectorType_AGENT)
	authService.syncAuthorization(agent.ConnectorType_COLLECTOR)

	return authService
}

func (auth *LogAuthService) SyncAuth() {
	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		auth.syncAuthorization(agent.ConnectorType_COLLECTOR)
		auth.syncAuthorization(agent.ConnectorType_AGENT)
		auth.syncConnectionKey()
	}
}

func (auth *LogAuthService) AuthenticateConnector(id uint, typ, presentedKey string) (*ConnectorIdentity, error) {
	typ = strings.ToLower(strings.TrimSpace(typ))
	if presentedKey == "" || id == 0 || (typ != "agent" && typ != "collector") {
		return nil, status.Error(codes.Unauthenticated, "connector identity required")
	}
	cacheKey := typ + ":" + fmt.Sprintf("%d", id)

	auth.Mutex.Lock()
	if _, revoked := auth.revoked[cacheKey]; revoked {
		auth.Mutex.Unlock()
		return nil, status.Error(codes.PermissionDenied, errIdentityRevoked.Error())
	}
	if cached, ok := auth.identities[cacheKey]; ok {
		digest := presentedKeyDigest(presentedKey)
		if subtle.ConstantTimeCompare(cached.digest[:], digest[:]) == 1 {
			identity := cached.identity
			auth.Mutex.Unlock()
			return &identity, nil
		}
	}
	until := auth.negativeUntil[cacheKey]
	auth.Mutex.Unlock()
	if !until.IsZero() && time.Now().Before(until) {
		return nil, status.Error(codes.PermissionDenied, "invalid key")
	}

	identity, err := auth.verifyAgainstManager(uint32(id), typ, presentedKey)
	if err != nil {
		auth.Mutex.Lock()
		auth.negativeUntil[cacheKey] = time.Now().Add(missRefreshCooldown)
		auth.Mutex.Unlock()
		return nil, err
	}

	auth.Mutex.Lock()
	delete(auth.negativeUntil, cacheKey)
	delete(auth.revoked, cacheKey)
	auth.identities[cacheKey] = cachedIdentity{identity: *identity, digest: presentedKeyDigest(presentedKey)}
	auth.Mutex.Unlock()
	return identity, nil
}

func (auth *LogAuthService) verifyAgainstManager(id uint32, typ, presentedKey string) (*ConnectorIdentity, error) {
	conn, err := auth.dialManager()
	if err != nil {
		return nil, status.Error(codes.Unavailable, "identity authority unavailable")
	}
	defer func() { _ = conn.Close() }()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	ctx = metadata.AppendToOutgoingContext(ctx, "internal-key", hiveArmorInternalKey())

	connectorType := agent.ConnectorType_AGENT
	if typ == "collector" {
		connectorType = agent.ConnectorType_COLLECTOR
	}
	response, err := agent.NewAgentServiceClient(conn).VerifyConnectorIdentity(ctx, &agent.VerifyConnectorIdentityRequest{
		ConnectorId:   id,
		PresentedKey:  presentedKey,
		ConnectorType: connectorType,
	})
	if err != nil {
		return nil, err
	}
	if response.GetRevoked() {
		return nil, status.Error(codes.PermissionDenied, errIdentityRevoked.Error())
	}
	if response.GetTenantId() <= 0 || strings.TrimSpace(response.GetUuid()) == "" {
		return nil, status.Error(codes.PermissionDenied, errTenantUnbound.Error())
	}

	catcher.Info("ingress identity verified", map[string]any{
		"process":        "plugin_com.hivearmor.inputs",
		"connector_id":   response.GetId(),
		"connector_type": typ,
		"tenant_id":      response.GetTenantId(),
	})
	return &ConnectorIdentity{
		Type:              typ,
		ID:                response.GetId(),
		ConnectorID:       response.GetUuid(),
		TenantID:          response.GetTenantId(),
		CredentialVersion: response.GetCredentialVersion(),
	}, nil
}

func (auth *LogAuthService) syncAuthorization(typ agent.ConnectorType) {
	conn, err := auth.dialManager()
	if err != nil {
		return
	}
	defer func() { _ = conn.Close() }()

	client := agent.NewAgentServiceClient(conn)
	page := int32(1)
	seen := map[string]cachedIdentity{}
	revoked := map[string]struct{}{}
	for {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		ctx = metadata.AppendToOutgoingContext(ctx, "internal-key", hiveArmorInternalKey())
		response, err := client.ListConnectorAuthorization(ctx, &agent.ListConnectorAuthorizationRequest{
			ConnectorType: typ,
			PageNumber:    page,
			PageSize:      100,
		})
		cancel()
		if err != nil {
			if !strings.Contains(err.Error(), "error reading server preface: http2: frame too large") {
				_ = catcher.Error("cannot synchronize connector authorization", err, map[string]any{"process": "plugin_com.hivearmor.inputs"})
			}
			return
		}
		for _, row := range response.GetRows() {
			key := authorizationCacheKey(row)
			if row.GetRevoked() || row.GetTenantId() <= 0 {
				revoked[key] = struct{}{}
				continue
			}
			seen[key] = cachedIdentity{identity: ConnectorIdentity{
				Type:              connectorTypeName(row.GetConnectorType()),
				ID:                row.GetId(),
				ConnectorID:       row.GetUuid(),
				TenantID:          row.GetTenantId(),
				CredentialVersion: row.GetCredentialVersion(),
			}}
		}
		if len(response.GetRows()) == 0 || int32(len(response.GetRows())) < 100 || int64(page)*100 >= int64(response.GetTotal()) {
			break
		}
		page++
	}

	prefix := connectorTypeName(typ) + ":"
	auth.Mutex.Lock()
	defer auth.Mutex.Unlock()
	for key := range auth.identities {
		if !strings.HasPrefix(key, prefix) {
			continue
		}
		if _, ok := seen[key]; !ok {
			delete(auth.identities, key)
		}
	}
	for key := range auth.revoked {
		if strings.HasPrefix(key, prefix) {
			delete(auth.revoked, key)
		}
	}
	for key := range revoked {
		delete(auth.identities, key)
		auth.revoked[key] = struct{}{}
	}
	for key, projected := range seen {
		if cached, ok := auth.identities[key]; ok {
			cached.identity.TenantID = projected.identity.TenantID
			cached.identity.ConnectorID = projected.identity.ConnectorID
			cached.identity.CredentialVersion = projected.identity.CredentialVersion
			auth.identities[key] = cached
		}
	}
	auth.lastProjectionTime = time.Now()
}

func (auth *LogAuthService) dialManager() (*grpc.ClientConn, error) {
	pConfig := plugins.PluginCfg("com.hivearmor")
	agentManager := pConfig.Get("agentManager").String()
	if agentManager == "" {
		_ = catcher.Error("Could not reach identity authority. This is a common occurrence during the startup process and typically resolves on its own after a short while.", fmt.Errorf("configuration is empty"), map[string]any{"process": "plugin_com.hivearmor.inputs"})
		return nil, fmt.Errorf("agent manager is not configured")
	}
	tlsCredentials := credentials.NewTLS(buildGRPCTLSConfig())
	conn, err := grpc.NewClient(agentManager, grpc.WithTransportCredentials(tlsCredentials), grpc.WithDefaultCallOptions(
		grpc.MaxCallRecvMsgSize(maxMessageBytes),
		grpc.MaxCallSendMsgSize(maxMessageBytes),
	))
	if err != nil {
		_ = catcher.Error("Could not reach identity authority. This is a common occurrence during the startup process and typically resolves on its own after a short while.", err, map[string]any{"process": "plugin_com.hivearmor.inputs"})
		return nil, err
	}
	return conn, nil
}

func authorizationCacheKey(row *agent.ConnectorAuthorization) string {
	return connectorTypeName(row.GetConnectorType()) + ":" + fmt.Sprintf("%d", row.GetId())
}

func connectorTypeName(typ agent.ConnectorType) string {
	if typ == agent.ConnectorType_COLLECTOR {
		return "collector"
	}
	return "agent"
}

func (auth *LogAuthService) syncConnectionKey() {
	panelKey, e := GetConnectionKey()
	if e != nil {
		return
	}

	auth.Mutex.Lock()
	auth.ConnectionKeyCache = string(panelKey)
	auth.Mutex.Unlock()
}

func (auth *LogAuthService) IsConnectionKeyValid(connectionKey string) bool {
	return auth.ConnectionKeyCache != "" && auth.ConnectionKeyCache == connectionKey
}

func (auth *LogAuthService) GetConnectionKey() string {
	return auth.ConnectionKeyCache
}
