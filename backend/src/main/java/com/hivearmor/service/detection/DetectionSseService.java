package com.hivearmor.service.detection;

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

/**
 * Service for detection health SSE broadcasting (DET-013).
 *
 * <p>Manages SSE emitters per tenant with the following constraints:
 * <ul>
 *   <li>Max 10 emitters per tenant</li>
 *   <li>30-minute timeout</li>
 *   <li>30-second keepalive heartbeat</li>
 *   <li>100-event replay buffer for Last-Event-ID reconnection</li>
 * </ul>
 *
 * <p>Event types:
 * <ul>
 *   <li>rule.execution_completed</li>
 *   <li>rule.error</li>
 *   <li>rule.health_changed</li>
 *   <li>rule.status_changed</li>
 *   <li>rule.imported</li>
 * </ul>
 *
 * <p>Sprint 47 — Detection Rules.
 */
@Service
public class DetectionSseService {

    private static final Logger log = LoggerFactory.getLogger(DetectionSseService.class);
    private static final String CLASSNAME = "DetectionSseService";

    /** Maximum emitters per tenant. */
    private static final int MAX_EMITTERS_PER_TENANT = 10;

    /** SSE timeout: 30 minutes. */
    private static final long SSE_TIMEOUT_MS = 30 * 60 * 1000L;

    /** Replay buffer size per tenant. */
    private static final int REPLAY_BUFFER_SIZE = 100;

    /** Emitters per tenant. */
    private final Map<Long, CopyOnWriteArrayList<SseEmitter>> tenantEmitters = new ConcurrentHashMap<>();

    /** Replay buffer per tenant (event ID → event data). */
    private final Map<Long, LinkedList<SseEvent>> replayBuffers = new ConcurrentHashMap<>();

    /** Global event counter for unique IDs. */
    private long eventIdCounter = 0;

    /**
     * Creates a new SSE emitter for the given tenant.
     *
     * @param tenantId     tenant ID
     * @param lastEventId  Last-Event-ID header for replay (optional)
     * @return configured SSE emitter
     */
    public SseEmitter createEmitter(Long tenantId, String lastEventId) {
        // Enforce max emitters per tenant
        CopyOnWriteArrayList<SseEmitter> emitters = tenantEmitters.computeIfAbsent(
            tenantId, k -> new CopyOnWriteArrayList<>());

        if (emitters.size() >= MAX_EMITTERS_PER_TENANT) {
            // Remove oldest emitter
            SseEmitter oldest = emitters.remove(0);
            oldest.complete();
            log.warn("{}.createEmitter: max emitters reached for tenant={}, removed oldest", CLASSNAME, tenantId);
        }

        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);

        emitter.onCompletion(() -> {
            emitters.remove(emitter);
            log.debug("{}.onCompletion: emitter removed for tenant={}", CLASSNAME, tenantId);
        });

        emitter.onTimeout(() -> {
            emitters.remove(emitter);
            log.debug("{}.onTimeout: emitter timed out for tenant={}", CLASSNAME, tenantId);
        });

        emitter.onError(ex -> {
            emitters.remove(emitter);
            log.debug("{}.onError: emitter error for tenant={}: {}", CLASSNAME, tenantId, ex.getMessage());
        });

        emitters.add(emitter);

        // Replay events since Last-Event-ID
        if (lastEventId != null && !lastEventId.isBlank()) {
            replayEvents(emitter, tenantId, lastEventId);
        }

        log.info("{}.createEmitter: created for tenant={} total={} lastEventId={}",
            CLASSNAME, tenantId, emitters.size(), lastEventId);

        return emitter;
    }

    /**
     * Broadcasts an event to all connected clients for the given tenant.
     *
     * @param tenantId  tenant to broadcast to
     * @param eventType event type (e.g., "rule.execution_completed")
     * @param data      event data
     */
    public void broadcast(Long tenantId, String eventType, Map<String, Object> data) {
        String eventId = generateEventId();

        // Store in replay buffer
        SseEvent event = new SseEvent(eventId, eventType, data, Instant.now());
        addToReplayBuffer(tenantId, event);

        // Send to all connected emitters
        CopyOnWriteArrayList<SseEmitter> emitters = tenantEmitters.get(tenantId);
        if (emitters == null || emitters.isEmpty()) {
            log.debug("{}.broadcast: no emitters for tenant={}, event buffered only", CLASSNAME, tenantId);
            return;
        }

        List<SseEmitter> deadEmitters = new ArrayList<>();

        for (SseEmitter emitter : emitters) {
            try {
                SseEmitter.SseEventBuilder builder = SseEmitter.event()
                    .id(eventId)
                    .name(eventType)
                    .data(data);
                emitter.send(builder);
            } catch (IOException e) {
                deadEmitters.add(emitter);
            }
        }

        // Remove dead emitters
        for (SseEmitter dead : deadEmitters) {
            emitters.remove(dead);
        }

        log.debug("{}.broadcast: type={} tenant={} sent={} dead={}",
            CLASSNAME, eventType, tenantId, emitters.size(), deadEmitters.size());
    }

    /**
     * Sends keepalive heartbeat to all connected emitters.
     * Scheduled every 30 seconds.
     */
    @Scheduled(fixedRate = 30000)
    public void sendKeepalive() {
        for (Map.Entry<Long, CopyOnWriteArrayList<SseEmitter>> entry : tenantEmitters.entrySet()) {
            List<SseEmitter> deadEmitters = new ArrayList<>();

            for (SseEmitter emitter : entry.getValue()) {
                try {
                    SseEmitter.SseEventBuilder builder = SseEmitter.event()
                        .comment("keepalive")
                        .id(generateEventId());
                    emitter.send(builder);
                } catch (IOException e) {
                    deadEmitters.add(emitter);
                }
            }

            for (SseEmitter dead : deadEmitters) {
                entry.getValue().remove(dead);
            }
        }
    }

    /**
     * Broadcasts a rule execution completed event.
     */
    public void broadcastExecutionCompleted(Long tenantId, String ruleId, String ruleName,
                                            long duration, int alertsGenerated) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("ruleId", ruleId);
        data.put("ruleName", ruleName);
        data.put("duration", duration);
        data.put("alertsGenerated", alertsGenerated);
        data.put("timestamp", Instant.now().toString());
        broadcast(tenantId, "rule.execution_completed", data);
    }

    /**
     * Broadcasts a rule error event.
     */
    public void broadcastRuleError(Long tenantId, String ruleId, String ruleName, String error) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("ruleId", ruleId);
        data.put("ruleName", ruleName);
        data.put("error", error);
        data.put("timestamp", Instant.now().toString());
        broadcast(tenantId, "rule.error", data);
    }

    /**
     * Broadcasts a health status change event.
     */
    public void broadcastHealthChanged(Long tenantId, String ruleId, String ruleName,
                                       String previousHealth, String newHealth) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("ruleId", ruleId);
        data.put("ruleName", ruleName);
        data.put("previousHealth", previousHealth);
        data.put("newHealth", newHealth);
        data.put("timestamp", Instant.now().toString());
        broadcast(tenantId, "rule.health_changed", data);
    }

    /**
     * Broadcasts a status change event.
     */
    public void broadcastStatusChanged(Long tenantId, String ruleId, String ruleName,
                                       String previousStatus, String newStatus) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("ruleId", ruleId);
        data.put("ruleName", ruleName);
        data.put("previousStatus", previousStatus);
        data.put("newStatus", newStatus);
        data.put("timestamp", Instant.now().toString());
        broadcast(tenantId, "rule.status_changed", data);
    }

    /**
     * Broadcasts an import completed event.
     */
    public void broadcastImported(Long tenantId, int importedCount, String importedBy) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("importedCount", importedCount);
        data.put("importedBy", importedBy);
        data.put("timestamp", Instant.now().toString());
        broadcast(tenantId, "rule.imported", data);
    }

    /**
     * Returns the count of active emitters for a tenant.
     */
    public int getActiveEmitterCount(Long tenantId) {
        CopyOnWriteArrayList<SseEmitter> emitters = tenantEmitters.get(tenantId);
        return emitters != null ? emitters.size() : 0;
    }

    // =========================================================================
    // Internal: Replay buffer
    // =========================================================================

    private void addToReplayBuffer(Long tenantId, SseEvent event) {
        LinkedList<SseEvent> buffer = replayBuffers.computeIfAbsent(tenantId, k -> new LinkedList<>());
        synchronized (buffer) {
            buffer.addLast(event);
            while (buffer.size() > REPLAY_BUFFER_SIZE) {
                buffer.removeFirst();
            }
        }
    }

    private void replayEvents(SseEmitter emitter, Long tenantId, String lastEventId) {
        LinkedList<SseEvent> buffer = replayBuffers.get(tenantId);
        if (buffer == null) {
            // No buffer — send state-refresh
            sendStateRefresh(emitter, tenantId, lastEventId);
            return;
        }

        boolean replay = false;
        boolean found = false;
        synchronized (buffer) {
            for (SseEvent event : buffer) {
                if (replay) {
                    try {
                        SseEmitter.SseEventBuilder builder = SseEmitter.event()
                            .id(event.id)
                            .name(event.eventType)
                            .data(event.data);
                        emitter.send(builder);
                    } catch (IOException e) {
                        break;
                    }
                }
                if (event.id.equals(lastEventId)) {
                    replay = true;
                    found = true;
                }
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
            String json = "{\"reason\":\"Last-Event-ID expired — full state refresh required\","
                + "\"expiredEventId\":\"" + expiredEventId + "\","
                + "\"tenantId\":" + tenantId + ","
                + "\"serverTime\":\"" + Instant.now() + "\"}";
            emitter.send(SseEmitter.event()
                .name("state-refresh")
                .data(json));
        } catch (IOException e) {
            log.warn("{}: failed to send state-refresh to emitter: {}", CLASSNAME, e.getMessage());
        }
    }

    private synchronized String generateEventId() {
        eventIdCounter++;
        return String.valueOf(eventIdCounter);
    }

    // =========================================================================
    // Internal: Event data class
    // =========================================================================

    private static class SseEvent {
        final String id;
        final String eventType;
        final Map<String, Object> data;
        final Instant timestamp;

        SseEvent(String id, String eventType, Map<String, Object> data, Instant timestamp) {
            this.id = id;
            this.eventType = eventType;
            this.data = data;
            this.timestamp = timestamp;
        }
    }
}
