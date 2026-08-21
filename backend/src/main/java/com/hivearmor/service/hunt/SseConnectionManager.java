package com.hivearmor.service.hunt;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.*;

/**
 * Manages Server-Sent Event connections per alert for live investigation streams.
 *
 * <p>Stores active {@link SseEmitter} instances in a thread-safe map keyed by alert ID.
 * Enforces a maximum of {@value #MAX_CONNECTIONS_PER_ALERT} concurrent connections per alert
 * to prevent resource exhaustion.
 *
 * <p>Provides keepalive scheduling: each registered emitter receives a {@code :keepalive}
 * comment every 30 seconds to prevent proxy/load-balancer connection timeouts.
 *
 * <p>Sprint 41 — ALT-012: Live investigation SSE stream.
 */
@Component
public class SseConnectionManager {

    private static final Logger log = LoggerFactory.getLogger(SseConnectionManager.class);

    public static final int MAX_CONNECTIONS_PER_ALERT = 10;
    private static final long KEEPALIVE_INTERVAL_SECONDS = 30;

    /** Map<alertId, List<SseEmitter>> — concurrent access safe. */
    private final ConcurrentHashMap<String, CopyOnWriteArrayList<SseEmitter>> connections = new ConcurrentHashMap<>();

    /** Tracks scheduled keepalive tasks per emitter so they can be cancelled on remove. */
    private final ConcurrentHashMap<SseEmitter, ScheduledFuture<?>> keepaliveTasks = new ConcurrentHashMap<>();

    /** Single-threaded scheduler for keepalive comments. */
    private final ScheduledExecutorService keepaliveScheduler =
        Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "sse-keepalive");
            t.setDaemon(true);
            return t;
        });

    /**
     * Registers an emitter for the given alert ID.
     *
     * <p>If the number of connections for this alert already equals or exceeds
     * {@value #MAX_CONNECTIONS_PER_ALERT}, throws a 429 Too Many Requests exception.
     *
     * <p>Also schedules a keepalive task that sends a {@code :keepalive} comment
     * every 30 seconds to prevent proxy timeouts.
     *
     * @param alertId the alert identifier
     * @param emitter the SSE emitter to register
     * @throws ResponseStatusException with 429 status if the connection limit is exceeded
     */
    public void register(String alertId, SseEmitter emitter) {
        CopyOnWriteArrayList<SseEmitter> emitters = connections.computeIfAbsent(
            alertId, k -> new CopyOnWriteArrayList<>());

        if (emitters.size() >= MAX_CONNECTIONS_PER_ALERT) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                "Maximum SSE connections (" + MAX_CONNECTIONS_PER_ALERT + ") reached for alert " + alertId);
        }

        emitters.add(emitter);
        log.debug("Registered SSE connection for alert [{}]. Total connections: {}", alertId, emitters.size());

        // Schedule keepalive for this emitter
        ScheduledFuture<?> task = keepaliveScheduler.scheduleAtFixedRate(() -> {
            try {
                emitter.send(SseEmitter.event().comment("keepalive"));
            } catch (IOException e) {
                // Connection is dead — will be cleaned up by onError/onCompletion callbacks
                log.debug("Keepalive failed for alert [{}], connection likely closed", alertId);
                remove(alertId, emitter);
            }
        }, KEEPALIVE_INTERVAL_SECONDS, KEEPALIVE_INTERVAL_SECONDS, TimeUnit.SECONDS);

        keepaliveTasks.put(emitter, task);
    }

    /**
     * Removes an emitter from the connection map for the given alert ID.
     * Cancels the associated keepalive task and cleans up empty entries.
     *
     * @param alertId the alert identifier
     * @param emitter the SSE emitter to remove
     */
    public void remove(String alertId, SseEmitter emitter) {
        // Cancel keepalive task
        ScheduledFuture<?> task = keepaliveTasks.remove(emitter);
        if (task != null) {
            task.cancel(false);
        }

        CopyOnWriteArrayList<SseEmitter> emitters = connections.get(alertId);
        if (emitters != null) {
            emitters.remove(emitter);
            // Cleanup empty entries
            if (emitters.isEmpty()) {
                connections.remove(alertId, emitters);
            }
            log.debug("Removed SSE connection for alert [{}]. Remaining: {}",
                alertId, emitters.size());
        }
    }

    /**
     * Broadcasts an SSE event to all connected emitters for the given alert.
     *
     * <p>If sending to a specific emitter fails with an IOException, that emitter
     * is considered dead and removed from the connection map.
     *
     * @param alertId   the alert identifier
     * @param eventType the SSE event type (e.g., "alert.updated")
     * @param data      the JSON-serialized event payload
     * @param eventId   the event ID for Last-Event-ID reconnection support
     */
    public void broadcast(String alertId, String eventType, String data, String eventId) {
        CopyOnWriteArrayList<SseEmitter> emitters = connections.get(alertId);
        if (emitters == null || emitters.isEmpty()) {
            return;
        }

        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event()
                    .name(eventType)
                    .id(eventId)
                    .data(data));
            } catch (IOException e) {
                log.debug("Failed to send SSE event to emitter for alert [{}], removing dead connection", alertId);
                remove(alertId, emitter);
            }
        }
    }

    /**
     * Returns the current number of active SSE connections for the given alert.
     *
     * @param alertId the alert identifier
     * @return the connection count (0 if no connections exist)
     */
    public int getConnectionCount(String alertId) {
        CopyOnWriteArrayList<SseEmitter> emitters = connections.get(alertId);
        return emitters != null ? emitters.size() : 0;
    }
}
