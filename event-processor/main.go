package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/hivearmor/event-processor/config"
	"github.com/hivearmor/event-processor/enrichment"
	"github.com/hivearmor/event-processor/enterprise/baseline"
	"github.com/hivearmor/event-processor/enterprise/lookup"
	"github.com/hivearmor/event-processor/enterprise/offense"
	"github.com/hivearmor/event-processor/enterprise/risk"
	enginegrpc "github.com/hivearmor/event-processor/grpc"
	enginehttp "github.com/hivearmor/event-processor/http"
	"github.com/hivearmor/event-processor/pipeline"
	"github.com/hivearmor/event-processor/rules"
	"github.com/hivearmor/event-processor/writer"
	"github.com/threatwinds/go-sdk/plugins"
	sdkos "github.com/threatwinds/go-sdk/os"
)

func main() {
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

	// Writers
	writer.InitEventWriter()
	writer.InitAlertWriter(osURL, osUser, osPass)

	// Enterprise features
	lookup.Init(osURL, osUser, osPass)
	baseline.Init(osURL, osUser, osPass)
	offense.Init(osURL, osUser, osPass)
	risk.Init(func(alert *plugins.Alert) {
		writer.WriteAlert(alert)
		offense.Process(alert)
	})

	// gRPC — engine unix socket (receives logs from inputs plugin)
	if err := enginegrpc.StartEngineSocket(workDir, config.SocketSecret); err != nil {
		log.Printf("warn: engine socket: %v", err)
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
