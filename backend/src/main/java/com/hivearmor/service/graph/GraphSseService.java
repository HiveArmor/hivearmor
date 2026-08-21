package com.hivearmor.service.graph;

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
 * SSE broadcaster for snapshot-scoped constellation graph updates (CON-005).
 *
 * <p>Manages per-snapshot SSE emitter registrations and broadcasts graph events
 * to all connected clients. Implements:
 * <ul>
 *   <li>ConcurrentHashMap&lt;String, List&lt;SseEmitter&gt;&gt; keyed by snapshot ID</li>
 *   <li>Max 5 connections per snapshot (drops oldest when exceeded)</li>
 *   <li>Monotonic event ID counter per snapshot for Last-Event-ID support</li>
 *   <li>30-second keepalive via @Scheduled</li>
 *   <li>Last-Event-ID replay from in-memory buffer (last 50 events per snapshot)</li>
 *   <li>30-minute SseEmitter timeout</li>
 *   <li>SSE connection resets snapshot TTL (keeps snapshot alive while viewing)</li>
 *   <li>On snapshot expiry: sends snapshot.expired event and closes all connections</li>
 * </ul>
 *
 * <p>Event types:
 * <ul>
 *   <li>{@code node.risk_changed} — node risk score updated</li>
 *   <li>{@code node.alert_added} — new alert added to a node</li>
 *   <li>{@code edge.strength_changed} — edge strength/event count increased</li>
 *   <li>{@code edge.discovered} — new edge between existing nodes</li>
 *   <li>{@code node.discovered} — new node connected to graph</li>
 *   <li>{@code snapshot.expired} — snapshot has expired (sent before close)</li>
 * </ul>
 *
 * <p>Sprint 48 — Threat Constellation.
 */
@Service
public class GraphSseService {

    private static final Logger log = LoggerFactory.getLogger(GraphSseService.class);
    private static final String CLASSNAME = "GraphSseService";

    /** Maximum SSE connections per snapshot. */
    private static final int MAX_EMITTERS_PER_SNAPSHOT = 5;

    /** SseEmitter timeout: 30 minutes. */
    public static final long EMITTER_TIMEOUT_MS = 30 * 60 * 1000L;

    /** Event buffer size per snapshot (for Last-Event-ID replay). */
    private static final int EVENT_BUFFER_SIZE = 50;

    /** Active emitters keyed by snapshot ID. */
    private final ConcurrentHashMap<String, List<SseEmitter>> emitters = new ConcurrentHashMap<>();

    /** Event buffer for Last-Event-ID replay, keyed by snapshot ID. */
    private final ConcurrentHashMap<String, Deque<BufferedEvent>> eventBuffer = new ConcurrentHashMap<>();

    /** Monotonic event ID counter per snapshot. */
    private final ConcurrentHashMap<String, AtomicLong> eventCounters = new ConcurrentHashMap<>();

    private final ObjectMapper objectMapper;
    private final GraphSnapshotStore snapshotStore;

    /**
     * A buffered event for replay support.
     */
    private record BufferedEvent(String eventId, String eventType, String data) {}

    public GraphSseService(ObjectMapper objectMapper, GraphSnapshotStore snapshotStore) {
        this.objectMapper = objectMapper;
        this.snapshotStore = snapshotStore;
    }

    // =========================================================================
    // Emitter lifecycle
    // =========================================================================

    /**
     * Registers an SseEmitter for the given snapshot.
     *
     * <p>Adds the emitter to the per-snapshot list, enforcing max 5 connections
     * (drops oldest if exceeded). Sets completion/timeout/error callbacks for cleanup.
     * Resets the snapshot TTL to keep it alive while clients are viewing.
     *
     * @param snapshotId the snapshot identifier
     * @param emitter    the SseEmitter to register
     */
    public void register(String snapshotId, SseEmitter emitter) {
        List<SseEmitter> list = emitters.computeIfAbsent(snapshotId, k -> new CopyOnWriteArrayList<>());

        // Enforce max connections — drop oldest if exceeded
        while (list.size() >= MAX_EMITTERS_PER_SNAPSHOT) {
            SseEmitter oldest = list.remove(0);
            try {
                oldest.complete();
            } catch (Exception e) {
                // Already completed/failed — ignore
            }
            log.debug("{}: dropped oldest emitter for snapshot {} (max {} reached)",
                CLASSNAME, snapshotId, MAX_EMITTERS_PER_SNAPSHOT);
        }

        // Set callbacks for cleanup
        emitter.onCompletion(() -> deregister(snapshotId, emitter));
        emitter.onTimeout(() -> deregister(snapshotId, emitter));
        emitter.onError(err -> deregister(snapshotId, emitter));

        list.add(emitter);

        // Reset snapshot TTL — connection keeps snapshot alive
        snapshotStore.resetTtl(snapshotId);

        log.debug("{}: registered graph emitter for snapshot {} (total: {})",
            CLASSNAME, snapshotId, list.size());
    }

    /**
     * Deregisters (removes) a specific emitter for the given snapshot.
     *
     * @param snapshotId the snapshot identifier
     * @param emitter    the SseEmitter to remove
     */
    public void deregister(String snapshotId, SseEmitter emitter) {
        List<SseEmitter> list = emitters.get(snapshotId);
        if (list != null) {
            list.remove(emitter);
            if (list.isEmpty()) {
                emitters.remove(snapshotId);
            }
        }
    }

    // =========================================================================
    // Broadcasting
    // =========================================================================

    /**
     * Broadcasts an event to all SSE emitters registered for the given snapshot.
     *
     * <p>Supported event types:
     * <ul>
     *   <li>node.risk_changed</li>
     *   <li>node.alert_added</li>
     *   <li>edge.strength_changed</li>
     *   <li>edge.discovered</li>
     *   <li>node.discovered</li>
     * </ul>
     *
     * @param snapshotId the snapshot identifier
     * @param eventType  the SSE event type
     * @param data       the event payload map
     */
    public void broadcast(String snapshotId, String eventType, Map<String, Object> data) {
        // Generate monotonic event ID for this snapshot
        AtomicLong counter = eventCounters.computeIfAbsent(snapshotId,
            k -> new AtomicLong(System.currentTimeMillis()));
        String eventId = "evt-" + counter.incrementAndGet();

        // Serialize data
        String jsonData;
        try {
            jsonData = objectMapper.writeValueAsString(data);
        } catch (Exception e) {
            log.warn("{}: failed to serialize graph SSE data: {}", CLASSNAME, e.getMessage());
            return;
        }

        // Buffer event for Last-Event-ID replay
        bufferEvent(snapshotId, eventId, eventType, jsonData);

        // Send to all connected emitters
        List<SseEmitter> list = emitters.get(snapshotId);
        if (list == null || list.isEmpty()) {
            log.debug("{}: no graph emitters registered for snapshot {}", CLASSNAME, snapshotId);
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
                log.debug("{}: failed to send graph SSE to emitter: {}", CLASSNAME, e.getMessage());
            }
        }

        // Remove failed emitters
        if (!failed.isEmpty()) {
            list.removeAll(failed);
            if (list.isEmpty()) {
                emitters.remove(snapshotId);
            }
        }
    }

    // =========================================================================
    // Snapshot expiry handling
    // =========================================================================

    /**
     * Called when a snapshot expires. Sends a {@code snapshot.expired} event to all
     * connected clients, then closes all SSE connections for that snapshot.
     *
     * @param snapshotId the expired snapshot identifier
     */
    public void onSnapshotExpired(String snapshotId) {
        List<SseEmitter> list = emitters.get(snapshotId);
        if (list == null || list.isEmpty()) {
            // No active connections — just clean up buffers
            cleanupSnapshot(snapshotId);
            return;
        }

        // Send snapshot.expired event before closing
        Map<String, Object> expiredData = new LinkedHashMap<>();
        expiredData.put("type", "snapshot.expired");
        expiredData.put("snapshotId", snapshotId);
        expiredData.put("timestamp", java.time.Instant.now().toString());

        String jsonData;
        try {
            jsonData = objectMapper.writeValueAsString(expiredData);
        } catch (Exception e) {
            jsonData = "{\"type\":\"snapshot.expired\",\"snapshotId\":\"" + snapshotId + "\"}";
        }

        for (SseEmitter emitter : list) {
            try {
                SseEmitter.SseEventBuilder event = SseEmitter.event()
                    .name("snapshot.expired")
                    .data(jsonData);
                emitter.send(event);
            } catch (Exception e) {
                // Best-effort — emitter may already be closed
            }
        }

        // Close all connections
        for (SseEmitter emitter : list) {
            try {
                emitter.complete();
            } catch (Exception e) {
                // Already completed/failed — ignore
            }
        }

        // Remove all state for this snapshot
        cleanupSnapshot(snapshotId);
        log.debug("{}: closed all SSE connections for expired snapshot {}", CLASSNAME, snapshotId);
    }

    /**
     * Cleans up all internal state for a snapshot (emitters, buffers, counters).
     */
    private void cleanupSnapshot(String snapshotId) {
        emitters.remove(snapshotId);
        eventBuffer.remove(snapshotId);
        eventCounters.remove(snapshotId);
    }

    // =========================================================================
    // Event buffer and replay
    // =========================================================================

    /**
     * Buffers an event for Last-Event-ID replay support.
     */
    private void bufferEvent(String snapshotId, String eventId, String eventType, String jsonData) {
        Deque<BufferedEvent> buffer = eventBuffer.computeIfAbsent(
            snapshotId, k -> new ConcurrentLinkedDeque<>());

        buffer.addLast(new BufferedEvent(eventId, eventType, jsonData));

        // Trim to max buffer size (50 events)
        while (buffer.size() > EVENT_BUFFER_SIZE) {
            buffer.pollFirst();
        }
    }

    /**
     * Replays buffered events since the specified Last-Event-ID to an emitter.
     *
     * @param snapshotId  the snapshot identifier
     * @param lastEventId the Last-Event-ID header value
     * @param emitter     the SseEmitter to replay to
     */
    public void replayFrom(String snapshotId, String lastEventId, SseEmitter emitter) {
        if (lastEventId == null || lastEventId.isBlank()) return;

        Deque<BufferedEvent> buffer = eventBuffer.get(snapshotId);
        if (buffer == null || buffer.isEmpty()) {
            // No buffer — send state-refresh
            sendStateRefresh(emitter, snapshotId, lastEventId);
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
                    log.debug("{}: failed to replay graph event to emitter: {}",
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
            sendStateRefresh(emitter, snapshotId, lastEventId);
        }
    }

    /**
     * Sends a state-refresh event when the Last-Event-ID is expired (not found in buffer).
     */
    private void sendStateRefresh(SseEmitter emitter, String snapshotId, String expiredEventId) {
        try {
            Map<String, Object> refreshPayload = new LinkedHashMap<>();
            refreshPayload.put("reason", "Last-Event-ID expired — full state refresh required");
            refreshPayload.put("expiredEventId", expiredEventId);
            refreshPayload.put("snapshotId", snapshotId);
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
     * Sends keepalive comments to all active graph emitters every 30 seconds.
     * Also resets the snapshot TTL for any snapshot with active connections.
     */
    @Scheduled(fixedRate = 30_000)
    public void sendKeepalives() {
        for (Map.Entry<String, List<SseEmitter>> entry : emitters.entrySet()) {
            String snapshotId = entry.getKey();
            List<SseEmitter> list = entry.getValue();
            if (list == null || list.isEmpty()) continue;

            // Reset snapshot TTL — active SSE connection keeps snapshot alive
            snapshotStore.resetTtl(snapshotId);

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
                    emitters.remove(snapshotId);
                }
            }
        }
    }

    // =========================================================================
    // Info
    // =========================================================================

    /**
     * Returns the number of active emitters for a given snapshot.
     */
    public int getEmitterCount(String snapshotId) {
        List<SseEmitter> list = emitters.get(snapshotId);
        return list != null ? list.size() : 0;
    }

    /**
     * Returns all snapshot IDs that have active SSE connections.
     */
    public Set<String> getActiveSnapshotIds() {
        return Collections.unmodifiableSet(emitters.keySet());
    }
}
