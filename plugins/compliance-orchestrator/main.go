package main

import (
	"context"
	"encoding/json"
	"net/http"
	"sync/atomic"
	"time"
	"unsafe"

	"github.com/threatwinds/go-sdk/catcher"
	"github.com/hivearmor/plugins/compliance-orchestrator/scheduler"
	"github.com/hivearmor/plugins/compliance-orchestrator/workers"
)

var lastRunPtr unsafe.Pointer

func setLastRun(t time.Time) {
	p := new(time.Time)
	*p = t
	atomic.StorePointer(&lastRunPtr, unsafe.Pointer(p))
}

func getLastRun() *time.Time {
	p := atomic.LoadPointer(&lastRunPtr)
	if p == nil {
		return nil
	}
	t := (*time.Time)(p)
	return t
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	payload := map[string]any{
		"status": "ok",
	}
	if t := getLastRun(); t != nil {
		payload["lastRun"] = t.UTC().Format(time.RFC3339)
	}
	json.NewEncoder(w).Encode(payload)
}

func startHealthServer() {
	http.HandleFunc("/health", healthHandler)
	if err := http.ListenAndServe(":8094", nil); err != nil {
		catcher.Info("Health server exited", map[string]any{"error": err.Error()})
	}
}

func main() {
	catcher.Info("Starting Compliance Orchestrator", map[string]any{
		"process": "compliance-orchestrator",
	})

	backend := bootstrap()

	catcher.Info("Compliance Orchestrator bootstrapped successfully", nil)

	ctx := context.Background()

	go startHealthServer()

	go workers.StartWorkers(ctx, backend)

	go scheduler.StartScheduler(ctx, backend)

	for {
		setLastRun(time.Now())
		time.Sleep(1 * time.Hour)
	}
}
