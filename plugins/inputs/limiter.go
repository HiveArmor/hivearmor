package main

import (
	"sync"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	connectorTokensPerSecond = 20.0
	connectorBurst           = 40.0
	tenantTokensPerSecond    = 200.0
	tenantBurst              = 400.0
	maxStreamsPerConnector   = 2
	rateLimitRetryAfter      = time.Second
)

type tokenBucket struct {
	tokens float64
	last   time.Time
}

type ingressLimiter struct {
	mu         sync.Mutex
	connectors map[string]*tokenBucket
	tenants    map[string]*tokenBucket
	streams    map[string]int
}

func newIngressLimiter() *ingressLimiter {
	return &ingressLimiter{
		connectors: make(map[string]*tokenBucket),
		tenants:    make(map[string]*tokenBucket),
		streams:    make(map[string]int),
	}
}

func (l *ingressLimiter) Allow(identity *ConnectorIdentity, now time.Time) (time.Duration, bool) {
	if identity == nil {
		return 0, false
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if !allowBucket(l.connectors, identity.cacheKey(), connectorTokensPerSecond, connectorBurst, now) {
		return rateLimitRetryAfter, false
	}
	if !allowBucket(l.tenants, identity.TenantString(), tenantTokensPerSecond, tenantBurst, now) {
		return rateLimitRetryAfter, false
	}
	return 0, true
}

func (l *ingressLimiter) AcquireStream(identity *ConnectorIdentity) error {
	if identity == nil {
		return status.Error(codes.PermissionDenied, errMissingIdentity.Error())
	}
	key := identity.cacheKey()
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.streams[key] >= maxStreamsPerConnector {
		return status.Error(codes.ResourceExhausted, "connector connection limit exceeded; retry-after=1")
	}
	l.streams[key]++
	return nil
}

func (l *ingressLimiter) ReleaseStream(identity *ConnectorIdentity) {
	if identity == nil {
		return
	}
	key := identity.cacheKey()
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.streams[key] <= 1 {
		delete(l.streams, key)
		return
	}
	l.streams[key]--
}

func allowBucket(buckets map[string]*tokenBucket, key string, rate, burst float64, now time.Time) bool {
	if key == "" {
		return false
	}
	bucket, ok := buckets[key]
	if !ok {
		buckets[key] = &tokenBucket{tokens: burst - 1, last: now}
		return true
	}
	elapsed := now.Sub(bucket.last).Seconds()
	if elapsed > 0 {
		bucket.tokens += elapsed * rate
		if bucket.tokens > burst {
			bucket.tokens = burst
		}
		bucket.last = now
	}
	if bucket.tokens < 1 {
		return false
	}
	bucket.tokens--
	return true
}
