package main

import (
	"context"
	"time"

	"github.com/threatwinds/go-sdk/catcher"
	"github.com/hivearmor/plugins/compliance-orchestrator/client"
)

func waitForBackend(bc *client.BackendClient) error {
	delay := 2 * time.Second
	for attempt := 1; ; attempt++ {
		err := bc.HealthCheck(context.Background())
		if err == nil {
			catcher.Info("Connected to Backend", map[string]any{
				"process": "compliance-orchestrator",
			})
			return nil
		}
		catcher.Error("Cannot connect to Backend, retrying", err, map[string]any{
			"attempt": attempt,
			"wait":    delay.String(),
		})
		time.Sleep(delay)
		if delay < 60*time.Second {
			delay *= 2
		}
	}
}

func waitForOpenSearch() error {
	delay := 2 * time.Second
	for attempt := 1; ; attempt++ {
		err := client.ConnectOpenSearch()
		if err == nil {
			catcher.Info("Connected to OpenSearch", map[string]any{
				"process": "compliance-orchestrator",
			})
			return nil
		}
		catcher.Error("Cannot connect to OpenSearch, retrying", err, map[string]any{
			"attempt": attempt,
			"wait":    delay.String(),
		})
		time.Sleep(delay)
		if delay < 60*time.Second {
			delay *= 2
		}
	}
}

func bootstrap() *client.BackendClient {
	backend := client.NewBackendClient()
	waitForBackend(backend)
	waitForOpenSearch()
	return backend
}
