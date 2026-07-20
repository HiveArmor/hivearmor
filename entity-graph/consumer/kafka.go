package consumer

import (
	"context"
	"encoding/json"
	"log"
	"time"

	kafka "github.com/segmentio/kafka-go"

	"github.com/hivearmor/entity-graph/extractor"
	graphneo4j "github.com/hivearmor/entity-graph/neo4j"
)

// Config holds consumer parameters.
type Config struct {
	Brokers []string
	GroupID string
	Topic   string
}

// StartWorker runs a single Kafka consumer goroutine. It reads processed events,
// extracts entities, and upserts them into Neo4j. Offsets are committed only
// after a successful Neo4j write (at-least-once; restart causes re-delivery but
// never silent loss).
func StartWorker(ctx context.Context, cfg Config, client *graphneo4j.Client) {
	r := kafka.NewReader(kafka.ReaderConfig{
		Brokers:     cfg.Brokers,
		Topic:       cfg.Topic,
		GroupID:     cfg.GroupID,
		MinBytes:    1,
		MaxBytes:    10e6, // 10 MB
		MaxWait:     250 * time.Millisecond,
		StartOffset: kafka.FirstOffset,
		// CommitInterval=0 disables auto-commit; offsets committed manually below.
	})
	defer r.Close()

	for {
		msg, err := r.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("entity-graph consumer: fetch error: %v", err)
			time.Sleep(500 * time.Millisecond)
			continue
		}

		var event map[string]any
		if err := json.Unmarshal(msg.Value, &event); err != nil {
			log.Printf("entity-graph consumer: parse error (skipping offset %d): %v", msg.Offset, err)
			_ = r.CommitMessages(ctx, msg)
			continue
		}

		entities := extractor.ExtractFromEvent(event)
		if err := upsertAll(ctx, client, entities); err != nil {
			// Don't commit — the broker will redeliver on restart.
			log.Printf("entity-graph consumer: neo4j write error (offset not committed): %v", err)
			continue
		}

		if err := r.CommitMessages(ctx, msg); err != nil {
			log.Printf("entity-graph consumer: commit error: %v", err)
		}
	}
}

func upsertAll(ctx context.Context, client *graphneo4j.Client, entities extractor.ExtractedEntities) error {
	for _, ip := range entities.IPs {
		if err := client.UpsertIP(ctx, ip); err != nil {
			return err
		}
	}
	for _, h := range entities.Hosts {
		if err := client.UpsertHost(ctx, h); err != nil {
			return err
		}
	}
	for _, u := range entities.Users {
		if err := client.UpsertUser(ctx, u); err != nil {
			return err
		}
	}
	for _, p := range entities.Processes {
		if err := client.UpsertProcess(ctx, p); err != nil {
			return err
		}
	}
	for _, f := range entities.Files {
		if err := client.UpsertFile(ctx, f); err != nil {
			return err
		}
	}
	for _, d := range entities.Domains {
		if err := client.UpsertDomain(ctx, d); err != nil {
			return err
		}
	}

	// Build relationships between co-occurring users/hosts and hosts/IPs.
	ts := time.Now().UTC()
	for _, u := range entities.Users {
		for _, h := range entities.Hosts {
			if err := client.CreateLoginRelationship(ctx, u.Username, h.Hostname, ts); err != nil {
				return err
			}
		}
	}
	for _, h := range entities.Hosts {
		for _, ip := range entities.IPs {
			if err := client.CreateCommunicatedWith(ctx, h.Hostname, ip.Address, ts); err != nil {
				return err
			}
		}
	}

	// Alert-specific enrichment.
	if entities.Alert != nil {
		if err := client.LinkAlertToEntities(ctx, *entities.Alert); err != nil {
			return err
		}
		if err := client.UpdateRiskScores(ctx, *entities.Alert); err != nil {
			return err
		}
	}

	return nil
}
