package config

import (
	"os"
	"strconv"
	"strings"
)

var (
	KafkaBroker        = getEnv("KAFKA_BROKER", "localhost:9092")
	KafkaConsumerGroup = getEnv("KAFKA_CONSUMER_GROUP", "hivearmor-entity-graph")
	KafkaWorkers       = getEnvInt("KAFKA_WORKERS", 4)
	KafkaTopic         = getEnv("KAFKA_TOPIC", "hivearmor.processed.events")

	Neo4jURI      = getEnv("NEO4J_URI", "bolt://localhost:7687")
	Neo4jUser     = getEnv("NEO4J_USER", "neo4j")
	Neo4jPassword = getEnv("NEO4J_PASSWORD", "localdev123!")
)

func KafkaBrokers() []string {
	return strings.Split(KafkaBroker, ",")
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func getEnvInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}
