package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync/atomic"
	"time"

	"github.com/hivearmor/sdk/plugins"
	kafka "github.com/segmentio/kafka-go"

	"github.com/hivearmor/event-processor/processor"
	"github.com/hivearmor/event-processor/writer"
)

const (
	topic            = "hivearmor.raw.events"
	quarantineTopic  = "hivearmor.raw.events.quarantine"
	retryTopic       = "hivearmor.raw.events.retry"
	defaultGroup     = "hivearmor-event-processor"
	rawEventSchemaV1 = "ha.raw-event.v1"
	maxMessageBytes  = 4 * 1024 * 1024
	maxReasonBytes   = 200
)

type quarantinePublisher interface {
	WriteMessages(ctx context.Context, msgs ...kafka.Message) error
}

var legacyMessages atomic.Uint64

type rawEventEnvelope struct {
	SchemaVersion string           `json:"schemaVersion"`
	EventID       string           `json:"eventId"`
	TenantID      string           `json:"tenantId"`
	ObservedAt    string           `json:"observedAt"`
	ReceivedAt    string           `json:"receivedAt"`
	Source        rawEventSource   `json:"source"`
	Producer      rawEventProducer `json:"producer"`
	TraceID       string           `json:"traceId,omitempty"`
	Payload       *plugins.Log     `json:"payload"`
}

type rawEventSource struct {
	ConnectorType string `json:"connectorType,omitempty"`
	ConnectorID   string `json:"connectorId,omitempty"`
	DataType      string `json:"dataType"`
	DataSource    string `json:"dataSource"`
}

type rawEventProducer struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// ConsumerConfig holds all parameters needed to create a consumer worker.
type ConsumerConfig struct {
	Brokers []string
	GroupID string
	OSUrl   string
	OSUser  string
	OSPass  string
}

// StartWorker spawns a single consumer goroutine that owns its own kafka.Reader.
// Each worker gets a dedicated reader in the same consumer group; Kafka assigns ~one
// partition per reader, so there is no shared-reader commit race between goroutines.
// The offset is committed only after the normalized event and every required alert
// are durably written to OpenSearch (at-least-once: restart → re-delivery/duplicate,
// never silent data loss). Optional offense/compliance/sequence work runs after persist
// and does not block commit.
func StartWorker(ctx context.Context, cfg ConsumerConfig) {
	groupID := cfg.GroupID
	if groupID == "" {
		groupID = defaultGroup
	}
	r := kafka.NewReader(kafka.ReaderConfig{
		Brokers:     cfg.Brokers,
		Topic:       topic,
		GroupID:     groupID,
		MinBytes:    1,
		MaxBytes:    maxMessageBytes + 1024*1024,
		MaxWait:     250 * time.Millisecond,
		StartOffset: kafka.LastOffset,
		// CommitInterval=0 disables auto-commit; we commit manually after
		// the event is durably written to OpenSearch.
	})
	defer r.Close()
	quarantine := newQuarantineWriter(cfg.Brokers)
	defer quarantine.Close()

	for {
		msg, err := r.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("kafka: fetch error: %v", err)
			time.Sleep(500 * time.Millisecond)
			continue
		}

		logMsg, legacy, err := parseMessage(msg)
		if err != nil {
			if qErr := publishParseFailure(ctx, quarantine, msg, err); qErr != nil {
				log.Printf("kafka: quarantine write failed (offset not committed): %v parse=%s", qErr, redactQuarantineReason(err))
				continue
			}
			log.Printf("kafka: parse error quarantined: %s", redactQuarantineReason(err))
			_ = r.CommitMessages(ctx, msg)
			continue
		}
		if legacy {
			count := legacyMessages.Add(1)
			if count == 1 || count%1000 == 0 {
				log.Printf("kafka: deprecated legacy raw-event payload accepted count=%d successor=%s", count, rawEventSchemaV1)
			}
		}

		outcome := processor.Analyze(logMsg)
		store := writer.OpenSearchStore{URL: cfg.OSUrl, User: cfg.OSUser, Pass: cfg.OSPass}
		if err := processor.PersistRequired(outcome, store); err != nil {
			log.Printf("kafka: required persist failed (offset not committed): %v", err)
			continue
		}
		processor.RunOptionalSideEffects(outcome)

		if err := r.CommitMessages(ctx, msg); err != nil {
			log.Printf("kafka: commit error: %v", err)
		}
	}
}

func newQuarantineWriter(brokers []string) *kafka.Writer {
	return &kafka.Writer{
		Addr:                   kafka.TCP(brokers...),
		Topic:                  quarantineTopic,
		Balancer:               &kafka.LeastBytes{},
		RequiredAcks:           kafka.RequireAll,
		Async:                  false,
		AllowAutoTopicCreation: false,
		BatchBytes:             maxMessageBytes,
		BatchTimeout:           5 * time.Millisecond,
		MaxAttempts:            5,
	}
}

func publishParseFailure(ctx context.Context, publisher quarantinePublisher, msg kafka.Message, parseErr error) error {
	if publisher == nil {
		return fmt.Errorf("quarantine publisher is required")
	}
	return publisher.WriteMessages(ctx, buildQuarantineMessage(msg, parseErr))
}

func buildQuarantineMessage(original kafka.Message, parseErr error) kafka.Message {
	headers := make([]kafka.Header, 0, len(original.Headers)+3)
	headers = append(headers, original.Headers...)
	headers = append(headers,
		kafka.Header{Key: "ha-quarantine-reason", Value: []byte(redactQuarantineReason(parseErr))},
		kafka.Header{Key: "ha-original-topic", Value: []byte(topic)},
		kafka.Header{Key: "ha-retry-topic", Value: []byte(retryTopic)},
	)
	return kafka.Message{
		// Topic is owned by newQuarantineWriter. kafka-go rejects messages that
		// also set Topic when the writer already has one.
		Key:     original.Key,
		Value:   original.Value,
		Headers: headers,
	}
}

func redactQuarantineReason(err error) string {
	if err == nil {
		return "unknown parse failure"
	}
	reason := strings.ReplaceAll(err.Error(), "\n", " ")
	if len(reason) > maxReasonBytes {
		reason = reason[:maxReasonBytes]
	}
	return reason
}

func parseMessage(message kafka.Message) (*plugins.Log, bool, error) {
	declaredSchema := headerValue(message.Headers, "ha-schema-version")

	var marker struct {
		SchemaVersion string `json:"schemaVersion"`
	}
	if err := json.Unmarshal(message.Value, &marker); err != nil {
		return nil, false, fmt.Errorf("invalid payload: %w", err)
	}

	if marker.SchemaVersion == "" {
		if declaredSchema != "" {
			return nil, false, fmt.Errorf("schema header %q present but payload has no schemaVersion", declaredSchema)
		}
		var legacy plugins.Log
		if err := json.Unmarshal(message.Value, &legacy); err != nil {
			return nil, false, fmt.Errorf("invalid legacy payload: %w", err)
		}
		if err := validateLogIdentity(&legacy); err != nil {
			return nil, false, fmt.Errorf("invalid legacy payload: %w", err)
		}
		return &legacy, true, nil
	}

	if marker.SchemaVersion != rawEventSchemaV1 {
		return nil, false, fmt.Errorf("unsupported raw event schema %q", marker.SchemaVersion)
	}
	if declaredSchema != "" && declaredSchema != marker.SchemaVersion {
		return nil, false, fmt.Errorf("schema header %q does not match payload %q", declaredSchema, marker.SchemaVersion)
	}

	var envelope rawEventEnvelope
	if err := json.Unmarshal(message.Value, &envelope); err != nil {
		return nil, false, fmt.Errorf("invalid %s envelope: %w", rawEventSchemaV1, err)
	}
	if err := validateEnvelope(&envelope, message.Headers); err != nil {
		return nil, false, fmt.Errorf("invalid %s envelope: %w", rawEventSchemaV1, err)
	}
	return envelope.Payload, false, nil
}

func validateEnvelope(envelope *rawEventEnvelope, headers []kafka.Header) error {
	if envelope == nil || envelope.Payload == nil {
		return fmt.Errorf("payload is required")
	}
	if strings.TrimSpace(envelope.EventID) == "" || strings.TrimSpace(envelope.TenantID) == "" {
		return fmt.Errorf("eventId and tenantId are required")
	}
	if envelope.EventID != envelope.Payload.Id || envelope.TenantID != envelope.Payload.TenantId {
		return fmt.Errorf("envelope identity does not match payload")
	}
	if envelope.Source.DataType != envelope.Payload.DataType || envelope.Source.DataSource != envelope.Payload.DataSource {
		return fmt.Errorf("envelope source does not match payload")
	}
	if _, err := time.Parse(time.RFC3339Nano, envelope.ObservedAt); err != nil {
		return fmt.Errorf("observedAt must be RFC3339: %w", err)
	}
	if _, err := time.Parse(time.RFC3339Nano, envelope.ReceivedAt); err != nil {
		return fmt.Errorf("receivedAt must be RFC3339: %w", err)
	}
	if envelope.ObservedAt != envelope.Payload.Timestamp {
		return fmt.Errorf("observedAt does not match payload timestamp")
	}
	if strings.TrimSpace(envelope.Producer.Name) == "" || strings.TrimSpace(envelope.Producer.Version) == "" {
		return fmt.Errorf("producer name and version are required")
	}
	if strings.TrimSpace(envelope.Source.ConnectorType) == "" || strings.TrimSpace(envelope.Source.ConnectorID) == "" {
		return fmt.Errorf("connector identity is required")
	}
	if headerConnectorID := headerValue(headers, "ha-connector-id"); headerConnectorID != "" && headerConnectorID != envelope.Source.ConnectorID {
		return fmt.Errorf("connector header does not match envelope")
	}
	if headerConnectorType := headerValue(headers, "ha-connector-type"); headerConnectorType != "" && headerConnectorType != envelope.Source.ConnectorType {
		return fmt.Errorf("connector type header does not match envelope")
	}
	if err := validateLogIdentity(envelope.Payload); err != nil {
		return err
	}

	if headerEventID := headerValue(headers, "ha-event-id"); headerEventID != "" && headerEventID != envelope.EventID {
		return fmt.Errorf("event header does not match envelope")
	}
	if headerTenantID := headerValue(headers, "ha-tenant-id"); headerTenantID != "" && headerTenantID != envelope.TenantID {
		return fmt.Errorf("tenant header does not match envelope")
	}
	return nil
}

func validateLogIdentity(logEvent *plugins.Log) error {
	if logEvent == nil {
		return fmt.Errorf("payload is required")
	}
	if strings.TrimSpace(logEvent.Id) == "" || strings.TrimSpace(logEvent.TenantId) == "" {
		return fmt.Errorf("event id and tenant id are required")
	}
	if strings.TrimSpace(logEvent.DataType) == "" || strings.TrimSpace(logEvent.DataSource) == "" {
		return fmt.Errorf("data type and data source are required")
	}
	if _, err := time.Parse(time.RFC3339Nano, logEvent.Timestamp); err != nil {
		return fmt.Errorf("timestamp must be RFC3339: %w", err)
	}
	return nil
}

func headerValue(headers []kafka.Header, key string) string {
	for _, header := range headers {
		if strings.EqualFold(header.Key, key) {
			return string(header.Value)
		}
	}
	return ""
}
