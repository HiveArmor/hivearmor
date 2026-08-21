package com.hivearmor.service.incident;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;

/**
 * SSE broadcaster for incident-scoped live updates (INC-008).
 *
 * <p>Manages per-incident SSE emitter registrations and broadcasts events
 * to all connected clients watching a given incident. Implements:
 * <ul>
 *   <li>ConcurrentHashMap&lt;String, List&lt;SseEmitter&gt;&gt; keyed by incident ID</li>
 *   <li>Max 10 connections per incident (drops oldest when exceeded)</li>
 *   <li>Monotonic timestamp-based event IDs</li>
 *   <li>30-second keepalive via ScheduledExecutorService</li>
 *   <li>Last-Event-ID replay from in-memory buffer (last 100 events per incident)</li>
 *   <li>30-minute SseEmitter timeout</li>
 * </ul>
 *
 * <p>Sprint 43 — Incident Workbench.
 */
@Service
public class IncidentSseService {

    private static final Logger log = LoggerFactory.getLogger(IncidentSseService.class);
    private static final String CLASSNAME = "IncidentSseService";

    /** Maximum SSE connections per incident. */
    private static final int MAX_EMITTERS_PER_INCIDENT = 10;

    /** SseEmitter timeout: 30 minutes. */
    public static final long EMITTER_TIMEOUT_MS = 30 * 60 * 1000L;

    /** Keepalive interval: 30 seconds. */
    private static final long KEEPALIVE_INTERVAL_SECONDS = 30;

    /** Event buffer size per incident (for Last-Event-ID replay). */
    private static final int EVENT_BUFFER_SIZE = 100;

    /** Active emitters keyed by incident ID. */
    private final ConcurrentHashMap<String, List<SseEmitter>> emitters = new ConcurrentHashMap<>();

    /** Event buffer for Last-Event-ID replay, keyed by incident ID. */
    private final ConcurrentHashMap<String, Deque<BufferedEvent>> eventBuffer = new ConcurrentHashMap<>();

    /** Monotonic event ID counter. */
    private final java.util.concurrent.atomic.AtomicLong eventIdCounter =
        new java.util.concurrent.atomic.AtomicLong(System.currentTimeMillis());

    /** Scheduled executor for keepalive. */
    private final ScheduledExecutorService keepaliveScheduler;

    private final ObjectMapper objectMapper;

    /**
     * A buffered event for replay support.
     */
    private record BufferedEvent(String eventId, String eventType, String data) {}

    public IncidentSseService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.keepaliveScheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "sse-keepalive");
            t.setDaemon(true);
            return t;
        });
        // Start keepalive scheduler
        this.keepaliveScheduler.scheduleAtFixedRate(
            this::sendKeepalives, KEEPALIVE_INTERVAL_SECONDS,
            KEEPALIVE_INTERVAL_SECONDS, TimeUnit.SECONDS);
    }

    @PreDestroy
    public void shutdown() {
        keepaliveScheduler.shutdownNow();
    }

    // =========================================================================
    // Emitter lifecycle
    // =========================================================================

    /**
     * Registers an SseEmitter for the given incident.
     *
     * <p>Adds the emitter to the per-incident list, enforcing max 10 connections
     * (drops oldest if exceeded). Sets completion/timeout/error callbacks for cleanup.
     *
     * @param incidentId the incident identifier
     * @param emitter    the SseEmitter to register
     */
    public void register(String incidentId, SseEmitter emitter) {
        List<SseEmitter> list = emitters.computeIfAbsent(incidentId, k -> new CopyOnWriteArrayList<>());

        // Enforce max connections — drop oldest if exceeded
        while (list.size() >= MAX_EMITTERS_PER_INCIDENT) {
            SseEmitter oldest = list.remove(0);
            try {
                oldest.complete();
            } catch (Exception e) {
                // Already completed/failed — ignore
            }
            log.debug("{}: dropped oldest emitter for incident {} (max {} reached)",
                CLASSNAME, incidentId, MAX_EMITTERS_PER_INCIDENT);
        }

        // Set callbacks for cleanup
        emitter.onCompletion(() -> deregister(incidentId, emitter));
        emitter.onTimeout(() -> deregister(incidentId, emitter));
        emitter.onError(err -> deregister(incidentId, emitter));

        list.add(emitter);
        log.debug("{}: registered emitter for incident {} (total: {})",
            CLASSNAME, incidentId, list.size());
    }

    /**
     * Deregisters (removes) a specific emitter for the given incident.
     *
     * @param incidentId the incident identifier
     * @param emitter    the SseEmitter to remove
     */
    public void deregister(String incidentId, SseEmitter emitter) {
        List<SseEmitter> list = emitters.get(incidentId);
        if (list != null) {
            list.remove(emitter);
            if (list.isEmpty()) {
                emitters.remove(incidentId);
            }
        }
    }

    // =========================================================================
    // Broadcasting
    // =========================================================================

    /**
     * Broadcasts an event to all SSE emitters registered for the given incident.
     *
     * @param incidentId the incident identifier
     * @param eventType  the SSE event type (e.g., "incident.updated", "task.updated")
     * @param data       the event payload
     * @param actor      the actor who triggered the event
     */
    public void broadcast(String incidentId, String eventType, Map<String, Object> data, String actor) {
        // Generate monotonic event ID
        String eventId = "evt-" + eventIdCounter.incrementAndGet();

        // Serialize data
        String jsonData;
        try {
            jsonData = objectMapper.writeValueAsString(data);
        } catch (Exception e) {
            log.warn("{}: failed to serialize SSE data: {}", CLASSNAME, e.getMessage());
            return;
        }

        // Buffer event for Last-Event-ID replay
        bufferEvent(incidentId, eventId, eventType, jsonData);

        // Send to all connected emitters
        List<SseEmitter> list = emitters.get(incidentId);
        if (list == null || list.isEmpty()) {
            log.debug("{}: no emitters registered for incident {}", CLASSNAME, incidentId);
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
                log.debug("{}: failed to send SSE to emitter: {}", CLASSNAME, e.getMessage());
            }
        }

        // Remove failed emitters
        if (!failed.isEmpty()) {
            list.removeAll(failed);
            if (list.isEmpty()) {
                emitters.remove(incidentId);
            }
        }
    }

    // =========================================================================
    // Event buffer and replay
    // =========================================================================

    /**
     * Buffers an event for Last-Event-ID replay support.
     */
    private void bufferEvent(String incidentId, String eventId, String eventType, String jsonData) {
        Deque<BufferedEvent> buffer = eventBuffer.computeIfAbsent(
            incidentId, k -> new ConcurrentLinkedDeque<>());

        buffer.addLast(new BufferedEvent(eventId, eventType, jsonData));

        // Trim to max buffer size
        while (buffer.size() > EVENT_BUFFER_SIZE) {
            buffer.pollFirst();
        }
    }

    /**
     * Replays buffered events since the specified Last-Event-ID to an emitter.
     *
     * @param incidentId  the incident identifier
     * @param lastEventId the Last-Event-ID header value
     * @param emitter     the SseEmitter to replay to
     */
    public void replayFrom(String incidentId, String lastEventId, SseEmitter emitter) {
        if (lastEventId == null || lastEventId.isBlank()) return;

        Deque<BufferedEvent> buffer = eventBuffer.get(incidentId);
        if (buffer == null || buffer.isEmpty()) {
            // No buffer — send state-refresh
            sendStateRefresh(emitter, incidentId, lastEventId);
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
                    log.debug("{}: failed to replay event to emitter: {}", CLASSNAME, e.getMessage());
                    break;
                }
            }
            if (event.eventId().equals(lastEventId)) {
                found = true;
            }
        }

        // If Last-Event-ID was not found in the buffer, it's expired — send state-refresh
        if (!found) {
            sendStateRefresh(emitter, incidentId, lastEventId);
        }
    }

    /**
     * Sends a state-refresh event when the Last-Event-ID is expired (not found in buffer).
     */
    private void sendStateRefresh(SseEmitter emitter, String incidentId, String expiredEventId) {
        try {
            Map<String, Object> refreshPayload = new LinkedHashMap<>();
            refreshPayload.put("reason", "Last-Event-ID expired — full state refresh required");
            refreshPayload.put("expiredEventId", expiredEventId);
            refreshPayload.put("incidentId", incidentId);
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
     * Sends keepalive comments to all active emitters.
     */
    private void sendKeepalives() {
        for (Map.Entry<String, List<SseEmitter>> entry : emitters.entrySet()) {
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
     * Returns the number of active emitters for a given incident.
     */
    public int getEmitterCount(String incidentId) {
        List<SseEmitter> list = emitters.get(incidentId);
        return list != null ? list.size() : 0;
    }
}
