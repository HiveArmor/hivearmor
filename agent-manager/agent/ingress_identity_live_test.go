package agent

import (
	"context"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/threatwinds/go-sdk/plugins"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

const liveMaxMessageBytes = 4 * 1024 * 1024

// TestLiveIdentityIngress is opt-in because it targets the rebuilt local stack.
// It proves enrolled agent identity can ingest, forged tenant/oversize/burst are
// rejected, and a revoked credential is denied after authorization projection.
func TestLiveIdentityIngress(t *testing.T) {
	if os.Getenv("HA_RUN_INGRESS_LIVE") != "1" {
		t.Skip("set HA_RUN_INGRESS_LIVE=1 for the local-stack acceptance test")
	}

	token := readProtectedTestSecret(t, os.Getenv("HA_ENROLLMENT_TOKEN_FILE"))
	internalKey := readProtectedTestSecret(t, os.Getenv("HA_INTERNAL_KEY_FILE"))
	caPath := os.Getenv("HA_GRPC_CA_FILE")
	serverName := os.Getenv("HA_GRPC_SERVER_NAME")
	if serverName == "" {
		serverName = "localhost"
	}
	managerAddr := getenvDefault("HA_GRPC_ADDRESS", "127.0.0.1:9000")
	inputsAddr := getenvDefault("HA_INPUTS_ADDRESS", "127.0.0.1:50051")

	tlsCreds, err := credentials.NewClientTLSFromFile(caPath, serverName)
	if err != nil {
		t.Fatal(err)
	}

	managerConn, err := grpc.NewClient(managerAddr, grpc.WithTransportCredentials(tlsCreds))
	if err != nil {
		t.Fatal(err)
	}
	defer managerConn.Close()
	manager := NewAgentServiceClient(managerConn)

	enrollCtx, enrollCancel := context.WithTimeout(metadata.AppendToOutgoingContext(context.Background(), "enrollment-token", token), 15*time.Second)
	defer enrollCancel()
	suffix := strconv.FormatInt(time.Now().UnixNano(), 10)
	registered, err := manager.RegisterAgent(enrollCtx, &AgentRequest{
		Ip: "192.0.2.80", Hostname: "pilot-live-ingress-" + suffix, Os: "linux",
		Platform: "linux", Version: "live-ingress", RegisterBy: "codex-live",
		Mac: "02:00:00:00:00:80",
	})
	if err != nil || registered.GetId() == 0 || registered.GetKey() == "" {
		t.Fatalf("register agent: id=%d err=%v", registered.GetId(), err)
	}
	agentID := registered.GetId()
	deviceKey := registered.GetKey()
	t.Cleanup(func() {
		adminCtx, cancel := context.WithTimeout(metadata.AppendToOutgoingContext(context.Background(), "internal-key", internalKey), 10*time.Second)
		defer cancel()
		_, _ = manager.RevokeAgentCredential(adminCtx, &AgentCredentialRequest{
			AgentId: agentID, TenantId: 1, Actor: "codex-live", Reason: "live ingress acceptance cleanup",
		})
	})

	inputsConn, err := grpc.NewClient(
		inputsAddr,
		grpc.WithTransportCredentials(tlsCreds),
		grpc.WithDefaultCallOptions(grpc.MaxCallSendMsgSize(liveMaxMessageBytes+1024*1024), grpc.MaxCallRecvMsgSize(liveMaxMessageBytes+1024*1024)),
	)
	if err != nil {
		t.Fatal(err)
	}
	defer inputsConn.Close()

	eventID := uuid.NewString()
	validStream := openProcessLog(t, inputsConn, agentID, deviceKey)
	if err := validStream.Send(&plugins.Log{
		Id:         eventID,
		DataType:   "windows",
		DataSource: "pilot-live-ingress",
		Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
		Raw:        `{"event":"pilot-live-identity","host":"pilot-live-ingress"}`,
	}); err != nil {
		t.Fatalf("valid identity send: %v", err)
	}
	ack, err := validStream.Recv()
	if err != nil || ack.GetLastId() != eventID {
		t.Fatalf("valid identity ack: ack=%v err=%v", ack, err)
	}
	_ = validStream.CloseSend()

	forgedStream := openProcessLog(t, inputsConn, agentID, deviceKey)
	sendErr := forgedStream.Send(&plugins.Log{
		Id:         uuid.NewString(),
		TenantId:   "999999",
		DataType:   "windows",
		DataSource: "pilot-live-ingress",
		Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
		Raw:        `{"event":"forged-tenant"}`,
	})
	if sendErr == nil {
		_, sendErr = forgedStream.Recv()
	}
	_ = forgedStream.CloseSend()
	if sendErr == nil {
		t.Fatal("forged tenant was accepted")
	}
	if code := status.Code(sendErr); code != codes.PermissionDenied && code != codes.InvalidArgument && code != codes.FailedPrecondition {
		t.Fatalf("forged tenant rejected with %s, want permission/identity failure: %v", code, sendErr)
	}

	oversizeStream := openProcessLog(t, inputsConn, agentID, deviceKey)
	oversizeErr := oversizeStream.Send(&plugins.Log{
		Id:         uuid.NewString(),
		DataType:   "windows",
		DataSource: "pilot-live-ingress",
		Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
		Raw:        strings.Repeat("A", liveMaxMessageBytes+1024),
	})
	if oversizeErr == nil {
		_, oversizeErr = oversizeStream.Recv()
	}
	_ = oversizeStream.CloseSend()
	if oversizeErr == nil {
		t.Fatal("oversized payload was accepted")
	}

	rateStream := openProcessLog(t, inputsConn, agentID, deviceKey)
	sawRetryAfter := false
	for i := 0; i < 50; i++ {
		err := rateStream.Send(&plugins.Log{
			Id:         uuid.NewString(),
			DataType:   "windows",
			DataSource: "pilot-live-ingress",
			Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
			Raw:        `{"event":"rate-limit"}`,
		})
		if err == nil {
			_, err = rateStream.Recv()
		}
		if err == nil {
			continue
		}
		if status.Code(err) == codes.ResourceExhausted && hasRetryAfter(rateStream, err) {
			sawRetryAfter = true
			break
		}
		t.Fatalf("rate-limit message %d: %v", i, err)
	}
	_ = rateStream.CloseSend()
	if !sawRetryAfter {
		t.Fatal("expected ResourceExhausted with retry-after after connector burst")
	}

	adminCtx, adminCancel := context.WithTimeout(metadata.AppendToOutgoingContext(context.Background(), "internal-key", internalKey), 10*time.Second)
	defer adminCancel()
	if _, err := manager.RevokeAgentCredential(adminCtx, &AgentCredentialRequest{
		AgentId: agentID, TenantId: 1, Actor: "codex-live", Reason: "live ingress revocation check",
	}); err != nil {
		t.Fatalf("revoke credential: %v", err)
	}
	t.Log("waiting for authorization projection to drop the revoked connector")
	time.Sleep(22 * time.Second)
	revokedStream, openErr := plugins.NewIntegrationClient(inputsConn).ProcessLog(metadata.AppendToOutgoingContext(context.Background(),
		"key", deviceKey,
		"id", strconv.FormatUint(uint64(agentID), 10),
		"type", "agent",
	))
	if openErr != nil {
		if status.Code(openErr) != codes.PermissionDenied && status.Code(openErr) != codes.Unauthenticated {
			t.Fatalf("revoked credential stream open: %v", openErr)
		}
	} else {
		revokedErr := revokedStream.Send(&plugins.Log{
			Id:         uuid.NewString(),
			DataType:   "windows",
			DataSource: "pilot-live-ingress",
			Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
			Raw:        `{"event":"revoked"}`,
		})
		if revokedErr == nil {
			_, revokedErr = revokedStream.Recv()
		}
		_ = revokedStream.CloseSend()
		if status.Code(revokedErr) != codes.PermissionDenied && status.Code(revokedErr) != codes.Unauthenticated {
			t.Fatalf("revoked credential was not denied: %v", revokedErr)
		}
	}

	if os.Getenv("HA_LIVE_EVENT_ID_FILE") != "" {
		if err := os.WriteFile(os.Getenv("HA_LIVE_EVENT_ID_FILE"), []byte(eventID), 0o600); err != nil {
			t.Fatalf("write event id: %v", err)
		}
	}
}

func openProcessLog(t *testing.T, conn *grpc.ClientConn, agentID uint32, deviceKey string) plugins.Integration_ProcessLogClient {
	t.Helper()
	ctx := metadata.AppendToOutgoingContext(context.Background(),
		"key", deviceKey,
		"id", strconv.FormatUint(uint64(agentID), 10),
		"type", "agent",
	)
	stream, err := plugins.NewIntegrationClient(conn).ProcessLog(ctx)
	if err != nil {
		t.Fatalf("open ProcessLog: %v", err)
	}
	return stream
}

func hasRetryAfter(stream plugins.Integration_ProcessLogClient, err error) bool {
	if strings.Contains(strings.ToLower(err.Error()), "retry-after") {
		return true
	}
	if md, mdErr := stream.Header(); mdErr == nil && len(md.Get("retry-after")) > 0 {
		return true
	}
	if md := stream.Trailer(); len(md.Get("retry-after")) > 0 {
		return true
	}
	return false
}

func getenvDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
