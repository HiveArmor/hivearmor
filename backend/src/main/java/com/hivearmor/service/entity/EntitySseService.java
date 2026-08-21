package com.hivearmor.service.entity;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;

/**
 * SSE broadcaster for tenant-scoped entity intelligence updates (ENT-005).
 *
 * <p>Manages per-tenant SSE emitter registrations and broadcasts entity events
 * to all connected clients. Implements:
 * <ul>
 *   <li>ConcurrentHashMap&lt;Long, List&lt;SseEmitter&gt;&gt; keyed by tenant ID</li>
 *   <li>Max 10 connections per tenant (drops oldest when exceeded)</li>
 *   <li>Monotonic event ID counter per tenant for Last-Event-ID support</li>
 *   <li>30-second keepalive via @Scheduled</li>
 *   <li>Last-Event-ID replay from in-memory buffer (last 50 events per tenant)</li>
 *   <li>30-minute SseEmitter timeout</li>
 * </ul>
 *
 * <p>Event types:
 * <ul>
 *   <li>{@code entity.risk_changed} — entity risk score updated</li>
 *   <li>{@code entity.discovered} — new entity first seen</li>
 *   <li>{@code entity.trend_changed} — entity risk trend shifted</li>
 *   <li>{@code entity.alert_linked} — new alert linked to entity</li>
 *   <li>{@code entity.baseline_deviation} — entity baseline deviation exceeded threshold</li>
 * </ul>
 *
 * <p>Sprint 45 — Entity Intelligence Core.
 */
@Service
public class EntitySseService {

    private static final Logger log = LoggerFactory.getLogger(EntitySseService.class);
    private static final String CLASSNAME = "EntitySseService";

    /** Maximum SSE connections per tenant. */
    private static final int MAX_EMITTERS_PER_TENANT = 10;

    /** SseEmitter timeout: 30 minutes. */
    public static final long EMITTER_TIMEOUT_MS = 30 * 60 * 1000L;

    /** Event buffer size per tenant (for Last-Event-ID replay). */
    private static final int EVENT_BUFFER_SIZE = 50;

    /** Active emitters keyed by tenant ID. */
    private final ConcurrentHashMap<Long, List<SseEmitter>> emitters = new ConcurrentHashMap<>();

    /** Event buffer for Last-Event-ID replay, keyed by tenant ID. */
    private final ConcurrentHashMap<Long, Deque<BufferedEvent>> eventBuffer = new ConcurrentHashMap<>();

    /** Monotonic event ID counter per tenant. */
    private final ConcurrentHashMap<Long, AtomicLong> eventCounters = new ConcurrentHashMap<>();

    private final ObjectMapper objectMapper;

    /**
     * A buffered event for replay support.
     */
    private record BufferedEvent(String eventId, String eventType, String data) {}

    public EntitySseService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    // =========================================================================
    // Emitter lifecycle
    // =========================================================================

    /**
     * Registers an SseEmitter for the given tenant.
     *
     * <p>Adds the emitter to the per-tenant list, enforcing max 10 connections
     * (drops oldest if exceeded). Sets completion/timeout/error callbacks for cleanup.
     *
     * @param tenantId the tenant identifier
     * @param emitter  the SseEmitter to register
     */
    public void register(Long tenantId, SseEmitter emitter) {
        List<SseEmitter> list = emitters.computeIfAbsent(tenantId, k -> new CopyOnWriteArrayList<>());

        // Enforce max connections — drop oldest if exceeded
        while (list.size() >= MAX_EMITTERS_PER_TENANT) {
            SseEmitter oldest = list.remove(0);
            try {
                oldest.complete();
            } catch (Exception e) {
                // Already completed/failed — ignore
            }
            log.debug("{}: dropped oldest emitter for tenant {} (max {} reached)",
                CLASSNAME, tenantId, MAX_EMITTERS_PER_TENANT);
        }

        // Set callbacks for cleanup
        emitter.onCompletion(() -> deregister(tenantId, emitter));
        emitter.onTimeout(() -> deregister(tenantId, emitter));
        emitter.onError(err -> deregister(tenantId, emitter));

        list.add(emitter);
        log.debug("{}: registered entity emitter for tenant {} (total: {})",
            CLASSNAME, tenantId, list.size());
    }

    /**
     * Deregisters (removes) a specific emitter for the given tenant.
     *
     * @param tenantId the tenant identifier
     * @param emitter  the SseEmitter to remove
     */
    public void deregister(Long tenantId, SseEmitter emitter) {
        List<SseEmitter> list = emitters.get(tenantId);
        if (list != null) {
            list.remove(emitter);
            if (list.isEmpty()) {
                emitters.remove(tenantId);
            }
        }
    }

    // =========================================================================
    // Broadcasting
    // =========================================================================

    /**
     * Broadcasts an event to all SSE emitters registered for the given tenant.
     *
     * <p>Supported event types:
     * <ul>
     *   <li>entity.risk_changed</li>
     *   <li>entity.discovered</li>
     *   <li>entity.trend_changed</li>
     *   <li>entity.alert_linked</li>
     *   <li>entity.baseline_deviation</li>
     * </ul>
     *
     * @param tenantId  the tenant identifier
     * @param eventType the SSE event type
     * @param data      the event payload map
     */
    public void broadcast(Long tenantId, String eventType, Map<String, Object> data) {
        // Generate monotonic event ID for this tenant
        AtomicLong counter = eventCounters.computeIfAbsent(tenantId,
            k -> new AtomicLong(System.currentTimeMillis()));
        String eventId = "evt-" + counter.incrementAndGet();

        // Serialize data
        String jsonData;
        try {
            jsonData = objectMapper.writeValueAsString(data);
        } catch (Exception e) {
            log.warn("{}: failed to serialize entity SSE data: {}", CLASSNAME, e.getMessage());
            return;
        }

        // Buffer event for Last-Event-ID replay
        bufferEvent(tenantId, eventId, eventType, jsonData);

        // Send to all connected emitters
        List<SseEmitter> list = emitters.get(tenantId);
        if (list == null || list.isEmpty()) {
            log.debug("{}: no entity emitters registered for tenant {}", CLASSNAME, tenantId);
            return;
        }

        List<SseEmitter> failed = new ArrayList<>();
        for (SseEmitter emitter : list) {
            try {
                SseEmitter.SseEventBuilder event = SseEmitter.event()
                    .id(eventId)
                    .name(eventType)
                    .data(jsonData);
                emitter.send(event);
            } catch (IOException e) {
                failed.add(emitter);
            } catch (Exception e) {
                failed.add(emitter);
                log.debug("{}: failed to send entity SSE to emitter: {}", CLASSNAME, e.getMessage());
            }
        }

        // Remove failed emitters
        if (!failed.isEmpty()) {
            list.removeAll(failed);
            if (list.isEmpty()) {
                emitters.remove(tenantId);
            }
        }
    }

    // =========================================================================
    // Event buffer and replay
    // =========================================================================

    /**
     * Buffers an event for Last-Event-ID replay support.
     */
    private void bufferEvent(Long tenantId, String eventId, String eventType, String jsonData) {
        Deque<BufferedEvent> buffer = eventBuffer.computeIfAbsent(
            tenantId, k -> new ConcurrentLinkedDeque<>());

        buffer.addLast(new BufferedEvent(eventId, eventType, jsonData));

        // Trim to max buffer size (50 events)
        while (buffer.size() > EVENT_BUFFER_SIZE) {
            buffer.pollFirst();
        }
    }

    /**
     * Replays buffered events since the specified Last-Event-ID to an emitter.
     *
     * @param tenantId    the tenant identifier
     * @param lastEventId the Last-Event-ID header value
     * @param emitter     the SseEmitter to replay to
     */
    public void replayFrom(Long tenantId, String lastEventId, SseEmitter emitter) {
        if (lastEventId == null || lastEventId.isBlank()) return;

        Deque<BufferedEvent> buffer = eventBuffer.get(tenantId);
        if (buffer == null || buffer.isEmpty()) {
            // No buffer — send state-refresh
            sendStateRefresh(emitter, tenantId, lastEventId);
            return;
        }

        boolean found = false;
        for (BufferedEvent event : buffer) {
            if (found) {
                // Replay this event
                try {
                    SseEmitter.SseEventBuilder sseEvent = SseEmitter.event()
                        .id(event.eventId())
                        .name(event.eventType())
                        .data(event.data());
                    emitter.send(sseEvent);
                } catch (IOException e) {
                    log.debug("{}: failed to replay entity event to emitter: {}",
                        CLASSNAME, e.getMessage());
                    break;
                }
            }
            if (event.eventId().equals(lastEventId)) {
                found = true;
            }
        }

        // If Last-Event-ID was not found in the buffer, it's expired — send state-refresh
        if (!found) {
            sendStateRefresh(emitter, tenantId, lastEventId);
        }
    }

    /**
     * Sends a state-refresh event when the Last-Event-ID is expired (not found in buffer).
     */
    private void sendStateRefresh(SseEmitter emitter, Long tenantId, String expiredEventId) {
        try {
            Map<String, Object> refreshPayload = new LinkedHashMap<>();
            refreshPayload.put("reason", "Last-Event-ID expired — full state refresh required");
            refreshPayload.put("expiredEventId", expiredEventId);
            refreshPayload.put("tenantId", tenantId);
            refreshPayload.put("serverTime", java.time.Instant.now().toString());

            String json = objectMapper.writeValueAsString(refreshPayload);
            emitter.send(SseEmitter.event()
                .name("state-refresh")
                .data(json));
        } catch (IOException e) {
            log.warn("{}: failed to send state-refresh to emitter: {}", CLASSNAME, e.getMessage());
        }
    }

    // =========================================================================
    // Keepalive
    // =========================================================================

    /**
     * Sends keepalive comments to all active entity emitters every 30 seconds.
     */
    @Scheduled(fixedRate = 30_000)
    public void sendKeepalives() {
        for (Map.Entry<Long, List<SseEmitter>> entry : emitters.entrySet()) {
            List<SseEmitter> list = entry.getValue();
            if (list == null || list.isEmpty()) continue;

            List<SseEmitter> failed = new ArrayList<>();
            for (SseEmitter emitter : list) {
                try {
                    emitter.send(SseEmitter.event().comment("keepalive"));
                } catch (IOException e) {
                    failed.add(emitter);
                } catch (Exception e) {
                    failed.add(emitter);
                }
            }

            // Remove failed emitters
            if (!failed.isEmpty()) {
                list.removeAll(failed);
                if (list.isEmpty()) {
                    emitters.remove(entry.getKey());
                }
            }
        }
    }

    // =========================================================================
    // Info
    // =========================================================================

    /**
     * Returns the number of active emitters for a given tenant.
     */
    public int getEmitterCount(Long tenantId) {
        List<SseEmitter> list = emitters.get(tenantId);
        return list != null ? list.size() : 0;
    }
}
