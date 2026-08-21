package main

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	kafka "github.com/segmentio/kafka-go"
	"github.com/threatwinds/go-sdk/plugins"
)

func TestBuildRawEventMessageCreatesVersionedEnvelope(t *testing.T) {
	observedAt := "2026-08-14T05:30:00.123456789Z"
	receivedAt := time.Date(2026, 8, 14, 5, 30, 1, 0, time.UTC)
	log := &plugins.Log{
		Id:         "event-001",
		TenantId:   "42",
		DataType:   "windows-etw",
		DataSource: "agent-001",
		Timestamp:  observedAt,
		Raw:        `{"event":"powershell"}`,
	}
	identity := &ConnectorIdentity{Type: "agent", ID: 1, ConnectorID: "agent-uuid-001", TenantID: 42}

	message, err := buildRawEventMessage(log, identity, receivedAt)
	if err != nil {
		t.Fatalf("buildRawEventMessage returned error: %v", err)
	}
	if got, want := string(message.Key), "42:agent-uuid-001"; got != want {
		t.Fatalf("message key = %q, want %q", got, want)
	}

	var envelope rawEventEnvelope
	if err := json.Unmarshal(message.Value, &envelope); err != nil {
		t.Fatalf("unmarshal envelope: %v", err)
	}
	if envelope.SchemaVersion != rawEventSchemaV1 {
		t.Fatalf("schemaVersion = %q, want %q", envelope.SchemaVersion, rawEventSchemaV1)
	}
	if envelope.EventID != log.Id || envelope.TenantID != log.TenantId {
		t.Fatalf("envelope identity does not match payload: %#v", envelope)
	}
	if envelope.ObservedAt != observedAt || envelope.ReceivedAt != receivedAt.Format(time.RFC3339Nano) {
		t.Fatalf("unexpected timestamps: observed=%q received=%q", envelope.ObservedAt, envelope.ReceivedAt)
	}
	if envelope.Payload == nil || envelope.Payload.Id != log.Id {
		t.Fatal("payload was not preserved in envelope")
	}

	headers := map[string]string{}
	for _, header := range message.Headers {
		headers[header.Key] = string(header.Value)
	}
	if headers["ha-schema-version"] != rawEventSchemaV1 {
		t.Fatalf("schema header = %q", headers["ha-schema-version"])
	}
	if headers["ha-tenant-id"] != log.TenantId || headers["ha-event-id"] != log.Id {
		t.Fatalf("identity headers do not match payload: %#v", headers)
	}
	if headers["ha-connector-id"] != identity.ConnectorID || headers["ha-connector-type"] != identity.Type {
		t.Fatalf("connector headers do not match identity: %#v", headers)
	}
	if envelope.Source.ConnectorID != identity.ConnectorID || envelope.Source.ConnectorType != identity.Type {
		t.Fatalf("envelope source identity = %#v", envelope.Source)
	}
}

func TestBuildRawEventMessageRejectsIncompleteIdentity(t *testing.T) {
	tests := []struct {
		name     string
		log      *plugins.Log
		identity *ConnectorIdentity
	}{
		{name: "nil payload", log: nil, identity: &ConnectorIdentity{Type: "agent", ConnectorID: "id", TenantID: 1}},
		{name: "missing event id", log: &plugins.Log{TenantId: "1", DataType: "windows", DataSource: "agent", Timestamp: time.Now().UTC().Format(time.RFC3339Nano)}, identity: &ConnectorIdentity{Type: "agent", ConnectorID: "id", TenantID: 1}},
		{name: "missing tenant", log: &plugins.Log{Id: "event", DataType: "windows", DataSource: "agent", Timestamp: time.Now().UTC().Format(time.RFC3339Nano)}, identity: &ConnectorIdentity{Type: "agent", ConnectorID: "id", TenantID: 1}},
		{name: "invalid timestamp", log: &plugins.Log{Id: "event", TenantId: "1", DataType: "windows", DataSource: "agent", Timestamp: "not-a-time"}, identity: &ConnectorIdentity{Type: "agent", ConnectorID: "id", TenantID: 1}},
		{name: "missing connector identity", log: &plugins.Log{Id: "event", TenantId: "1", DataType: "windows", DataSource: "agent", Timestamp: time.Now().UTC().Format(time.RFC3339Nano)}, identity: nil},
		{name: "forged tenant", log: &plugins.Log{Id: "event", TenantId: "99", DataType: "windows", DataSource: "agent", Timestamp: time.Now().UTC().Format(time.RFC3339Nano)}, identity: &ConnectorIdentity{Type: "agent", ConnectorID: "id", TenantID: 1}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := buildRawEventMessage(test.log, test.identity, time.Now().UTC()); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}

type failingPublisher struct{}

func (failingPublisher) WriteMessages(context.Context, ...kafka.Message) error {
	return errors.New("broker unavailable")
}

func TestPublishWithBackoffReturnsBrokerErrorWithoutSocketFallback(t *testing.T) {
	origAttempts := kafkaRetryAttempts
	origBackoff := kafkaRetryInitial
	kafkaRetryAttempts = 2
	kafkaRetryInitial = 0
	t.Cleanup(func() {
		kafkaRetryAttempts = origAttempts
		kafkaRetryInitial = origBackoff
	})

	log := &plugins.Log{
		Id:         "event-001",
		TenantId:   "42",
		DataType:   "windows",
		DataSource: "agent-001",
		Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
		Raw:        `{"event":"powershell"}`,
	}
	identity := &ConnectorIdentity{Type: "agent", ConnectorID: "agent-uuid-001", TenantID: 42}
	err := publishWithBackoff(failingPublisher{}, log, identity)
	if err == nil {
		t.Fatal("expected broker error")
	}
	if !strings.Contains(err.Error(), "broker unavailable") {
		t.Fatalf("error = %v, want broker unavailable", err)
	}
}

func TestKafkaMaxMessageBytesMatchesIngressCap(t *testing.T) {
	if maxRawEventBytes != 4*1024*1024 {
		t.Fatalf("maxRawEventBytes = %d, want 4 MiB", maxRawEventBytes)
	}
}
