package com.hivearmor.service.hunt;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Manages SSE emitter registry for the HiveArmor Alert Queue live stream.
 *
 * <p>Responsibilities:
 * <ul>
 *   <li>Maintain a per-tenant registry of active {@link SseEmitter} instances</li>
 *   <li>Ring buffer of last 1000 events per tenant for replay on reconnect</li>
 *   <li>Emit heartbeat every 30 seconds to all connected emitters</li>
 *   <li>Emit {@code stream.reset} when the resume gap is too large</li>
 *   <li>Emit domain events: {@code alert.created}, {@code alert.updated}, {@code summary.updated}</li>
 * </ul>
 *
 * <p>Thread safety: the emitter registry uses {@link ConcurrentHashMap} with
 * {@link CopyOnWriteArrayList} for safe iteration during broadcast. The ring buffer
 * uses synchronisation on its own monitor to avoid torn reads during replay.
 */
@Service
public class HaAlertStreamService {

    private static final Logger log = LoggerFactory.getLogger(HaAlertStreamService.class);
    private static final String CLASSNAME = "HaAlertStreamService";

    /** Maximum events stored in the ring buffer per tenant. */
    private static final int RING_BUFFER_CAPACITY = 1000;

    /** Emitter timeout: 5 minutes in milliseconds. */
    static final long EMITTER_TIMEOUT_MS = 5 * 60 * 1000L;

    /** Event types. */
    public static final String EVENT_ALERT_CREATED = "alert.created";
    public static final String EVENT_ALERT_UPDATED = "alert.updated";
    public static final String EVENT_SUMMARY_UPDATED = "summary.updated";
    public static final String EVENT_HEARTBEAT = "stream.heartbeat";
    public static final String EVENT_STREAM_RESET = "stream.reset";

    /** Global monotonically increasing event counter used for event IDs. */
    private final AtomicLong eventSequence = new AtomicLong(0);

    /** Per-tenant list of active SseEmitters. */
    private final Map<String, List<SseEmitter>> emitterRegistry = new ConcurrentHashMap<>();

    /** Per-tenant ring buffer of recent events for replay. */
    private final Map<String, RingBuffer> eventBuffers = new ConcurrentHashMap<>();

    private final ObjectMapper objectMapper;
    private final MsspIndexResolver indexResolver;

    public HaAlertStreamService(ObjectMapper objectMapper, MsspIndexResolver indexResolver) {
        this.objectMapper = objectMapper;
        this.indexResolver = indexResolver;
    }

    // ── Emitter lifecycle ────────────────────────────────────────────────────

    /**
     * Creates and registers a new {@link SseEmitter} for the given tenant.
     *
     * @param tenantPrefix the tenant prefix from {@link TenantContext}; uses "global" if null
     * @param lastEventId  the {@code Last-Event-ID} header value for resume; may be null
     * @return a configured SseEmitter ready to be returned to the client
     */
    public SseEmitter registerEmitter(String tenantPrefix, String lastEventId) {
        String tenant = normaliseTenant(tenantPrefix);
        SseEmitter emitter = new SseEmitter(EMITTER_TIMEOUT_MS);

        List<SseEmitter> tenantEmitters = emitterRegistry.computeIfAbsent(
            tenant, k -> new CopyOnWriteArrayList<>());
        tenantEmitters.add(emitter);

        // Cleanup callbacks
        emitter.onCompletion(() -> removeEmitter(tenant, emitter));
        emitter.onTimeout(() -> removeEmitter(tenant, emitter));
        emitter.onError(e -> removeEmitter(tenant, emitter));

        // Send initial comment to flush HTTP headers
        try {
            emitter.send(SseEmitter.event().comment("connected"));
        } catch (IOException e) {
            removeEmitter(tenant, emitter);
            return emitter;
        }

        // Handle resume from Last-Event-ID
        if (lastEventId != null && !lastEventId.isBlank()) {
            replayOrReset(tenant, emitter, lastEventId);
        }

        return emitter;
    }

    /**
     * Removes an emitter from the tenant registry.
     */
    private void removeEmitter(String tenant, SseEmitter emitter) {
        List<SseEmitter> list = emitterRegistry.get(tenant);
        if (list != null) {
            list.remove(emitter);
            if (list.isEmpty()) {
                emitterRegistry.remove(tenant);
            }
        }
    }

    /**
     * Returns the number of active emitters for a given tenant (for testing/monitoring).
     */
    public int getEmitterCount(String tenantPrefix) {
        String tenant = normaliseTenant(tenantPrefix);
        List<SseEmitter> list = emitterRegistry.get(tenant);
        return list != null ? list.size() : 0;
    }

    /**
     * Returns the total number of active emitters across all tenants.
     */
    public int getTotalEmitterCount() {
        return emitterRegistry.values().stream().mapToInt(List::size).sum();
    }

    // ── Event emission ───────────────────────────────────────────────────────

    /**
     * Emits an {@code alert.created} event to all emitters for the given tenant.
     *
     * @param tenantPrefix the tenant prefix
     * @param alertData    the projected alert data (will be serialised to JSON)
     */
    public void emitAlertCreated(String tenantPrefix, Map<String, Object> alertData) {
        emitEvent(tenantPrefix, EVENT_ALERT_CREATED, alertData);
    }

    /**
     * Emits an {@code alert.updated} event to all emitters for the given tenant.
     *
     * @param tenantPrefix the tenant prefix
     * @param alertData    the projected delta (changed fields)
     */
    public void emitAlertUpdated(String tenantPrefix, Map<String, Object> alertData) {
        emitEvent(tenantPrefix, EVENT_ALERT_UPDATED, alertData);
    }

    /**
     * Emits a {@code summary.updated} event to all emitters for the given tenant.
     *
     * @param tenantPrefix  the tenant prefix
     * @param summaryData   the updated aggregate counts
     */
    public void emitSummaryUpdated(String tenantPrefix, Map<String, Object> summaryData) {
        emitEvent(tenantPrefix, EVENT_SUMMARY_UPDATED, summaryData);
    }

    /**
     * Core event emission logic: builds the event payload, stores in ring buffer,
     * and broadcasts to all emitters for the specified tenant.
     */
    private void emitEvent(String tenantPrefix, String eventType, Map<String, Object> data) {
        String tenant = normaliseTenant(tenantPrefix);
        long sequence = eventSequence.incrementAndGet();
        String eventId = String.valueOf(sequence);

        Map<String, Object> payload = buildEventPayload(eventId, eventType, data);

        // Store in ring buffer for replay
        RingBuffer buffer = eventBuffers.computeIfAbsent(tenant, k -> new RingBuffer(RING_BUFFER_CAPACITY));
        buffer.add(new BufferedEvent(eventId, eventType, payload));

        // Broadcast to all connected emitters for this tenant
        broadcast(tenant, eventId, eventType, payload);
    }

    /**
     * Builds the standard event payload structure.
     */
    private Map<String, Object> buildEventPayload(String eventId, String eventType, Map<String, Object> data) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("eventId", eventId);
        payload.put("type", eventType);
        payload.put("snapshotVersion", eventSequence.get());
        payload.put("serverTime", Instant.now().toString());
        payload.put("matchesFilter", true);
        if (data != null) {
            payload.put("data", data);
        }
        return payload;
    }

    // ── Heartbeat ────────────────────────────────────────────────────────────

    /**
     * Sends a {@code stream.heartbeat} event to all connected emitters every 30 seconds.
     * The heartbeat carries the current server time and the latest event sequence.
     */
    @Scheduled(fixedDelay = 30000)
    public void sendHeartbeat() {
        if (emitterRegistry.isEmpty()) {
            return;
        }

        Map<String, Object> heartbeatData = new LinkedHashMap<>();
        heartbeatData.put("serverTime", Instant.now().toString());
        heartbeatData.put("latestEventId", String.valueOf(eventSequence.get()));

        for (Map.Entry<String, List<SseEmitter>> entry : emitterRegistry.entrySet()) {
            String tenant = entry.getKey();
            String eventId = String.valueOf(eventSequence.get());

            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("eventId", eventId);
            payload.put("type", EVENT_HEARTBEAT);
            payload.put("snapshotVersion", eventSequence.get());
            payload.put("serverTime", Instant.now().toString());
            payload.put("data", heartbeatData);

            broadcast(tenant, eventId, EVENT_HEARTBEAT, payload);
        }
    }

    // ── Resume / Replay ──────────────────────────────────────────────────────

    /**
     * Replays buffered events from after the given {@code lastEventId}, or emits
     * {@code stream.reset} if the gap is too large (event no longer in buffer).
     */
    private void replayOrReset(String tenant, SseEmitter emitter, String lastEventId) {
        RingBuffer buffer = eventBuffers.get(tenant);
        if (buffer == null) {
            // No events buffered — emit reset so client refetches
            sendResetToEmitter(emitter);
            return;
        }

        List<BufferedEvent> missedEvents = buffer.getEventsAfter(lastEventId);
        if (missedEvents == null) {
            // Gap too large — event not found in ring buffer
            sendResetToEmitter(emitter);
            return;
        }

        // Replay all missed events
        for (BufferedEvent event : missedEvents) {
            try {
                String json = objectMapper.writeValueAsString(event.payload);
                emitter.send(SseEmitter.event()
                    .id(event.eventId)
                    .name(event.eventType)
                    .data(json));
            } catch (IOException e) {
                log.warn("{}.replayOrReset: failed to replay event {} to emitter: {}",
                    CLASSNAME, event.eventId, e.getMessage());
                removeEmitter(tenant, emitter);
                return;
            }
        }
    }

    /**
     * Sends a {@code stream.reset} event to a single emitter instructing the client
     * to refetch the full dataset.
     */
    private void sendResetToEmitter(SseEmitter emitter) {
        try {
            Map<String, Object> resetPayload = new LinkedHashMap<>();
            resetPayload.put("eventId", String.valueOf(eventSequence.get()));
            resetPayload.put("type", EVENT_STREAM_RESET);
            resetPayload.put("serverTime", Instant.now().toString());
            resetPayload.put("reason", "Event gap too large — please refetch the full dataset");

            String json = objectMapper.writeValueAsString(resetPayload);
            emitter.send(SseEmitter.event()
                .id(String.valueOf(eventSequence.get()))
                .name(EVENT_STREAM_RESET)
                .data(json));
        } catch (IOException e) {
            log.warn("{}.sendResetToEmitter: failed to send stream.reset: {}",
                CLASSNAME, e.getMessage());
        }
    }

    // ── Broadcast helper ─────────────────────────────────────────────────────

    /**
     * Broadcasts an event to all active emitters for the given tenant.
     * Removes dead emitters silently on IOException.
     */
    private void broadcast(String tenant, String eventId, String eventType, Map<String, Object> payload) {
        List<SseEmitter> tenantEmitters = emitterRegistry.get(tenant);
        if (tenantEmitters == null || tenantEmitters.isEmpty()) {
            return;
        }

        String json;
        try {
            json = objectMapper.writeValueAsString(payload);
        } catch (Exception e) {
            log.error("{}.broadcast: failed to serialise event payload: {}", CLASSNAME, e.getMessage());
            return;
        }

        List<SseEmitter> dead = new ArrayList<>();
        for (SseEmitter emitter : tenantEmitters) {
            try {
                emitter.send(SseEmitter.event()
                    .id(eventId)
                    .name(eventType)
                    .data(json));
            } catch (IOException e) {
                dead.add(emitter);
            }
        }
        tenantEmitters.removeAll(dead);
    }

    // ── Utility ──────────────────────────────────────────────────────────────

    private String normaliseTenant(String tenantPrefix) {
        return (tenantPrefix == null || tenantPrefix.isBlank()) ? "global" : tenantPrefix.trim();
    }

    // ── Ring Buffer ──────────────────────────────────────────────────────────

    /**
     * A fixed-capacity ring buffer that stores the last N events per tenant.
     * Thread-safe via synchronisation on the buffer instance.
     */
    static class RingBuffer {
        private final BufferedEvent[] buffer;
        private int head = 0;
        private int size = 0;

        RingBuffer(int capacity) {
            this.buffer = new BufferedEvent[capacity];
        }

        synchronized void add(BufferedEvent event) {
            buffer[head] = event;
            head = (head + 1) % buffer.length;
            if (size < buffer.length) {
                size++;
            }
        }

        /**
         * Returns all events after the given eventId, or {@code null} if the event
         * is not found in the buffer (gap too large).
         */
        synchronized List<BufferedEvent> getEventsAfter(String eventId) {
            // Find the position of the given eventId
            int startIdx = -1;
            int start = (head - size + buffer.length) % buffer.length;

            for (int i = 0; i < size; i++) {
                int idx = (start + i) % buffer.length;
                if (buffer[idx] != null && eventId.equals(buffer[idx].eventId)) {
                    startIdx = i;
                    break;
                }
            }

            if (startIdx == -1) {
                // Event not found — gap too large
                return null;
            }

            // Collect all events AFTER the found position
            List<BufferedEvent> result = new ArrayList<>();
            for (int i = startIdx + 1; i < size; i++) {
                int idx = (start + i) % buffer.length;
                if (buffer[idx] != null) {
                    result.add(buffer[idx]);
                }
            }
            return result;
        }

        synchronized int getSize() {
            return size;
        }
    }

    /**
     * Immutable record of a buffered event for replay.
     */
    static class BufferedEvent {
        final String eventId;
        final String eventType;
        final Map<String, Object> payload;

        BufferedEvent(String eventId, String eventType, Map<String, Object> payload) {
            this.eventId = eventId;
            this.eventType = eventType;
            this.payload = payload;
        }
    }
}
