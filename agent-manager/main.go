package main

import (
	"os"
	"time"

	"github.com/threatwinds/go-sdk/catcher"
	"github.com/hivearmor/agent-manager/agent"
	"github.com/hivearmor/agent-manager/database"
	"github.com/hivearmor/agent-manager/metrics"
	"github.com/hivearmor/agent-manager/updates"
)

func main() {
	catcher.Info("Starting Agent Manager", map[string]any{"process": "agent-manager"})

	err := database.MigrateDatabase()
	if err != nil {
		_ = catcher.Error("failed to migrate database", err, map[string]any{"process": "agent-manager"})
		time.Sleep(5 * time.Second)
		os.Exit(1)
	}

	go metrics.StartMetricsServer()
	go metrics.TrackLogsPerSecond()
	go updates.InitUpdatesManager()
	agent.InitGrpcServer()
}
