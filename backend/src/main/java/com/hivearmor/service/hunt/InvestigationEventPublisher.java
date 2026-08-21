package com.hivearmor.service.hunt;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Publishes investigation events to connected SSE clients via {@link SseConnectionManager}.
 *
 * <p>Serializes payloads to JSON and broadcasts them as named SSE events. Maintains an
 * atomic event ID counter per alert to support {@code Last-Event-ID} reconnection.
 *
 * <p>Sprint 41 — ALT-012: Live investigation SSE stream.
 */
@Component
public class InvestigationEventPublisher {

    private static final Logger log = LoggerFactory.getLogger(InvestigationEventPublisher.class);

    private final SseConnectionManager sseConnectionManager;
    private final ObjectMapper objectMapper;

    /** Atomic event ID counter per alert for Last-Event-ID support. */
    private final ConcurrentHashMap<String, AtomicLong> eventCounters = new ConcurrentHashMap<>();

    public InvestigationEventPublisher(SseConnectionManager sseConnectionManager,
                                       ObjectMapper objectMapper) {
        this.sseConnectionManager = sseConnectionManager;
        this.objectMapper = objectMapper;
    }

    /**
     * Publishes an event to all SSE clients connected to the given alert's stream.
     *
     * <p>Serializes the payload to JSON, increments the event ID counter for the alert,
     * and broadcasts via the SSE connection manager.
     *
     * @param alertId   the alert identifier
     * @param eventType the SSE event type (e.g., "alert.updated", "story.appended")
     * @param payload   the event payload object (will be serialized to JSON)
     */
    public void publish(String alertId, String eventType, Object payload) {
        if (alertId == null || alertId.isBlank()) {
            log.debug("Cannot publish SSE event — alertId is null or blank");
            return;
        }

        if (sseConnectionManager.getConnectionCount(alertId) == 0) {
            // No connected clients — skip serialization
            return;
        }

        try {
            String json = objectMapper.writeValueAsString(payload);
            String eventId = String.valueOf(nextEventId(alertId));
            sseConnectionManager.broadcast(alertId, eventType, json, eventId);
            log.debug("Published SSE event [{}] id=[{}] for alert [{}]", eventType, eventId, alertId);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize SSE event payload for alert [{}]: {}", alertId, e.getMessage());
        }
    }

    /**
     * Publishes a {@code response.status} event to all SSE clients connected
     * to the given alert's investigation stream.
     *
     * @param alertId the alert identifier (may be null if job is not linked to an alert)
     * @param jobId   the response job identifier
     * @param status  the new job status (e.g., "running", "completed", "failed")
     * @param result  the result message (may be null for non-completed statuses)
     */
    public void publishResponseStatus(String alertId, String jobId, String status, String result) {
        if (alertId == null || alertId.isBlank()) {
            return;
        }

        Map<String, Object> payload = new java.util.LinkedHashMap<>();
        payload.put("jobId", jobId);
        payload.put("status", status);
        if (result != null) {
            payload.put("result", result);
        }

        publish(alertId, "response.status", payload);
    }

    /**
     * Returns the next event ID for the given alert, incrementing the atomic counter.
     * Event IDs start at 2 (since the initial "connected" event uses ID 1).
     */
    private long nextEventId(String alertId) {
        AtomicLong counter = eventCounters.computeIfAbsent(alertId, k -> new AtomicLong(1));
        return counter.incrementAndGet();
    }
}
