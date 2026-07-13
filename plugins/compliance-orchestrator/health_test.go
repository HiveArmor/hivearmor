package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHealthHandler_StatusOK(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()

	healthHandler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	ct := w.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("expected Content-Type application/json, got %q", ct)
	}

	var payload map[string]any
	if err := json.NewDecoder(w.Body).Decode(&payload); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if payload["status"] != "ok" {
		t.Errorf("expected status=ok, got %v", payload["status"])
	}
}

func TestHealthHandler_NoLastRunBeforeFirstTick(t *testing.T) {
	// Ensure lastRunPtr is nil for this test
	lastRunPtr = nil

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()

	healthHandler(w, req)

	var payload map[string]any
	json.NewDecoder(w.Body).Decode(&payload)

	if _, ok := payload["lastRun"]; ok {
		t.Errorf("expected no lastRun field before first tick, got %v", payload["lastRun"])
	}
}

func TestHealthHandler_LastRunAfterSetLastRun(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Second)
	setLastRun(now)
	t.Cleanup(func() { lastRunPtr = nil })

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()

	healthHandler(w, req)

	var payload map[string]any
	json.NewDecoder(w.Body).Decode(&payload)

	lastRunStr, ok := payload["lastRun"].(string)
	if !ok {
		t.Fatalf("expected lastRun string, got %T", payload["lastRun"])
	}

	parsed, err := time.Parse(time.RFC3339, lastRunStr)
	if err != nil {
		t.Fatalf("lastRun is not a valid RFC3339 timestamp: %v", err)
	}

	if !parsed.Equal(now) {
		t.Errorf("expected lastRun=%v, got %v", now, parsed)
	}
}
