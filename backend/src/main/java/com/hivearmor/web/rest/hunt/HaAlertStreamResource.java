package com.hivearmor.web.rest.hunt;

import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.service.hunt.HaAlertStreamService;
import com.hivearmor.service.sse.HaSseRateLimiter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * SSE endpoint for the HiveArmor Alert Queue live stream.
 *
 * <p>{@code GET /api/ha-alerts/stream} establishes a Server-Sent Events connection
 * that emits real-time alert events scoped to the authenticated user's tenant.
 *
 * <p>Event types emitted:
 * <ul>
 *   <li>{@code alert.created} — new alert matching the view filter</li>
 *   <li>{@code alert.updated} — field changes on an existing alert</li>
 *   <li>{@code summary.updated} — counter/facet changes</li>
 *   <li>{@code stream.heartbeat} — keepalive every 30 seconds</li>
 *   <li>{@code stream.reset} — gap too large, client must refetch</li>
 * </ul>
 *
 * <p>Supports {@code Last-Event-ID} header for resume after reconnection.
 * The server replays missed events from a ring buffer (last 1000 per tenant)
 * or emits {@code stream.reset} if the gap is too large.
 *
 * <p>The SseEmitter has a 5-minute timeout. {@link TenantContext#clear()} is called
 * when the connection closes, times out, or errors.
 */
@RestController
@RequestMapping("/api")
public class HaAlertStreamResource {

    private static final Logger log = LoggerFactory.getLogger(HaAlertStreamResource.class);
    private static final String CLASSNAME = "HaAlertStreamResource";

    private static final String ALERT_STREAM_AUTH =
        "hasAuthority('ROLE_SOC_ANALYST') or hasAuthority('ROLE_SOC_MANAGER') " +
        "or hasAuthority('ROLE_ANALYST') or hasAuthority('ROLE_ADMIN')";

    private final HaAlertStreamService alertStreamService;
    private final HaSseRateLimiter rateLimiter;

    public HaAlertStreamResource(HaAlertStreamService alertStreamService, HaSseRateLimiter rateLimiter) {
        this.alertStreamService = alertStreamService;
        this.rateLimiter = rateLimiter;
    }

    /**
     * Establishes an SSE stream for live alert events.
     *
     * <p>The connection is scoped to the current tenant from {@link TenantContext}.
     * On connection close/timeout/error, {@link TenantContext#clear()} is invoked
     * to prevent ThreadLocal leakage.
     *
     * @param lastEventId the {@code Last-Event-ID} header for resume (optional)
     * @param viewId      optional view ID to scope events (future use)
     * @return an {@link SseEmitter} producing {@code text/event-stream}
     */
    @GetMapping(value = "/ha-alerts/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize(ALERT_STREAM_AUTH)
    public SseEmitter streamAlerts(
            @RequestHeader(value = "Last-Event-ID", required = false) String lastEventId,
            @RequestParam(value = "viewId", required = false) String viewId) {

        String tenantPrefix = TenantContext.get();
        log.debug("{}.streamAlerts: opening SSE stream for tenant={}, lastEventId={}, viewId={}",
            CLASSNAME, tenantPrefix, lastEventId, viewId);

        // HAR-006: Check SSE rate limits before creating emitter
        String endpoint = "/ha-alerts/stream";
        rateLimiter.checkLimit(tenantPrefix, endpoint, null);
        HaSseRateLimiter.ConnectionHandle connectionHandle = rateLimiter.register(tenantPrefix, endpoint, null);

        SseEmitter emitter = alertStreamService.registerEmitter(tenantPrefix, lastEventId);

        // Register cleanup callbacks to clear TenantContext on connection lifecycle events.
        // Note: Spring SseEmitter callbacks run on the servlet container's thread pool,
        // so we clear TenantContext defensively in case it was set on that thread.
        emitter.onCompletion(() -> {
            log.debug("{}.streamAlerts: connection completed for tenant={}", CLASSNAME, tenantPrefix);
            connectionHandle.close();
            TenantContext.clear();
        });
        emitter.onTimeout(() -> {
            log.debug("{}.streamAlerts: connection timed out for tenant={}", CLASSNAME, tenantPrefix);
            connectionHandle.close();
            TenantContext.clear();
        });
        emitter.onError(e -> {
            log.debug("{}.streamAlerts: connection error for tenant={}: {}",
                CLASSNAME, tenantPrefix, e.getMessage());
            connectionHandle.close();
            TenantContext.clear();
        });

        return emitter;
    }
}
