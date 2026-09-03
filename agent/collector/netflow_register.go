//go:build !nonetflow

package collector

import (
	"context"

	"github.com/hivearmor/agent/agent"
	"github.com/hivearmor/agent/collector/netflow"
)

// registerNetflowCollector starts the netflow UDP listener (default builds).
// Exclude from slim flavors with -tags nonetflow (see DEP-SIZE-01).
func registerNetflowCollector(ctx context.Context, active *[]Collector) {
	nf := netflow.New()
	*active = append(*active, nf)
	go runCollector(ctx, nf, agent.LogQueue)
}
