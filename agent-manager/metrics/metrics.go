package metrics

import (
	"net/http"
	"sync/atomic"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/threatwinds/go-sdk/catcher"
)

var (
	ConnectedAgents = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "agent_manager_connected_agents_count",
		Help: "Number of agents with active gRPC streams",
	})

	ConnectedCollectors = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "agent_manager_connected_collectors_count",
		Help: "Number of collectors with active gRPC streams",
	})

	LogsReceived = promauto.NewCounter(prometheus.CounterOpts{
		Name: "agent_manager_logs_received_total",
		Help: "Total number of ping/log events received from agents and collectors",
	})

	LogsPerSecond = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "agent_manager_logs_per_second",
		Help: "Rolling 1-second rate of logs received (updated every second)",
	})

	// logsLastSecond tracks events received in the current 1-second window.
	logsLastSecond atomic.Int64
)

// IncLogs records one received log/ping event.
func IncLogs() {
	LogsReceived.Inc()
	logsLastSecond.Add(1)
}

// StartMetricsServer starts the Prometheus /metrics HTTP endpoint on :9090.
func StartMetricsServer() {
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	server := &http.Server{
		Addr:         ":9090",
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	catcher.Info("Starting metrics server on :9090", map[string]any{"process": "agent-manager"})
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		catcher.Error("metrics server error", err, map[string]any{"process": "agent-manager"})
	}
}

// TrackLogsPerSecond maintains the logs_per_second gauge. Run in a goroutine.
func TrackLogsPerSecond() {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for range ticker.C {
		count := logsLastSecond.Swap(0)
		LogsPerSecond.Set(float64(count))
	}
}
