package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestWaitForOpenSearch_SucceedsWhenHealthy(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	if err := waitForOpenSearch(server.URL, "", ""); err != nil {
		t.Errorf("expected no error, got: %v", err)
	}
}

func TestWaitForOpenSearch_FailsAfterMaxRetries(t *testing.T) {
	orig := maxStartupRetries
	origInterval := retryInterval
	maxStartupRetries = 2
	retryInterval = 10 * time.Millisecond
	defer func() {
		maxStartupRetries = orig
		retryInterval = origInterval
	}()

	// Port 19999 should have nothing listening on it.
	err := waitForOpenSearch("http://127.0.0.1:19999", "", "")
	if err == nil {
		t.Error("expected error when OpenSearch unavailable")
	}
}

func TestWaitForOpenSearch_RetriesOnTransientFailure(t *testing.T) {
	origInterval := retryInterval
	retryInterval = 10 * time.Millisecond
	defer func() { retryInterval = origInterval }()

	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		if callCount < 3 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	if err := waitForOpenSearch(server.URL, "", ""); err != nil {
		t.Errorf("expected success after retries, got: %v", err)
	}
	if callCount < 3 {
		t.Errorf("expected at least 3 calls, got %d", callCount)
	}
}
