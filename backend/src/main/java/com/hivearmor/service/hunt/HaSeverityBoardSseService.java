package com.hivearmor.service.hunt;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;

/**
 * SSE broadcaster for tenant-scoped severity board updates (ALT-023).
 *
 * <p>Manages per-tenant SSE emitter registrations and broadcasts severity board
 * events to all connected clients. Implements:
 * <ul>
 *   <li>ConcurrentHashMap&lt;Long, List&lt;SseEmitter&gt;&gt; keyed by tenant ID</li>
 *   <li>Max 10 connections per tenant (drops oldest when exceeded)</li>
 *   <li>Monotonic event ID counter per tenant for Last-Event-ID support</li>
 *   <li>30-second keepalive via @Scheduled</li>
 *   <li>Last-Event-ID replay from in-memory buffer (last 50 events per tenant)</li>
 *   <li>30-minute SseEmitter timeout</li>
 *   <li>Expired ID handling: sends state-refresh if Last-Event-ID not found in buffer</li>
 * </ul>
 *
 * <p>Event types:
 * <ul>
 *   <li>{@code board.lane_updated} — severity lane counts changed</li>
 *   <li>{@code board.alert_promoted} — alert moved to higher severity lane</li>
 *   <li>{@code board.alert_resolved} — alert resolved and removed from board</li>
 *   <li>{@code board.counters_updated} — overview counters refreshed</li>
 *   <li>{@code state-refresh} — full state refresh after expired event ID</li>
 * </ul>
 *
 * <p>Sprint 49 — HAR-005 (SSE Reconnection Hardening).
 */
@Service
public class HaSeverityBoardSseService {

    private static final Logger log = LoggerFactory.getLogger(HaSeverityBoardSseService.class);
    private static final String CLASSNAME = "HaSeverityBoardSseService";

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

    public HaSeverityBoardSseService(ObjectMapper objectMapper) {
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

        // Enforce max connections per tenant
        if (list.size() >= MAX_EMITTERS_PER_TENANT) {
            SseEmitter oldest = list.remove(0);
            try { oldest.complete(); } catch (Exception ignored) {}
            log.warn("{}: max emitters reached for tenant={}, removed oldest", CLASSNAME, tenantId);
        }

        list.add(emitter);

        // Cleanup callbacks
        emitter.onCompletion(() -> deregister(tenantId, emitter));
        emitter.onTimeout(() -> deregister(tenantId, emitter));
        emitter.onError(e -> deregister(tenantId, emitter));

        // Send initial connection event
        try {
            emitter.send(SseEmitter.event().comment("connected"));
        } catch (IOException e) {
            deregister(tenantId, emitter);
        }

        log.debug("{}: registered emitter for tenant={}, total={}", CLASSNAME, tenantId, list.size());
    }

    /**
     * Removes an emitter from the per-tenant list.
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
     * Broadcasts a severity board event to all connected clients for the given tenant.
     *
     * @param tenantId  the tenant to broadcast to
     * @param eventType the event type (e.g. "board.lane_updated")
     * @param data      event payload
     */
    public void broadcast(Long tenantId, String eventType, Map<String, Object> data) {
        List<SseEmitter> list = emitters.get(tenantId);
        if (list == null || list.isEmpty()) return;

        // Generate monotonic event ID for this tenant
        AtomicLong counter = eventCounters.computeIfAbsent(tenantId, k -> new AtomicLong(0));
        String eventId = String.valueOf(counter.incrementAndGet());

        // Build full payload
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("eventId", eventId);
        payload.put("type", eventType);
        payload.put("serverTime", Instant.now().toString());
        if (data != null) {
            payload.putAll(data);
        }

        String jsonData;
        try {
            jsonData = objectMapper.writeValueAsString(payload);
        } catch (Exception e) {
            log.error("{}: failed to serialize board event: {}", CLASSNAME, e.getMessage());
            return;
        }

        // Buffer the event for replay
        bufferEvent(tenantId, eventId, eventType, jsonData);

        // Broadcast to all emitters
        List<SseEmitter> failed = new ArrayList<>();
        for (SseEmitter emitter : list) {
            try {
                SseEmitter.SseEventBuilder sseEvent = SseEmitter.event()
                    .id(eventId)
                    .name(eventType)
                    .data(jsonData);
                emitter.send(sseEvent);
            } catch (IOException e) {
                failed.add(emitter);
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
     * <p>If the Last-Event-ID is not found in the buffer (expired), sends a
     * {@code state-refresh} event instead of silently skipping.
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
                    log.debug("{}: failed to replay board event to emitter: {}",
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
            refreshPayload.put("serverTime", Instant.now().toString());

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
     * Sends keepalive comments to all active severity board emitters every 30 seconds.
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
        return (list != null) ? list.size() : 0;
    }
}
