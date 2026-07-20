package main

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"time"

	kafka "github.com/segmentio/kafka-go"
	"github.com/threatwinds/go-sdk/catcher"
	"github.com/threatwinds/go-sdk/plugins"
)

const kafkaTopic = "hivearmor.raw.events"

func newKafkaWriter() *kafka.Writer {
	brokers := strings.Split(os.Getenv("KAFKA_BROKER"), ",")
	return &kafka.Writer{
		Addr:            kafka.TCP(brokers...),
		Topic:           kafkaTopic,
		Balancer:        &kafka.LeastBytes{},
		BatchSize:       100,
		BatchTimeout:    5 * time.Millisecond,
		MaxAttempts:     5,
		WriteBackoffMax: 1 * time.Second,
		RequiredAcks:    kafka.RequireOne,
	}
}

// kafkaSendLog is the Kafka-path equivalent of sendLog. One goroutine per CPU
// core reads from localLogsChannel, publishes to Kafka, and falls back to the
// unix socket when Kafka is unavailable.
func kafkaSendLog(writer *kafka.Writer) {
	for {
		entry := <-localLogsChannel
		if err := publishToKafka(writer, entry.log); err != nil {
			_ = catcher.Error("kafka publish failed, falling back to socket", err, map[string]any{
				"process": "plugin_com.hivearmor.inputs",
				"lastId":  entry.log.Id,
			})
			entry.result <- sendViaSocket(entry.log)
		} else {
			entry.result <- nil
		}
	}
}

func publishToKafka(writer *kafka.Writer, log *plugins.Log) error {
	payload, err := json.Marshal(log)
	if err != nil {
		return err
	}
	return writer.WriteMessages(context.Background(), kafka.Message{
		Key:   []byte(log.DataType + ":" + log.DataSource),
		Value: payload,
	})
}
