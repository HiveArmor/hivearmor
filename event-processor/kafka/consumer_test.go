package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/hivearmor/sdk/plugins"
	kafkago "github.com/segmentio/kafka-go"
)

func TestParseMessageAcceptsVersionedEnvelope(t *testing.T) {
	logEvent := &plugins.Log{
		Id:         "event-001",
		TenantId:   "tenant-001",
		DataType:   "windows-etw",
		DataSource: "agent-001",
		Timestamp:  "2026-08-14T05:30:00.123456789Z",
		Raw:        `{"event":"powershell"}`,
	}
	envelope := rawEventEnvelope{
		SchemaVersion: rawEventSchemaV1,
		EventID:       logEvent.Id,
		TenantID:      logEvent.TenantId,
		ObservedAt:    logEvent.Timestamp,
		ReceivedAt:    time.Date(2026, 8, 14, 5, 30, 1, 0, time.UTC).Format(time.RFC3339Nano),
		Source: rawEventSource{
			ConnectorType: "agent",
			ConnectorID:   "agent-uuid-001",
			DataType:      logEvent.DataType,
			DataSource:    logEvent.DataSource,
		},
		Producer: rawEventProducer{Name: "com.hivearmor.inputs", Version: "test"},
		Payload:  logEvent,
	}
	payload, err := json.Marshal(envelope)
	if err != nil {
		t.Fatal(err)
	}

	got, legacy, err := parseMessage(kafkago.Message{
		Value: payload,
		Headers: []kafkago.Header{
			{Key: "ha-schema-version", Value: []byte(rawEventSchemaV1)},
			{Key: "ha-event-id", Value: []byte(logEvent.Id)},
			{Key: "ha-tenant-id", Value: []byte(logEvent.TenantId)},
		},
	})
	if err != nil {
		t.Fatalf("parseMessage returned error: %v", err)
	}
	if legacy {
		t.Fatal("versioned envelope was marked legacy")
	}
	if got.Id != logEvent.Id || got.TenantId != logEvent.TenantId || got.Raw != logEvent.Raw {
		t.Fatalf("decoded log mismatch: %#v", got)
	}
}

func TestParseMessageAcceptsLegacyPayloadForCompatibility(t *testing.T) {
	legacy := &plugins.Log{
		Id:         "legacy-event",
		TenantId:   "tenant-001",
		DataType:   "windows",
		DataSource: "agent-001",
		Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
	}
	payload, err := json.Marshal(legacy)
	if err != nil {
		t.Fatal(err)
	}

	got, isLegacy, err := parseMessage(kafkago.Message{Value: payload})
	if err != nil {
		t.Fatalf("parseMessage returned error: %v", err)
	}
	if !isLegacy || got.Id != legacy.Id {
		t.Fatalf("legacy compatibility mismatch: legacy=%v log=%#v", isLegacy, got)
	}
}

func TestParseMessageRejectsEnvelopeIdentityMismatch(t *testing.T) {
	logEvent := &plugins.Log{
		Id:         "event-001",
		TenantId:   "tenant-001",
		DataType:   "windows",
		DataSource: "agent-001",
		Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
	}
	envelope := rawEventEnvelope{
		SchemaVersion: rawEventSchemaV1,
		EventID:       logEvent.Id,
		TenantID:      "forged-tenant",
		ObservedAt:    logEvent.Timestamp,
		ReceivedAt:    time.Now().UTC().Format(time.RFC3339Nano),
		Source:        rawEventSource{ConnectorType: "agent", ConnectorID: "agent-uuid-001", DataType: logEvent.DataType, DataSource: logEvent.DataSource},
		Producer:      rawEventProducer{Name: "com.hivearmor.inputs", Version: "test"},
		Payload:       logEvent,
	}
	payload, err := json.Marshal(envelope)
	if err != nil {
		t.Fatal(err)
	}

	if _, _, err := parseMessage(kafkago.Message{Value: payload}); err == nil {
		t.Fatal("expected mismatched tenant identity to be rejected")
	}
}

func TestParseMessageRejectsMissingConnectorIdentity(t *testing.T) {
	logEvent := &plugins.Log{
		Id:         "event-001",
		TenantId:   "42",
		DataType:   "windows",
		DataSource: "agent-001",
		Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
	}
	envelope := rawEventEnvelope{
		SchemaVersion: rawEventSchemaV1,
		EventID:       logEvent.Id,
		TenantID:      logEvent.TenantId,
		ObservedAt:    logEvent.Timestamp,
		ReceivedAt:    time.Now().UTC().Format(time.RFC3339Nano),
		Source:        rawEventSource{DataType: logEvent.DataType, DataSource: logEvent.DataSource},
		Producer:      rawEventProducer{Name: "com.hivearmor.inputs", Version: "test"},
		Payload:       logEvent,
	}
	payload, err := json.Marshal(envelope)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := parseMessage(kafkago.Message{Value: payload}); err == nil {
		t.Fatal("expected missing connector identity to be rejected")
	}
}

func TestParseMessageRejectsSchemaDowngrade(t *testing.T) {
	legacy := &plugins.Log{
		Id:         "legacy-event",
		TenantId:   "tenant-001",
		DataType:   "windows",
		DataSource: "agent-001",
		Timestamp:  time.Now().UTC().Format(time.RFC3339Nano),
	}
	payload, err := json.Marshal(legacy)
	if err != nil {
		t.Fatal(err)
	}

	_, _, err = parseMessage(kafkago.Message{
		Value:   payload,
		Headers: []kafkago.Header{{Key: "ha-schema-version", Value: []byte(rawEventSchemaV1)}},
	})
	if err == nil {
		t.Fatal("expected declared schema without envelope to be rejected")
	}
}

func TestBuildQuarantineMessageKeepsPayloadAndRedactsReason(t *testing.T) {
	original := kafkago.Message{
		Topic: topic,
		Key:   []byte("42:agent-uuid-001"),
		Value: []byte(`{"schemaVersion":"nope","raw":"do-not-put-this-in-reason"}`),
		Headers: []kafkago.Header{
			{Key: "ha-event-id", Value: []byte("event-001")},
		},
	}
	longErr := fmt.Errorf("invalid payload: %s", strings.Repeat("x", 400))
	got := buildQuarantineMessage(original, longErr)
	if got.Topic != "" {
		t.Fatalf("message topic = %q, want empty so the dedicated writer topic is used", got.Topic)
	}
	if string(got.Key) != string(original.Key) || string(got.Value) != string(original.Value) {
		t.Fatal("quarantine record must preserve original key and body")
	}
	reason := headerValue(got.Headers, "ha-quarantine-reason")
	if reason == "" || len(reason) > maxReasonBytes {
		t.Fatalf("reason length = %d", len(reason))
	}
	if strings.Contains(reason, "do-not-put-this-in-reason") {
		t.Fatal("quarantine reason leaked original payload")
	}
	if headerValue(got.Headers, "ha-original-topic") != topic {
		t.Fatal("missing original topic provenance")
	}
}

type failingQuarantine struct{}

func (failingQuarantine) WriteMessages(context.Context, ...kafkago.Message) error {
	return fmt.Errorf("quarantine broker unavailable")
}

func TestPublishParseFailureDoesNotDropWhenQuarantineFails(t *testing.T) {
	err := publishParseFailure(context.Background(), failingQuarantine{}, kafkago.Message{Value: []byte("{")}, fmt.Errorf("invalid payload"))
	if err == nil {
		t.Fatal("expected quarantine write error so the original offset stays uncommitted")
	}
}
