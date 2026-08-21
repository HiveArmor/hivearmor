package com.hivearmor.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Manages per-execution SSE emitters for the live playbook execution viewer.
 *
 * <p>The outer map is a {@link ConcurrentHashMap} keyed by {@code executionId}.
 * Each value is a {@link CopyOnWriteArrayList} of {@link SseEmitter} instances so
 * that multiple browser tabs can observe the same execution concurrently without
 * requiring explicit synchronisation on the inner list.
 *
 * <p>All emitter lifecycle callbacks ({@code onCompletion}, {@code onTimeout},
 * {@code onError}) remove the emitter from the list silently. When a
 * {@code playbook_completed} or {@code playbook_failed} event is broadcast,
 * {@link SseEmitter#complete()} is called on every registered emitter so the
 * browser-side {@code EventSource} can close cleanly.
 *
 * <p>Constructor injection only — no {@code @Autowired} on fields. No Lombok.
 */
@Service
public class PlaybookExecutionStreamService {

    private static final Logger log = LoggerFactory.getLogger(PlaybookExecutionStreamService.class);

    /** SSE timeout: 10 minutes expressed in milliseconds. */
    private static final long EMITTER_TIMEOUT_MS = 600_000L;

    private static final String EVENT_PLAYBOOK_COMPLETED = "playbook_completed";
    private static final String EVENT_PLAYBOOK_FAILED    = "playbook_failed";

    /**
     * Outer map: executionId → thread-safe list of active emitters.
     * ConcurrentHashMap for the outer map; CopyOnWriteArrayList for each per-execution list.
     */
    private final Map<String, List<SseEmitter>> emitters;

    // ── Constructor ──────────────────────────────────────────────────────────

    /**
     * Creates the service with an empty emitter registry.
     * No collaborating beans are required at this layer.
     */
    public PlaybookExecutionStreamService() {
        this.emitters = new ConcurrentHashMap<>();
    }

    // ── Public API ───────────────────────────────────────────────────────────

    /**
     * Creates and registers a new {@link SseEmitter} for the given {@code executionId}.
     *
     * <p>The emitter has a 10-minute timeout. Completion, timeout, and error callbacks
     * all remove the emitter from the registry so stale entries do not accumulate.
     *
     * @param executionId the unique execution identifier (UUID string)
     * @return the newly created {@link SseEmitter}; never {@code null}
     */
    public SseEmitter createEmitter(String executionId) {
        SseEmitter emitter = new SseEmitter(EMITTER_TIMEOUT_MS);

        // Lazily create the per-execution list if this is the first subscriber.
        List<SseEmitter> list = emitters.computeIfAbsent(
                executionId, id -> new CopyOnWriteArrayList<>());
        list.add(emitter);

        // Lifecycle callbacks — remove from the list; do not log sensitive context.
        emitter.onCompletion(() -> removeEmitter(executionId, emitter));
        emitter.onTimeout(()    -> removeEmitter(executionId, emitter));
        emitter.onError(e       -> removeEmitter(executionId, emitter));

        log.debug("PlaybookExecutionStreamService: emitter registered [executionId={}]", executionId);
        return emitter;
    }

    /**
     * Broadcasts a {@link PlaybookExecutionEvent} to every subscriber of the given execution.
     *
     * <p>Each emitter receives
     * {@code SseEmitter.event().name(event.getType()).data(event)}.
     * If the event type is {@code "playbook_completed"} or {@code "playbook_failed"},
     * {@link SseEmitter#complete()} is called immediately after the send so the
     * browser-side {@code EventSource} can transition to the closed state.
     *
     * <p>Any {@link IOException} thrown during a send silently removes the offending
     * emitter — it is treated as a dead connection. No event payload contents, execution
     * outputs, or error messages are written to the log.
     *
     * @param executionId the unique execution identifier
     * @param event       the event to broadcast; must not be {@code null}
     */
    public void broadcastEvent(String executionId, PlaybookExecutionEvent event) {
        List<SseEmitter> list = emitters.get(executionId);
        if (list == null || list.isEmpty()) {
            return;
        }

        boolean isTerminal = EVENT_PLAYBOOK_COMPLETED.equals(event.getType())
                          || EVENT_PLAYBOOK_FAILED.equals(event.getType());

        SseEmitter.SseEventBuilder sseEvent = SseEmitter.event()
                .name(event.getType())
                .data(event);

        for (SseEmitter emitter : list) {
            try {
                emitter.send(sseEvent);
                if (isTerminal) {
                    emitter.complete();
                }
            } catch (IOException e) {
                // Dead connection — remove silently; do not log the payload.
                removeEmitter(executionId, emitter);
            }
        }

        if (isTerminal) {
            // Clean up the map entry once the execution stream is closed.
            emitters.remove(executionId);
            log.debug("PlaybookExecutionStreamService: execution stream closed [executionId={}]",
                      executionId);
        }
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    /**
     * Removes {@code emitter} from the per-execution list.
     * If the list becomes empty after removal, the outer map entry is also removed.
     *
     * @param executionId the execution whose list should be pruned
     * @param emitter     the emitter to remove
     */
    private void removeEmitter(String executionId, SseEmitter emitter) {
        List<SseEmitter> list = emitters.get(executionId);
        if (list != null) {
            list.remove(emitter);
            if (list.isEmpty()) {
                emitters.remove(executionId);
            }
        }
    }
}
