package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	kafka "github.com/segmentio/kafka-go"
	"github.com/threatwinds/go-sdk/plugins"

	"github.com/hivearmor/event-processor/processor"
	"github.com/hivearmor/event-processor/writer"
)

const (
	topic        = "hivearmor.raw.events"
	defaultGroup = "hivearmor-event-processor"
)

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
// The offset is committed only after the event is durably written to OpenSearch
// (at-least-once: restart → re-delivery/duplicate, never silent data loss).
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
		MaxBytes:    10e6, // 10 MB
		MaxWait:     250 * time.Millisecond,
		StartOffset: kafka.LastOffset,
		// CommitInterval=0 disables auto-commit; we commit manually after
		// the event is durably written to OpenSearch.
	})
	defer r.Close()

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

		logMsg, err := parseMessage(msg.Value)
		if err != nil {
			// Malformed message — commit immediately so we don't loop forever.
			// TODO S09: route to dead-letter topic.
			log.Printf("kafka: parse error (skipping): %v", err)
			_ = r.CommitMessages(ctx, msg)
			continue
		}

		// Run the full correlation pipeline (enrich, correlate, write alerts).
		// Returns the produced event (nil if the log was filtered/dropped by the pipeline).
		event := processor.ProcessLog(logMsg)

		if event != nil {
			// Write the raw event directly to OpenSearch (bypasses BulkQueue so the
			// write is durable before the Kafka offset is committed).
			if err := writer.WriteEventSync(event, cfg.OSUrl, cfg.OSUser, cfg.OSPass); err != nil {
				// Do not commit — broker will redeliver on restart.
				// TODO S09: dead-letter after N failures.
				log.Printf("kafka: event write error (offset not committed): %v", err)
				continue
			}
		}

		if err := r.CommitMessages(ctx, msg); err != nil {
			log.Printf("kafka: commit error: %v", err)
		}
	}
}

func parseMessage(payload []byte) (*plugins.Log, error) {
	var l plugins.Log
	if err := json.Unmarshal(payload, &l); err != nil {
		return nil, fmt.Errorf("invalid payload: %w", err)
	}
	return &l, nil
}
