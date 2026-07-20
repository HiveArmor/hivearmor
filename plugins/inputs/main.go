package main

import (
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/hivearmor/plugins/inputs/otlp"
	"github.com/threatwinds/go-sdk/catcher"
	"github.com/threatwinds/go-sdk/plugins"
	"github.com/threatwinds/go-sdk/utils"
)

// kafkaBroker returns the configured broker list, or "" if Kafka is not set up.
func kafkaBroker() string { return os.Getenv("KAFKA_BROKER") }

const defaultTenant string = "ce66672c-e36d-4761-a8c8-90058fee1a24"

var localLogsChannel chan *logEntry

func main() {
	mode := plugins.GetCfg("plugin_com.hivearmor.inputs").Env.Mode
	if mode != "worker" {
		return
	}

	CheckAgentManagerHealth()

	autService := NewLogAuthService()
	go func() {
		autService.SyncAuth()
	}()

	middlewares := NewMiddlewares(autService)

	// Retry logic for loading certificates
	maxRetries := 3
	retryDelay := 2 * time.Second
	var cert, key string
	var err error

	for retry := 0; retry < maxRetries; retry++ {
		cert, key, err = loadCerts()
		if err == nil {
			break
		}

		_ = catcher.Error("cannot load certificates, retrying", err, map[string]any{
			"process":    "plugin_com.hivearmor.inputs",
			"retry":      retry + 1,
			"maxRetries": maxRetries,
		})

		if retry < maxRetries-1 {
			time.Sleep(retryDelay)
			// Increase delay for next retry
			retryDelay *= 2
		} else {
			// If all retries failed, log the error and return
			_ = catcher.Error("all retries failed when loading certificates", err, map[string]any{"process": "plugin_com.hivearmor.inputs"})
			return
		}
	}

	cpu := runtime.NumCPU()

	localLogsChannel = make(chan *logEntry, cpu*100)

	if broker := kafkaBroker(); broker != "" {
		writer := newKafkaWriter()
		for i := 0; i < cpu; i++ {
			go kafkaSendLog(writer)
		}
	} else {
		for i := 0; i < cpu; i++ {
			go sendLog()
		}
	}

	otlpPort := 4317
	if p := os.Getenv("OTLP_PORT"); p != "" {
		if parsed, err := strconv.Atoi(p); err == nil {
			otlpPort = parsed
		}
	}
	go func() {
		if err := otlp.StartOtlpReceiver(otlpPort, publishOtlpEvent); err != nil {
			_ = catcher.Error("OTLP receiver exited", err, map[string]any{"process": "plugin_com.hivearmor.inputs"})
		}
	}()

	go startHTTPServer(middlewares, cert, key)
	_ = startGRPCServer(middlewares, cert, key)
}

// publishOtlpEvent converts a JSON-encoded otlp.LogEvent to plugins.Log and
// enqueues it on localLogsChannel. Returns an error if the channel is full.
func publishOtlpEvent(payload []byte) error {
	var ev otlp.LogEvent
	if err := json.Unmarshal(payload, &ev); err != nil {
		return fmt.Errorf("otlp: unmarshal event: %w", err)
	}

	l := &plugins.Log{
		Id:         uuid.New().String(),
		TenantId:   defaultTenant,
		DataType:   ev.DataType,
		DataSource: ev.DataSource,
		Timestamp:  ev.Timestamp,
		Raw:        ev.Raw,
	}
	if l.DataType == "" {
		l.DataType = "OTLP"
	}
	if l.DataSource == "" {
		l.DataSource = "otlp"
	}
	if l.Timestamp == "" {
		l.Timestamp = time.Now().UTC().Format(time.RFC3339Nano)
	}

	entry := &logEntry{log: l, result: make(chan error, 1)}

	select {
	case localLogsChannel <- entry:
	default:
		return fmt.Errorf("otlp: input channel full, dropping event %s", l.Id)
	}

	return <-entry.result
}

func loadCerts() (string, string, error) {
	certsFolderPath := plugins.PluginCfg("com.hivearmor").Get("certsFolder").String()

	certsFolder, err := utils.MkdirJoin(certsFolderPath)
	if err != nil {
		return "", "", fmt.Errorf("cannot create certificates directory: %v", err)
	}

	certPath := certsFolder.FileJoin(utmCertFileName)
	keyPath := certsFolder.FileJoin(utmCertFileKey)

	if _, err := os.Stat(certPath); os.IsNotExist(err) {
		return "", "", fmt.Errorf("certificate file does not exist: %s", certPath)
	}

	if _, err := os.Stat(keyPath); os.IsNotExist(err) {
		return "", "", fmt.Errorf("key file does not exist: %s", keyPath)
	}

	return certPath, keyPath, nil
}
