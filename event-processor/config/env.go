package config

import (
	"fmt"
	"os"
	"strconv"
)

var (
	WorkDir = getEnv("WORK_DIR", "/workdir")

	OpenSearchHost = getEnv("OPENSEARCH_HOST", "localhost")
	OpenSearchPort = getEnv("OPENSEARCH_PORT", "9200")
	OpenSearchUser = getEnv("OPENSEARCH_USER", "admin")
	OpenSearchPass = getEnv("OPENSEARCH_PASSWORD", "LocalDev@2024!")

	PostgresHost = getEnv("POSTGRESQL_HOST", "localhost")
	PostgresPort = getEnv("POSTGRESQL_PORT", "5432")
	PostgresUser = getEnv("POSTGRESQL_USER", "postgres")
	PostgresPass = getEnv("POSTGRESQL_PASSWORD", "localdev123!")
	PostgresDB   = getEnv("POSTGRESQL_DB", "hivearmor")

	BackendURL     = getEnv("BACKEND_URL", "http://localhost:8088")
	InternalKey    = getEnv("INTERNAL_KEY", "local-dev-internal-key-do-not-use-in-prod-12345678")
	InjectAPIKey   = getEnv("EVENTPROCESSOR_INJECT_KEY", "")
	Mode           = getEnv("MODE", "manager")
	NodeName       = getEnv("NODE_NAME", "manager")
	SocketSecret   = getEnv("INPUTS_SOCKET_SECRET", "change-me-in-production")

	KafkaEnabled       = getEnv("KAFKA_ENABLED", "false")
	KafkaBroker        = getEnv("KAFKA_BROKER", "")
	KafkaConsumerGroup = getEnv("KAFKA_CONSUMER_GROUP", "hivearmor-event-processor")
	KafkaWorkers       = getEnvInt("KAFKA_WORKERS", 12)

	Neo4jEnabled  = getEnv("NEO4J_ENABLED", "false")
	Neo4jURI      = getEnv("NEO4J_URI", "bolt://localhost:7687")
	Neo4jUser     = getEnv("NEO4J_USER", "neo4j")
	Neo4jPassword = getEnv("NEO4J_PASSWORD", "")
)

func OpenSearchURL() string {
	return fmt.Sprintf("https://%s:%s", OpenSearchHost, OpenSearchPort)
}

func PostgresDSN() string {
	return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		PostgresHost, PostgresPort, PostgresUser, PostgresPass, PostgresDB)
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
