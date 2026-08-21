package platform

import (
	"context"

	"github.com/hivearmor/sdk/plugins"
)

// CollectorConfig holds paths for log collection.
type CollectorConfig struct {
	LogsPath    string
	LogFileName string
}

// Collector is the interface that platform collectors must implement.
type Collector interface {
	Name() string
	Start(ctx context.Context, queue chan<- *plugins.Log)
	Stop()
}
