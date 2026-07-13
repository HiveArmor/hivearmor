//go:build integration

package main_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

func TestComplianceOrchestratorHealth(t *testing.T) {
	time.Sleep(2 * time.Second)

	resp, err := http.Get("http://localhost:8094/health")
	if err != nil {
		t.Fatalf("Health endpoint not reachable: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Health endpoint returned %d, want 200", resp.StatusCode)
	}

	var payload map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatalf("Failed to decode health response: %v", err)
	}

	if status, ok := payload["status"].(string); !ok || status != "ok" {
		t.Errorf("Expected status=ok, got %v", payload["status"])
	}
}
