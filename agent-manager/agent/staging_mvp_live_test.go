package agent

import (
	"context"
	"os"
	"strconv"
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

// TestStagingMvpPilot is opt-in staging ACC-04/05/06/10/11 ingest.
// It does not call /v1/inject. Secrets are read from 0600 files.
func TestStagingMvpPilot(t *testing.T) {
	if os.Getenv("HA_RUN_STAGING_MVP") != "1" {
		t.Skip("set HA_RUN_STAGING_MVP=1 for staging ACC ingest")
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
	inputsCA := getenvDefault("HA_INPUTS_CA_FILE", caPath)
	inputsName := getenvDefault("HA_INPUTS_SERVER_NAME", serverName)
	inputsTLS, err := credentials.NewClientTLSFromFile(inputsCA, inputsName)
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
		Ip: "192.0.2.81", Hostname: "pilot-staging-mvp-" + suffix, Os: "linux",
		Platform: "linux", Version: "staging-mvp", RegisterBy: "staging-acc",
		Mac: "02:00:00:00:00:81",
	})
	if err != nil || registered.GetId() == 0 || registered.GetKey() == "" {
		t.Fatalf("register agent: id=%d err=%v", registered.GetId(), err)
	}
	agentID := registered.GetId()
	deviceKey := registered.GetKey()

	inputsConn, err := grpc.NewClient(inputsAddr, grpc.WithTransportCredentials(inputsTLS))
	if err != nil {
		t.Fatal(err)
	}
	defer inputsConn.Close()

	posID := uuid.NewString()
	negID := uuid.NewString()

	posStream := openProcessLog(t, inputsConn, agentID, deviceKey)
	if err := posStream.Send(&plugins.Log{
		Id:         posID,
		DataType:   "linux",
		DataSource: "pilot-staging-mvp",
		Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
		Raw:        "sshd[1204]: Failed password for root from 203.0.113.10 port 22 ssh2",
	}); err != nil {
		t.Fatalf("positive send: %v", err)
	}
	ack, err := posStream.Recv()
	if err != nil || ack.GetLastId() != posID {
		t.Fatalf("positive ack: ack=%v err=%v", ack, err)
	}
	_ = posStream.CloseSend()

	negStream := openProcessLog(t, inputsConn, agentID, deviceKey)
	if err := negStream.Send(&plugins.Log{
		Id:         negID,
		DataType:   "linux",
		DataSource: "pilot-staging-mvp",
		Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
		Raw:        "sshd[1204]: Accepted password for alice from 10.0.0.8 port 22 ssh2",
	}); err != nil {
		t.Fatalf("negative send: %v", err)
	}
	nack, err := negStream.Recv()
	if err != nil || nack.GetLastId() != negID {
		t.Fatalf("negative ack: ack=%v err=%v", nack, err)
	}
	_ = negStream.CloseSend()

	forgedStream := openProcessLog(t, inputsConn, agentID, deviceKey)
	sendErr := forgedStream.Send(&plugins.Log{
		Id:         uuid.NewString(),
		TenantId:   "999999",
		DataType:   "linux",
		DataSource: "pilot-staging-mvp",
		Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
		Raw:        "sshd[1]: Failed password for forged from 192.0.2.9 port 22 ssh2",
	})
	if sendErr == nil {
		_, sendErr = forgedStream.Recv()
	}
	_ = forgedStream.CloseSend()
	if sendErr == nil {
		t.Fatal("forged tenant was accepted")
	}
	if code := status.Code(sendErr); code != codes.PermissionDenied && code != codes.InvalidArgument && code != codes.FailedPrecondition {
		t.Fatalf("forged tenant rejected with %s: %v", code, sendErr)
	}

	adminCtx, adminCancel := context.WithTimeout(metadata.AppendToOutgoingContext(context.Background(), "internal-key", internalKey), 10*time.Second)
	defer adminCancel()
	if _, err := manager.RevokeAgentCredential(adminCtx, &AgentCredentialRequest{
		AgentId: agentID, TenantId: 1, Actor: "staging-acc", Reason: "staging ACC-11 revocation",
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
			DataType:   "linux",
			DataSource: "pilot-staging-mvp",
			Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
			Raw:        "sshd[1]: Failed password for revoked from 192.0.2.9 port 22 ssh2",
		})
		if revokedErr == nil {
			_, revokedErr = revokedStream.Recv()
		}
		_ = revokedStream.CloseSend()
		if status.Code(revokedErr) != codes.PermissionDenied && status.Code(revokedErr) != codes.Unauthenticated {
			t.Fatalf("revoked credential was not denied: %v", revokedErr)
		}
	}

	writeSecretFile(t, os.Getenv("HA_LIVE_EVENT_ID_FILE"), posID)
	writeSecretFile(t, os.Getenv("HA_LIVE_NEG_EVENT_ID_FILE"), negID)
}

func writeSecretFile(t *testing.T, path, value string) {
	t.Helper()
	if path == "" {
		return
	}
	if err := os.WriteFile(path, []byte(value), 0o600); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
