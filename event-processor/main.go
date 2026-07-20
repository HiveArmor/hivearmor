package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/hivearmor/event-processor/compliance"
	"github.com/hivearmor/event-processor/config"
	"github.com/hivearmor/event-processor/enrichment"
	"github.com/hivearmor/event-processor/enterprise/baseline"
	"github.com/hivearmor/event-processor/enterprise/graph"
	"github.com/hivearmor/event-processor/enterprise/lookup"
	"github.com/hivearmor/event-processor/enterprise/offense"
	"github.com/hivearmor/event-processor/enterprise/risk"
	enginegrpc "github.com/hivearmor/event-processor/grpc"
	enginehttp "github.com/hivearmor/event-processor/http"
	enginekafka "github.com/hivearmor/event-processor/kafka"
	"github.com/hivearmor/event-processor/pipeline"
	"github.com/hivearmor/event-processor/rules"
	"github.com/hivearmor/event-processor/writer"
	"github.com/threatwinds/go-sdk/plugins"
	sdkos "github.com/threatwinds/go-sdk/os"
)

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	workDir := config.WorkDir
	osURL := config.OpenSearchURL()
	osUser := config.OpenSearchUser
	osPass := config.OpenSearchPass

	// OpenSearch singleton connection
	if err := sdkos.Connect([]string{osURL}, osUser, osPass); err != nil {
		log.Printf("warn: OpenSearch connect failed: %v — continuing without SDK bulk writer", err)
	}

	// Pipeline filter loader
	filterDir := filepath.Join(workDir, "pipeline", "filters")
	mkdirAll(filterDir)
	pipeline.Init(filterDir)

	// Rule loader
	rulesDir := filepath.Join(workDir, "rules")
	mkdirAll(rulesDir)
	rules.Init(rulesDir)
	rules.InitEngine(osURL, osUser, osPass)

	// Enrichment
	enrichment.SetGeoDir(filepath.Join(workDir, "geolocation"))
	enrichment.InitGeo()
	enrichment.InitFeeds(osURL, osUser, osPass)
	enrichment.InitGraph(osURL, osUser, osPass)

	// Writers
	writer.InitEventWriter()
	writer.InitAlertWriter(osURL, osUser, osPass)

	// Compliance evaluator
	compliance.InitWriter(osURL, osUser, osPass)
	compliance.Init(config.BackendURL, config.InternalKey)

	// Enterprise features
	lookup.Init(osURL, osUser, osPass)
	baseline.Init(osURL, osUser, osPass)
	offense.Init(osURL, osUser, osPass)
	risk.Init(func(alert *plugins.Alert) {
		writer.WriteAlert(alert)
		offense.Process(alert)
	})
	rules.SetAddScoreFn(risk.AddScore)

	// Graph offense evaluator — runs Cypher kill-chain queries against Neo4j
	if config.Neo4jEnabled == "true" {
		graphRules := rules.GraphOffenseRules()
		if len(graphRules) > 0 {
			graphEval := graph.New(
				config.Neo4jURI,
				config.Neo4jUser,
				config.Neo4jPassword,
				func(alert *plugins.Alert) {
					writer.WriteAlert(alert)
					offense.Process(alert)
				},
				graphRules,
			)
			go graphEval.Start(ctx)
		} else {
			log.Printf("NEO4J_ENABLED=true but no graph_offense rules found in %s", filepath.Join(config.WorkDir, "rules"))
		}
	}

	// Input: Kafka consumer (primary) or legacy gRPC unix socket (fallback)
	if config.KafkaEnabled == "true" {
		if config.KafkaBroker == "" {
			log.Fatal("KAFKA_ENABLED=true but KAFKA_BROKER is not set")
		}
		brokers := strings.Split(config.KafkaBroker, ",")
		wcfg := enginekafka.ConsumerConfig{
			Brokers: brokers,
			GroupID: config.KafkaConsumerGroup,
			OSUrl:   osURL,
			OSUser:  osUser,
			OSPass:  osPass,
		}
		for i := 0; i < config.KafkaWorkers; i++ {
			go enginekafka.StartWorker(ctx, wcfg)
		}
		log.Printf("Kafka consumer started | brokers=%s group=%s workers=%d topic=hivearmor.raw.events",
			config.KafkaBroker, config.KafkaConsumerGroup, config.KafkaWorkers)
	} else {
		if err := enginegrpc.StartEngineSocket(workDir, config.SocketSecret); err != nil {
			log.Printf("warn: engine socket: %v", err)
		}
		log.Printf("Using legacy gRPC socket input (KAFKA_ENABLED not set)")
	}

	// gRPC — modules-config server on :9003
	if err := enginegrpc.StartModulesGRPC(); err != nil {
		log.Printf("warn: modules gRPC: %v", err)
	}

	// HTTP servers
	enginehttp.StartPublicServer()  // :8000 — backend API
	enginehttp.StartIngestServer()  // :8090 — test inject endpoint

	fmt.Printf("HiveArmor event-processor started | workDir=%s | OS=%s\n", workDir, osURL)

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	fmt.Println("shutting down")
}

func mkdirAll(dir string) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		log.Printf("warn: mkdirAll %s: %v", dir, err)
	}
}
