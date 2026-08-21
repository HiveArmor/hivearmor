package main

import (
	"testing"
	"time"
)

func TestIngressLimiterEnforcesPerConnectorRate(t *testing.T) {
	limiter := newIngressLimiter()
	identity := &ConnectorIdentity{Type: "agent", ID: 9, ConnectorID: "uuid-9", TenantID: 3}
	now := time.Now().UTC()

	for i := 0; i < int(connectorBurst); i++ {
		if _, ok := limiter.Allow(identity, now); !ok {
			t.Fatalf("burst token %d was rejected", i)
		}
	}
	if wait, ok := limiter.Allow(identity, now); ok || wait != rateLimitRetryAfter {
		t.Fatalf("expected rate limit after burst, ok=%v wait=%s", ok, wait)
	}

	if _, ok := limiter.Allow(identity, now.Add(time.Second)); !ok {
		t.Fatal("expected refill after one second")
	}
}

func TestIngressLimiterCapsConcurrentStreams(t *testing.T) {
	limiter := newIngressLimiter()
	identity := &ConnectorIdentity{Type: "agent", ID: 4, ConnectorID: "uuid-4", TenantID: 1}
	if err := limiter.AcquireStream(identity); err != nil {
		t.Fatal(err)
	}
	if err := limiter.AcquireStream(identity); err != nil {
		t.Fatal(err)
	}
	if err := limiter.AcquireStream(identity); err == nil {
		t.Fatal("expected connection limit")
	}
	limiter.ReleaseStream(identity)
	if err := limiter.AcquireStream(identity); err != nil {
		t.Fatal(err)
	}
}
