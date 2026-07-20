package main

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"time"

	kafka "github.com/segmentio/kafka-go"
	"github.com/threatwinds/go-sdk/plugins"
)

const kafkaTopic = "hivearmor.raw.events"

// gcpKafkaWriter is initialized in main() when KAFKA_BROKER is set.
// Nil means Kafka is not configured; fall back to plugins.EnqueueLog.
var gcpKafkaWriter *kafka.Writer

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
