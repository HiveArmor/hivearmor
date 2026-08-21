package agent

import (
	"context"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// TestLiveEnrollmentReplay is opt-in because it targets the production-shaped
// local stack. It proves that a one-use token has exactly one winner under a
// concurrent replay and that revocation immediately invalidates the issued key.
func TestLiveEnrollmentReplay(t *testing.T) {
	if os.Getenv("HA_RUN_ENROLLMENT_LIVE") != "1" {
		t.Skip("set HA_RUN_ENROLLMENT_LIVE=1 for the local-stack acceptance test")
	}
	token := readProtectedTestSecret(t, os.Getenv("HA_ENROLLMENT_TOKEN_FILE"))
	internalKey := readProtectedTestSecret(t, os.Getenv("HA_INTERNAL_KEY_FILE"))
	caPath := os.Getenv("HA_GRPC_CA_FILE")
	serverName := os.Getenv("HA_GRPC_SERVER_NAME")
	if serverName == "" {
		serverName = "localhost"
	}
	address := os.Getenv("HA_GRPC_ADDRESS")
	if address == "" {
		address = "127.0.0.1:9000"
	}
	credentials, err := credentials.NewClientTLSFromFile(caPath, serverName)
	if err != nil {
		t.Fatal(err)
	}
	connection, err := grpc.NewClient(address, grpc.WithTransportCredentials(credentials))
	if err != nil {
		t.Fatal(err)
	}
	defer connection.Close()
	client := NewAgentServiceClient(connection)

	type result struct {
		response *AuthResponse
		err      error
	}
	results := make(chan result, 2)
	var start sync.WaitGroup
	start.Add(1)
	for index := 0; index < 2; index++ {
		go func(index int) {
			start.Wait()
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			ctx = metadata.AppendToOutgoingContext(ctx, "enrollment-token", token)
			response, err := client.RegisterAgent(ctx, &AgentRequest{
				Ip: "192.0.2.10", Hostname: "pilot-enrollment-lifecycle", Os: "linux",
				Platform: "linux", Version: "acceptance", RegisterBy: "codex-acceptance",
				Mac: "02:00:00:00:00:01",
			})
			results <- result{response: response, err: err}
		}(index)
	}
	start.Done()

	var winner *AuthResponse
	failures := 0
	for index := 0; index < 2; index++ {
		result := <-results
		if result.err == nil {
			if winner != nil {
				t.Fatal("one-use token produced multiple successful enrollments")
			}
			winner = result.response
			continue
		}
		if code := status.Code(result.err); code != codes.PermissionDenied {
			t.Fatalf("replay failed with %s, want PermissionDenied: %v", code, result.err)
		}
		failures++
	}
	if winner == nil || failures != 1 || winner.GetKey() == "" {
		t.Fatalf("unexpected concurrent outcome: winner=%v failures=%d", winner != nil, failures)
	}

	forgedCtx := metadata.AppendToOutgoingContext(context.Background(), "key", winner.GetKey(), "id", "4294967294", "type", "agent")
	if _, err := client.UpdateAgent(forgedCtx, &AgentRequest{Version: "forged"}); status.Code(err) != codes.PermissionDenied {
		t.Fatalf("forged agent identity was not rejected: %v", err)
	}

	adminCtx := metadata.AppendToOutgoingContext(context.Background(), "internal-key", internalKey)
	rotation, err := client.RotateAgentCredential(adminCtx, &AgentCredentialRequest{
		AgentId: winner.GetId(), TenantId: 1, Actor: "codex-acceptance", Reason: "live acceptance credential rotation check",
	})
	if err != nil || rotation.GetKey() == "" {
		t.Fatalf("rotate credential: response=%v err=%v", rotation != nil, err)
	}
	oldCtx := metadata.AppendToOutgoingContext(context.Background(), "key", winner.GetKey(), "id", uintToString(winner.GetId()), "type", "agent")
	if _, err := client.UpdateAgent(oldCtx, &AgentRequest{Version: "old-after-rotation"}); status.Code(err) != codes.PermissionDenied {
		t.Fatalf("old rotated credential was not rejected: %v", err)
	}
	rotatedCtx := metadata.AppendToOutgoingContext(context.Background(), "key", rotation.GetKey(), "id", uintToString(winner.GetId()), "type", "agent")
	validated, err := client.UpdateAgent(rotatedCtx, &AgentRequest{Version: "rotated"})
	if err != nil || validated.GetKey() != "" {
		t.Fatalf("rotated credential validation failed or credential was echoed: keyEchoed=%v err=%v", validated != nil && validated.GetKey() != "", err)
	}
	if _, err := client.RevokeAgentCredential(adminCtx, &AgentCredentialRequest{
		AgentId: winner.GetId(), TenantId: 1, Actor: "codex-acceptance", Reason: "live acceptance revocation check",
	}); err != nil {
		t.Fatalf("revoke credential: %v", err)
	}
	revokedCtx := metadata.AppendToOutgoingContext(context.Background(), "key", rotation.GetKey(), "id", uintToString(winner.GetId()), "type", "agent")
	if _, err := client.UpdateAgent(revokedCtx, &AgentRequest{Version: "revoked"}); status.Code(err) != codes.PermissionDenied {
		t.Fatalf("revoked credential was not rejected: %v", err)
	}

	reenrollment, err := client.CreateEnrollmentToken(adminCtx, &CreateEnrollmentTokenRequest{
		TenantId: 1, PolicyId: "pilot-linux", Platform: "linux", CreatedBy: "codex-acceptance",
		ExpiresAt: timestamppb.New(time.Now().UTC().Add(10 * time.Minute)), MaxUses: 1,
	})
	if err != nil || reenrollment.GetToken() == "" {
		t.Fatalf("create authorized re-enrollment token: response=%v err=%v", reenrollment != nil, err)
	}
	reenrollCtx := metadata.AppendToOutgoingContext(context.Background(), "enrollment-token", reenrollment.GetToken())
	replacement, err := client.RegisterAgent(reenrollCtx, &AgentRequest{
		Ip: "192.0.2.11", Hostname: "pilot-enrollment-lifecycle", Os: "linux", Platform: "linux",
		Version: "acceptance-reenroll", RegisterBy: "codex-acceptance", Mac: "02:00:00:00:00:01",
	})
	if err != nil || replacement.GetId() == winner.GetId() || replacement.GetKey() == "" {
		t.Fatalf("authorized re-enrollment failed: replacement=%v err=%v", replacement, err)
	}
	replacementCtx := metadata.AppendToOutgoingContext(context.Background(), "key", replacement.GetKey(), "id", uintToString(replacement.GetId()), "type", "agent")
	if _, err := client.UpdateAgent(replacementCtx, &AgentRequest{Version: "replacement-reconnected"}); err != nil {
		t.Fatalf("replacement reconnect failed: %v", err)
	}
	if _, err := client.RevokeAgentCredential(adminCtx, &AgentCredentialRequest{
		AgentId: replacement.GetId(), TenantId: 1, Actor: "codex-acceptance", Reason: "acceptance replacement cleanup",
	}); err != nil {
		t.Fatalf("revoke replacement credential during cleanup: %v", err)
	}

	audit, err := client.ListEnrollmentAuditEvents(adminCtx, &ListEnrollmentAuditEventsRequest{
		TenantId: 1, PageSize: 100,
	})
	if err != nil {
		t.Fatalf("list enrollment audit: %v", err)
	}
	consumed, rotated, revoked, replacementConsumed := false, false, false, false
	for _, event := range audit.GetRows() {
		if event.GetAgentId() == winner.GetId() {
			switch event.GetEventType() {
			case auditTokenConsumed:
				consumed = true
			case auditCredentialRotated:
				rotated = true
			case auditCredentialRevoked:
				revoked = true
			}
		}
		if event.GetAgentId() == replacement.GetId() && event.GetEventType() == auditTokenConsumed {
			replacementConsumed = true
		}
	}
	if !consumed || !rotated || !revoked || !replacementConsumed {
		t.Fatalf("required append-only audit events missing: consumed=%v rotated=%v revoked=%v replacementConsumed=%v", consumed, rotated, revoked, replacementConsumed)
	}
}

func readProtectedTestSecret(t *testing.T, path string) string {
	t.Helper()
	if path == "" {
		t.Fatal("protected secret file path is required")
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm()&0o077 != 0 {
		t.Fatal("secret file permissions are broader than 0600")
	}
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	value := strings.TrimSpace(string(content))
	if value == "" {
		t.Fatal("secret file is empty")
	}
	return value
}

func uintToString(value uint32) string {
	const digits = "0123456789"
	if value == 0 {
		return "0"
	}
	buffer := make([]byte, 0, 10)
	for value > 0 {
		buffer = append(buffer, digits[value%10])
		value /= 10
	}
	for left, right := 0, len(buffer)-1; left < right; left, right = left+1, right-1 {
		buffer[left], buffer[right] = buffer[right], buffer[left]
	}
	return string(buffer)
}
