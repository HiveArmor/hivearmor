package agent

import (
	"context"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/hivearmor/agent/database"
	"github.com/hivearmor/agent/models"
	"github.com/hivearmor/sdk/plugins"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/metadata"
)

const liveBrokerMessageBytes = 4 * 1024 * 1024

// TestLiveBrokerOutageSpool is opt-in. Phase "down" (broker stopped) proves
// Offer persists an unprocessed SQLite row and ProcessLog does not ack.
// Phase "up" (broker restored) resends that row, acks, and marks processed.
func TestLiveBrokerOutageSpool(t *testing.T) {
	if os.Getenv("HA_RUN_BROKER_OUTAGE") != "1" {
		t.Skip("set HA_RUN_BROKER_OUTAGE=1 for the local-stack broker-outage test")
	}
	phase := strings.TrimSpace(os.Getenv("HA_BROKER_OUTAGE_PHASE"))
	switch phase {
	case "down":
		testLiveBrokerOutageDown(t)
	case "up":
		testLiveBrokerOutageUp(t)
	default:
		t.Fatal("HA_BROKER_OUTAGE_PHASE must be down or up")
	}
}

func testLiveBrokerOutageDown(t *testing.T) {
	db := openLiveSpool(t)
	token := readProtectedLiveSecret(t, os.Getenv("HA_ENROLLMENT_TOKEN_FILE"))
	caPath := os.Getenv("HA_GRPC_CA_FILE")
	serverName := getenvLive("HA_GRPC_SERVER_NAME", "localhost")
	managerAddr := getenvLive("HA_GRPC_ADDRESS", "127.0.0.1:9000")
	inputsAddr := getenvLive("HA_INPUTS_ADDRESS", "127.0.0.1:50051")

	tlsCreds, err := credentials.NewClientTLSFromFile(caPath, serverName)
	if err != nil {
		t.Fatal(err)
	}
	managerConn, err := grpc.NewClient(managerAddr, grpc.WithTransportCredentials(tlsCreds))
	if err != nil {
		t.Fatal(err)
	}
	defer managerConn.Close()

	enrollCtx, enrollCancel := context.WithTimeout(metadata.AppendToOutgoingContext(context.Background(), "enrollment-token", token), 15*time.Second)
	defer enrollCancel()
	suffix := strconv.FormatInt(time.Now().UnixNano(), 10)
	registered, err := NewAgentServiceClient(managerConn).RegisterAgent(enrollCtx, &AgentRequest{
		Ip: "192.0.2.81", Hostname: "pilot-broker-outage-" + suffix, Os: "linux",
		Platform: "linux", Version: "broker-outage", RegisterBy: "codex-live",
		Mac: "02:00:00:00:00:81",
	})
	if err != nil || registered.GetId() == 0 || registered.GetKey() == "" {
		t.Fatalf("register agent: id=%d err=%v", registered.GetId(), err)
	}
	writeProtectedLive(t, os.Getenv("HA_AGENT_ID_FILE"), strconv.FormatUint(uint64(registered.GetId()), 10))
	writeProtectedLive(t, os.Getenv("HA_DEVICE_KEY_FILE"), registered.GetKey())

	eventID := uuid.NewString()
	log := &plugins.Log{
		Id:         eventID,
		DataType:   "syslog",
		DataSource: "pilot-broker-outage",
		Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
		Raw:        `sshd[1]: Failed password for invalid user brokeroutage from 192.0.2.81 port 22 ssh2`,
	}
	LogsDropped.Store(0)
	queue := make(chan *plugins.Log, 1)
	Offer(queue, "syslog", log)
	if LogsDropped.Load() != 0 {
		t.Fatalf("LogsDropped = %d during spool, want 0", LogsDropped.Load())
	}
	assertUnprocessed(t, db, eventID)

	inputsConn := dialInputs(t, inputsAddr, tlsCreds)
	defer inputsConn.Close()
	ackErr := sendProcessLog(t, inputsConn, registered.GetId(), registered.GetKey(), log, 90*time.Second)
	if ackErr == nil {
		t.Fatal("ProcessLog was acknowledged while the broker was down")
	}
	if LogsDropped.Load() != 0 {
		t.Fatalf("LogsDropped = %d after failed send, want 0", LogsDropped.Load())
	}
	assertUnprocessed(t, db, eventID)
	writeProtectedLive(t, os.Getenv("HA_LIVE_EVENT_ID_FILE"), eventID)
}

func testLiveBrokerOutageUp(t *testing.T) {
	db := openLiveSpool(t)
	eventID := strings.TrimSpace(readFileRequired(t, os.Getenv("HA_LIVE_EVENT_ID_FILE")))
	agentID, err := strconv.ParseUint(strings.TrimSpace(readFileRequired(t, os.Getenv("HA_AGENT_ID_FILE"))), 10, 32)
	if err != nil {
		t.Fatalf("agent id: %v", err)
	}
	deviceKey := readProtectedLiveSecret(t, os.Getenv("HA_DEVICE_KEY_FILE"))
	caPath := os.Getenv("HA_GRPC_CA_FILE")
	serverName := getenvLive("HA_GRPC_SERVER_NAME", "localhost")
	inputsAddr := getenvLive("HA_INPUTS_ADDRESS", "127.0.0.1:50051")

	assertUnprocessed(t, db, eventID)
	var rows []models.Log
	if err := db.FindUnprocessed(&rows, 10); err != nil {
		t.Fatal(err)
	}
	var spooled models.Log
	for _, row := range rows {
		if row.ID == eventID {
			spooled = row
			break
		}
	}
	if spooled.ID == "" {
		t.Fatal("spool lost the unprocessed event across broker recovery")
	}

	tlsCreds, err := credentials.NewClientTLSFromFile(caPath, serverName)
	if err != nil {
		t.Fatal(err)
	}
	inputsConn := dialInputs(t, inputsAddr, tlsCreds)
	defer inputsConn.Close()

	retryLog := &plugins.Log{
		Id:         spooled.ID,
		Raw:        spooled.Log,
		DataType:   spooled.Type,
		DataSource: spooled.DataSource,
		Timestamp:  spooled.CreatedAt.Format(time.RFC3339Nano),
	}
	var lastErr error
	for attempt := 0; attempt < 8; attempt++ {
		lastErr = sendProcessLog(t, inputsConn, uint32(agentID), deviceKey, retryLog, 45*time.Second)
		if lastErr == nil {
			break
		}
		time.Sleep(2 * time.Second)
	}
	if lastErr != nil {
		t.Fatalf("ProcessLog was not acknowledged after broker restore: %v", lastErr)
	}
	if err := db.Update(&models.Log{}, "id", eventID, "processed", true); err != nil {
		t.Fatalf("mark processed after ack: %v", err)
	}
	var remaining []models.Log
	if err := db.FindUnprocessed(&remaining, 50); err != nil {
		t.Fatal(err)
	}
	for _, row := range remaining {
		if row.ID == eventID {
			t.Fatal("event remained unprocessed after ack")
		}
	}
}

func openLiveSpool(t *testing.T) *database.Database {
	t.Helper()
	path := os.Getenv("HA_SPOOL_DB_PATH")
	if path == "" {
		t.Fatal("HA_SPOOL_DB_PATH is required")
	}
	db, err := database.OpenSQLite(path)
	if err != nil {
		t.Fatalf("open live spool: %v", err)
	}
	database.SetTestDB(db)
	t.Cleanup(func() {
		database.SetTestDB(nil)
		_ = db.Close()
	})
	return db
}

func dialInputs(t *testing.T, addr string, creds credentials.TransportCredentials) *grpc.ClientConn {
	t.Helper()
	conn, err := grpc.NewClient(
		addr,
		grpc.WithTransportCredentials(creds),
		grpc.WithDefaultCallOptions(
			grpc.MaxCallSendMsgSize(liveBrokerMessageBytes+1024*1024),
			grpc.MaxCallRecvMsgSize(liveBrokerMessageBytes+1024*1024),
		),
	)
	if err != nil {
		t.Fatalf("dial inputs: %v", err)
	}
	return conn
}

func sendProcessLog(t *testing.T, conn *grpc.ClientConn, agentID uint32, deviceKey string, log *plugins.Log, timeout time.Duration) error {
	t.Helper()
	ctx, cancel := context.WithTimeout(metadata.AppendToOutgoingContext(context.Background(),
		"key", deviceKey,
		"id", strconv.FormatUint(uint64(agentID), 10),
		"type", "agent",
	), timeout)
	defer cancel()
	stream, err := plugins.NewIntegrationClient(conn).ProcessLog(ctx)
	if err != nil {
		return err
	}
	if err := stream.Send(log); err != nil {
		_ = stream.CloseSend()
		return err
	}
	ack, err := stream.Recv()
	_ = stream.CloseSend()
	if err != nil {
		return err
	}
	if ack.GetLastId() != log.Id {
		t.Fatalf("ack last id = %q, want %q", ack.GetLastId(), log.Id)
	}
	return nil
}

func assertUnprocessed(t *testing.T, db *database.Database, eventID string) {
	t.Helper()
	var rows []models.Log
	if err := db.FindUnprocessed(&rows, 50); err != nil {
		t.Fatal(err)
	}
	for _, row := range rows {
		if row.ID == eventID && !row.Processed {
			return
		}
	}
	t.Fatalf("expected unprocessed spool row %s", eventID)
}

func readProtectedLiveSecret(t *testing.T, path string) string {
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
	return strings.TrimSpace(readFileRequired(t, path))
}

func readFileRequired(t *testing.T, path string) string {
	t.Helper()
	if path == "" {
		t.Fatal("required file path is empty")
	}
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	value := string(content)
	if strings.TrimSpace(value) == "" {
		t.Fatal("required file is empty")
	}
	return value
}

func writeProtectedLive(t *testing.T, path, value string) {
	t.Helper()
	if path == "" {
		t.Fatal("output file path is required")
	}
	if err := os.WriteFile(path, []byte(value), 0o600); err != nil {
		t.Fatal(err)
	}
}

func getenvLive(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
