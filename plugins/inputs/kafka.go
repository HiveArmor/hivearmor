package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	kafka "github.com/segmentio/kafka-go"
	"github.com/threatwinds/go-sdk/catcher"
	"github.com/threatwinds/go-sdk/plugins"
)

const (
	kafkaTopic          = "hivearmor.raw.events"
	rawEventSchemaV1    = "ha.raw-event.v1"
	rawEventContentType = "application/vnd.hivearmor.raw-event+json"
	inputsProducerName  = "com.hivearmor.inputs"
	maxRawEventBytes    = 4 * 1024 * 1024
)

var (
	kafkaRetryAttempts = 5
	kafkaRetryInitial  = 100 * time.Millisecond
)

type kafkaPublisher interface {
	WriteMessages(ctx context.Context, msgs ...kafka.Message) error
}

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

func newKafkaWriter() *kafka.Writer {
	brokers := strings.Split(os.Getenv("KAFKA_BROKER"), ",")
	return &kafka.Writer{
		Addr:                   kafka.TCP(brokers...),
		Topic:                  kafkaTopic,
		Balancer:               &kafka.LeastBytes{},
		BatchSize:              100,
		BatchBytes:             maxRawEventBytes,
		BatchTimeout:           5 * time.Millisecond,
		MaxAttempts:            5,
		WriteBackoffMax:        1 * time.Second,
		RequiredAcks:           kafka.RequireAll,
		Async:                  false,
		AllowAutoTopicCreation: false,
	}
}

// kafkaSendLog is the Kafka-path equivalent of sendLog. One goroutine per CPU
// core reads from localLogsChannel and publishes to Kafka. When Kafka is
// configured it is the only production path: broker failures return to the
// caller after exponential backoff so the agent keeps the unprocessed spool row.
func kafkaSendLog(writer *kafka.Writer) {
	for {
		entry := <-localLogsChannel
		if err := publishWithBackoff(writer, entry.log, entry.identity); err != nil {
			_ = catcher.Error("kafka publish failed; engine socket fallback is disabled", err, map[string]any{
				"process": "plugin_com.hivearmor.inputs",
				"lastId":  entry.log.Id,
			})
			entry.result <- err
		} else {
			entry.result <- nil
		}
	}
}

func publishWithBackoff(publisher kafkaPublisher, log *plugins.Log, identity *ConnectorIdentity) error {
	var last error
	backoff := kafkaRetryInitial
	for attempt := 0; attempt < kafkaRetryAttempts; attempt++ {
		last = publishToKafka(publisher, log, identity)
		if last == nil {
			return nil
		}
		if attempt < kafkaRetryAttempts-1 && backoff > 0 {
			time.Sleep(backoff)
			backoff *= 2
			if backoff > 5*time.Second {
				backoff = 5 * time.Second
			}
		}
	}
	return last
}

func publishToKafka(publisher kafkaPublisher, log *plugins.Log, identity *ConnectorIdentity) error {
	message, err := buildRawEventMessage(log, identity, time.Now().UTC())
	if err != nil {
		return err
	}
	return publisher.WriteMessages(context.Background(), message)
}

func buildRawEventMessage(log *plugins.Log, identity *ConnectorIdentity, receivedAt time.Time) (kafka.Message, error) {
	if log == nil {
		return kafka.Message{}, fmt.Errorf("raw event payload is nil")
	}
	if identity == nil || strings.TrimSpace(identity.ConnectorID) == "" || identity.TenantID <= 0 {
		return kafka.Message{}, fmt.Errorf("raw event connector identity is required")
	}
	if strings.TrimSpace(log.Id) == "" {
		return kafka.Message{}, fmt.Errorf("raw event id is required")
	}
	if strings.TrimSpace(log.TenantId) == "" {
		return kafka.Message{}, fmt.Errorf("raw event tenant id is required")
	}
	if log.TenantId != identity.TenantString() {
		return kafka.Message{}, fmt.Errorf("raw event tenant does not match authenticated identity")
	}
	if strings.TrimSpace(log.DataType) == "" || strings.TrimSpace(log.DataSource) == "" {
		return kafka.Message{}, fmt.Errorf("raw event data type and data source are required")
	}
	if _, err := time.Parse(time.RFC3339Nano, log.Timestamp); err != nil {
		return kafka.Message{}, fmt.Errorf("raw event timestamp must be RFC3339: %w", err)
	}

	producerVersion := strings.TrimSpace(os.Getenv("HIVEARMOR_VERSION"))
	if producerVersion == "" {
		producerVersion = "development"
	}

	envelope := rawEventEnvelope{
		SchemaVersion: rawEventSchemaV1,
		EventID:       log.Id,
		TenantID:      log.TenantId,
		ObservedAt:    log.Timestamp,
		ReceivedAt:    receivedAt.Format(time.RFC3339Nano),
		Source: rawEventSource{
			ConnectorType: identity.Type,
			ConnectorID:   identity.ConnectorID,
			DataType:      log.DataType,
			DataSource:    log.DataSource,
		},
		Producer: rawEventProducer{
			Name:    inputsProducerName,
			Version: producerVersion,
		},
		Payload: log,
	}
	payload, err := json.Marshal(envelope)
	if err != nil {
		return kafka.Message{}, fmt.Errorf("marshal raw event envelope: %w", err)
	}

	return kafka.Message{
		Key:   []byte(log.TenantId + ":" + identity.ConnectorID),
		Value: payload,
		Headers: []kafka.Header{
			{Key: "content-type", Value: []byte(rawEventContentType)},
			{Key: "ha-schema-version", Value: []byte(rawEventSchemaV1)},
			{Key: "ha-event-id", Value: []byte(log.Id)},
			{Key: "ha-tenant-id", Value: []byte(log.TenantId)},
			{Key: "ha-connector-id", Value: []byte(identity.ConnectorID)},
			{Key: "ha-connector-type", Value: []byte(identity.Type)},
			{Key: "ha-producer", Value: []byte(inputsProducerName)},
		},
	}, nil
}
