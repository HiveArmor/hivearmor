//go:build nonetflow

package collector

import (
	"context"

	"github.com/hivearmor/agent/utils"
)

// registerNetflowCollector is a no-op when built with -tags nonetflow.
func registerNetflowCollector(_ context.Context, _ *[]Collector) {
	utils.Logger.Info("netflow: omitted from this binary (-tags nonetflow)")
}
