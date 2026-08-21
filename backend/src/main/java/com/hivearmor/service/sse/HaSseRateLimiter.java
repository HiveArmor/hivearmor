package com.hivearmor.service.sse;

import com.hivearmor.web.rest.errors.HaSseRateLimitExceededException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * In-memory SSE connection rate limiter enforcing per-tenant, per-resource,
 * and per-endpoint limits.
 *
 * <p>Limits (HAR-006 / REQ-6):
 * <ul>
 *   <li>Max 10 SSE connections per tenant (across all endpoints)</li>
 *   <li>Max 3 connections per resource per tenant (e.g., same alert queue stream)</li>
 *   <li>Max 50 connections globally per endpoint</li>
 * </ul>
 *
 * <p>Counters are in-memory and reset on restart — acceptable because SSE connections
 * re-establish naturally after a service restart.
 *
 * <p>Requirements: REQ-6 (HAR-006)
 */
@Component
public class HaSseRateLimiter {

    private static final Logger log = LoggerFactory.getLogger(HaSseRateLimiter.class);

    /** Max SSE connections per tenant across all endpoints. */
    static final int MAX_PER_TENANT = 10;

    /** Max connections per resource per tenant (e.g., 3 connections to same stream). */
    static final int MAX_PER_RESOURCE = 3;

    /** Max connections globally per endpoint. */
    static final int MAX_PER_ENDPOINT = 50;

    /** Retry-After value in seconds returned in 429 responses. */
    static final int RETRY_AFTER_SECONDS = 30;

    /** Per-tenant counters: Map&lt;tenantId, AtomicInteger&gt; */
    private final ConcurrentHashMap<String, AtomicInteger> tenantCounters = new ConcurrentHashMap<>();

    /** Per-resource counters: Map&lt;"tenantId:endpoint:resourceId", AtomicInteger&gt; */
    private final ConcurrentHashMap<String, AtomicInteger> resourceCounters = new ConcurrentHashMap<>();

    /** Per-endpoint global counters: Map&lt;endpoint, AtomicInteger&gt; */
    private final ConcurrentHashMap<String, AtomicInteger> endpointCounters = new ConcurrentHashMap<>();

    /** Tracks active connection handles for stale cleanup. */
    private final ConcurrentHashMap<ConnectionHandle, Instant> activeConnections = new ConcurrentHashMap<>();

    /**
     * Checks whether a new SSE connection is allowed given current limits.
     * Throws {@link HaSseRateLimitExceededException} if any limit is exceeded.
     *
     * @param tenantId   the tenant identifier (prefix or numeric ID as string)
     * @param endpoint   the SSE endpoint path (e.g., "/ha-alerts/stream")
     * @param resourceId the specific resource ID (e.g., incident ID, snapshot ID); may be null
     * @throws HaSseRateLimitExceededException if any limit is exceeded
     */
    public void checkLimit(String tenantId, String endpoint, String resourceId) {
        String effectiveTenant = normaliseTenant(tenantId);

        // Check per-tenant limit
        AtomicInteger tenantCount = tenantCounters.computeIfAbsent(effectiveTenant, k -> new AtomicInteger(0));
        if (tenantCount.get() >= MAX_PER_TENANT) {
            log.warn("SSE rate limit exceeded: tenant={} has {} connections (max={})",
                effectiveTenant, tenantCount.get(), MAX_PER_TENANT);
            throw new HaSseRateLimitExceededException(RETRY_AFTER_SECONDS, tenantCount.get(), MAX_PER_TENANT);
        }

        // Check per-resource limit (if resourceId provided)
        if (resourceId != null && !resourceId.isBlank()) {
            String resourceKey = effectiveTenant + ":" + endpoint + ":" + resourceId;
            AtomicInteger resourceCount = resourceCounters.computeIfAbsent(resourceKey, k -> new AtomicInteger(0));
            if (resourceCount.get() >= MAX_PER_RESOURCE) {
                log.warn("SSE rate limit exceeded: resource={} has {} connections (max={})",
                    resourceKey, resourceCount.get(), MAX_PER_RESOURCE);
                throw new HaSseRateLimitExceededException(RETRY_AFTER_SECONDS, resourceCount.get(), MAX_PER_RESOURCE);
            }
        }

        // Check per-endpoint global limit
        AtomicInteger endpointCount = endpointCounters.computeIfAbsent(endpoint, k -> new AtomicInteger(0));
        if (endpointCount.get() >= MAX_PER_ENDPOINT) {
            log.warn("SSE rate limit exceeded: endpoint={} has {} connections (max={})",
                endpoint, endpointCount.get(), MAX_PER_ENDPOINT);
            throw new HaSseRateLimitExceededException(RETRY_AFTER_SECONDS, endpointCount.get(), MAX_PER_ENDPOINT);
        }
    }

    /**
     * Registers a new SSE connection and increments all relevant counters.
     * Must be called AFTER {@link #checkLimit} passes.
     *
     * @param tenantId   the tenant identifier
     * @param endpoint   the SSE endpoint path
     * @param resourceId the specific resource ID; may be null
     * @return a {@link ConnectionHandle} that must be closed when the connection ends
     */
    public ConnectionHandle register(String tenantId, String endpoint, String resourceId) {
        String effectiveTenant = normaliseTenant(tenantId);

        tenantCounters.computeIfAbsent(effectiveTenant, k -> new AtomicInteger(0)).incrementAndGet();
        endpointCounters.computeIfAbsent(endpoint, k -> new AtomicInteger(0)).incrementAndGet();

        String resourceKey = null;
        if (resourceId != null && !resourceId.isBlank()) {
            resourceKey = effectiveTenant + ":" + endpoint + ":" + resourceId;
            resourceCounters.computeIfAbsent(resourceKey, k -> new AtomicInteger(0)).incrementAndGet();
        }

        ConnectionHandle handle = new ConnectionHandle(effectiveTenant, endpoint, resourceKey);
        activeConnections.put(handle, Instant.now());

        log.debug("SSE connection registered: tenant={}, endpoint={}, resource={} " +
                "(tenantTotal={}, endpointTotal={})",
            effectiveTenant, endpoint, resourceId,
            tenantCounters.get(effectiveTenant).get(),
            endpointCounters.get(endpoint).get());

        return handle;
    }

    /**
     * Removes stale connections (older than 35 minutes — beyond the typical 30-minute
     * emitter timeout). Runs every 60 seconds.
     */
    @Scheduled(fixedRate = 60_000)
    public void cleanupStaleConnections() {
        Instant staleThreshold = Instant.now().minusSeconds(35 * 60); // 35 minutes
        int cleaned = 0;

        Iterator<Map.Entry<ConnectionHandle, Instant>> it = activeConnections.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<ConnectionHandle, Instant> entry = it.next();
            if (entry.getValue().isBefore(staleThreshold)) {
                entry.getKey().close();
                it.remove();
                cleaned++;
            }
        }

        if (cleaned > 0) {
            log.info("SSE rate limiter: cleaned {} stale connections", cleaned);
        }
    }

    // ── Visibility for testing ──────────────────────────────────────────────

    int getTenantConnectionCount(String tenantId) {
        AtomicInteger counter = tenantCounters.get(normaliseTenant(tenantId));
        return counter != null ? counter.get() : 0;
    }

    int getEndpointConnectionCount(String endpoint) {
        AtomicInteger counter = endpointCounters.get(endpoint);
        return counter != null ? counter.get() : 0;
    }

    int getResourceConnectionCount(String resourceKey) {
        AtomicInteger counter = resourceCounters.get(resourceKey);
        return counter != null ? counter.get() : 0;
    }

    // ── Internal helpers ────────────────────────────────────────────────────

    private String normaliseTenant(String tenantId) {
        return (tenantId == null || tenantId.isBlank()) ? "global" : tenantId;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ConnectionHandle — auto-decrements counters on close
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Handle representing an active SSE connection. Calling {@link #close()} decrements
     * all counters that were incremented during registration.
     *
     * <p>This should be invoked from the SseEmitter's onCompletion/onTimeout/onError callbacks.
     */
    public class ConnectionHandle {
        private final String tenantId;
        private final String endpoint;
        private final String resourceKey; // nullable
        private volatile boolean closed = false;

        ConnectionHandle(String tenantId, String endpoint, String resourceKey) {
            this.tenantId = tenantId;
            this.endpoint = endpoint;
            this.resourceKey = resourceKey;
        }

        /**
         * Decrements all counters associated with this connection.
         * Safe to call multiple times — only the first call takes effect.
         */
        public void close() {
            if (closed) return;
            closed = true;

            AtomicInteger tenantCounter = tenantCounters.get(tenantId);
            if (tenantCounter != null) {
                int val = tenantCounter.decrementAndGet();
                if (val <= 0) {
                    tenantCounters.remove(tenantId, tenantCounter);
                }
            }

            AtomicInteger endpointCounter = endpointCounters.get(endpoint);
            if (endpointCounter != null) {
                int val = endpointCounter.decrementAndGet();
                if (val <= 0) {
                    endpointCounters.remove(endpoint, endpointCounter);
                }
            }

            if (resourceKey != null) {
                AtomicInteger resourceCounter = resourceCounters.get(resourceKey);
                if (resourceCounter != null) {
                    int val = resourceCounter.decrementAndGet();
                    if (val <= 0) {
                        resourceCounters.remove(resourceKey, resourceCounter);
                    }
                }
            }

            activeConnections.remove(this);

            log.debug("SSE connection closed: tenant={}, endpoint={}, resource={}",
                tenantId, endpoint, resourceKey);
        }

        public boolean isClosed() {
            return closed;
        }
    }
}
