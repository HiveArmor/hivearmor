package com.hivearmor.service.hunt;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;

/**
 * Tracks running searches for SSE progress streaming and status queries.
 *
 * <p>Maintains in-memory state for active and recently completed searches.
 * Provides emitter registration for SSE broadcast and auto-cleanup of entries
 * older than 1 hour.
 *
 * <p>Sprint 42 — HNT-002 + HNT-008: Search progress tracking and SSE.
 */
@Component
public class SearchProgressTracker {

    private static final Logger log = LoggerFactory.getLogger(SearchProgressTracker.class);

    /** Maximum age before auto-cleanup (1 hour). */
    private static final long MAX_AGE_MS = 60 * 60 * 1000L;

    /** Keepalive interval for search SSE (15 seconds). */
    private static final long KEEPALIVE_INTERVAL_SECONDS = 15;

    /** Maximum connections per search. */
    private static final int MAX_CONNECTIONS_PER_SEARCH = 5;

    // -------------------------------------------------------------------------
    // Data structures
    // -------------------------------------------------------------------------

    /** Active and recently completed search metadata. */
    private final ConcurrentHashMap<String, SearchMetadata> searches = new ConcurrentHashMap<>();

    /** SSE emitters registered per search ID. */
    private final ConcurrentHashMap<String, CopyOnWriteArrayList<SseEmitter>> emitters = new ConcurrentHashMap<>();

    /** Event history per search for Last-Event-ID replay. */
    private final ConcurrentHashMap<String, CopyOnWriteArrayList<SseEventRecord>> eventHistory = new ConcurrentHashMap<>();

    /** Keepalive scheduled tasks per emitter. */
    private final ConcurrentHashMap<SseEmitter, ScheduledFuture<?>> keepaliveTasks = new ConcurrentHashMap<>();

    /** Single-threaded scheduler for keepalive comments. */
    private final ScheduledExecutorService keepaliveScheduler =
        Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "search-sse-keepalive");
            t.setDaemon(true);
            return t;
        });

    // -------------------------------------------------------------------------
    // Search lifecycle
    // -------------------------------------------------------------------------

    /**
     * Registers a new search for tracking.
     *
     * @param searchId  unique search identifier
     * @param taskId    OpenSearch task ID (may be null for synchronous searches)
     * @param query     the search query string
     * @param tenantId  the tenant that initiated the search
     */
    public void track(String searchId, String taskId, String query, long tenantId) {
        track(searchId, taskId, query, tenantId, "unknown", "authorized");
    }

    public void track(String searchId, String taskId, String query, long tenantId,
                      String owner, String tenantKey) {
        SearchMetadata metadata = new SearchMetadata(searchId, taskId, query, tenantId, owner, tenantKey);
        searches.put(searchId, metadata);
        log.debug("Tracking search [{}] with taskId [{}]", searchId, taskId);
    }

    /**
     * Updates progress for a running search.
     *
     * @param searchId       the search identifier
     * @param shardsSearched number of shards completed
     * @param shardsTotal    total number of shards
     * @param totalHits      hits found so far
     */
    public void updateProgress(String searchId, int shardsSearched, int shardsTotal, long totalHits) {
        SearchMetadata metadata = searches.get(searchId);
        if (metadata != null && "running".equals(metadata.getStatus())) {
            metadata.setShardsSearched(shardsSearched);
            metadata.setShardsTotal(shardsTotal);
            metadata.setTotalHits(totalHits);
        }
    }

    /**
     * Marks a search as completed.
     *
     * @param searchId  the search identifier
     * @param duration  elapsed time in milliseconds
     * @param totalHits final hit count
     */
    public void complete(String searchId, long duration, long totalHits) {
        SearchMetadata metadata = searches.get(searchId);
        if (metadata != null) {
            metadata.setStatus("completed");
            metadata.setDurationMs(duration);
            metadata.setTotalHits(totalHits);
            metadata.setCompletedAt(Instant.now());
            log.debug("Search [{}] completed: {} hits in {}ms", searchId, totalHits, duration);
        }
    }

    /**
     * Marks a search as cancelled.
     *
     * @param searchId the search identifier
     */
    public void cancel(String searchId) {
        SearchMetadata metadata = searches.get(searchId);
        if (metadata != null) {
            metadata.setStatus("cancelled");
            metadata.setCompletedAt(Instant.now());
            metadata.setDurationMs(Duration.between(metadata.getStartedAt(), Instant.now()).toMillis());
        }
    }

    /**
     * Marks a search as failed.
     *
     * @param searchId the search identifier
     * @param error    error description
     */
    public void fail(String searchId, String error) {
        SearchMetadata metadata = searches.get(searchId);
        if (metadata != null) {
            metadata.setStatus("failed");
            metadata.setCompletedAt(Instant.now());
            metadata.setDurationMs(Duration.between(metadata.getStartedAt(), Instant.now()).toMillis());
            metadata.setError(error);
        }
    }

    /**
     * Returns the current search metadata wrapped in an Optional.
     */
    public Optional<SearchMetadata> getStatus(String searchId) {
        return Optional.ofNullable(searches.get(searchId));
    }

    /**
     * Checks if a search exists in the tracker.
     */
    public boolean exists(String searchId) {
        return searches.containsKey(searchId);
    }

    // -------------------------------------------------------------------------
    // SSE emitter management
    // -------------------------------------------------------------------------

    /**
     * Registers an SSE emitter for a search.
     *
     * @param searchId the search identifier
     * @param emitter  the SSE emitter to register
     */
    public void registerEmitter(String searchId, SseEmitter emitter) {
        CopyOnWriteArrayList<SseEmitter> list = emitters.computeIfAbsent(
            searchId, k -> new CopyOnWriteArrayList<>());

        if (list.size() >= MAX_CONNECTIONS_PER_SEARCH) {
            log.warn("Max SSE connections reached for search [{}]", searchId);
            return;
        }

        list.add(emitter);

        // Schedule keepalive every 15 seconds
        ScheduledFuture<?> task = keepaliveScheduler.scheduleAtFixedRate(() -> {
            try {
                emitter.send(SseEmitter.event().comment("keepalive"));
            } catch (IOException e) {
                log.debug("Keepalive failed for search [{}], removing emitter", searchId);
                unregisterEmitter(searchId, emitter);
            }
        }, KEEPALIVE_INTERVAL_SECONDS, KEEPALIVE_INTERVAL_SECONDS, TimeUnit.SECONDS);

        keepaliveTasks.put(emitter, task);
        log.debug("Registered SSE emitter for search [{}]. Total: {}", searchId, list.size());
    }

    /**
     * Removes an SSE emitter for a search and cancels its keepalive.
     *
     * @param searchId the search identifier
     * @param emitter  the SSE emitter to remove
     */
    public void unregisterEmitter(String searchId, SseEmitter emitter) {
        // Cancel keepalive
        ScheduledFuture<?> task = keepaliveTasks.remove(emitter);
        if (task != null) {
            task.cancel(false);
        }

        CopyOnWriteArrayList<SseEmitter> list = emitters.get(searchId);
        if (list != null) {
            list.remove(emitter);
            if (list.isEmpty()) {
                emitters.remove(searchId, list);
            }
        }
    }

    /**
     * Broadcasts an SSE event to all emitters for a search.
     *
     * @param searchId  the search identifier
     * @param eventType SSE event name
     * @param data      JSON payload
     * @param eventId   event ID for Last-Event-ID support
     */
    public void broadcast(String searchId, String eventType, Object data, String eventId) {
        // Record event for replay
        CopyOnWriteArrayList<SseEventRecord> history = eventHistory.computeIfAbsent(
            searchId, k -> new CopyOnWriteArrayList<>());
        history.add(new SseEventRecord(eventId, eventType, data));

        // Send to all emitters
        CopyOnWriteArrayList<SseEmitter> list = emitters.get(searchId);
        if (list == null || list.isEmpty()) {
            return;
        }

        for (SseEmitter emitter : list) {
            try {
                emitter.send(SseEmitter.event()
                    .name(eventType)
                    .id(eventId)
                    .data(data));
            } catch (IOException e) {
                log.debug("Failed to send SSE event to emitter for search [{}]", searchId);
                unregisterEmitter(searchId, emitter);
            }
        }
    }

    /**
     * Completes all emitters for a search (closes SSE connections).
     */
    public void completeEmitters(String searchId) {
        CopyOnWriteArrayList<SseEmitter> list = emitters.remove(searchId);
        if (list != null) {
            for (SseEmitter emitter : list) {
                ScheduledFuture<?> task = keepaliveTasks.remove(emitter);
                if (task != null) task.cancel(false);
                try {
                    emitter.complete();
                } catch (Exception e) {
                    // Already closed
                }
            }
        }
    }

    /**
     * Returns missed events after the given lastEventId for replay on reconnection.
     */
    public List<SseEventRecord> getMissedEvents(String searchId, String lastEventId) {
        CopyOnWriteArrayList<SseEventRecord> history = eventHistory.get(searchId);
        if (history == null || lastEventId == null) {
            return Collections.emptyList();
        }

        List<SseEventRecord> missed = new ArrayList<>();
        boolean found = false;
        for (SseEventRecord record : history) {
            if (found) {
                missed.add(record);
            } else if (lastEventId.equals(record.getEventId())) {
                found = true;
            }
        }
        return missed;
    }

    // -------------------------------------------------------------------------
    // Scheduled cleanup
    // -------------------------------------------------------------------------

    /**
     * Auto-cleanup: removes entries older than 1 hour. Runs every 5 minutes.
     */
    @Scheduled(fixedDelay = 300000) // 5 minutes
    public void cleanup() {
        long now = System.currentTimeMillis();
        Iterator<Map.Entry<String, SearchMetadata>> it = searches.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<String, SearchMetadata> entry = it.next();
            SearchMetadata meta = entry.getValue();
            long age = now - meta.getStartedAt().toEpochMilli();
            if (age > MAX_AGE_MS && !"running".equals(meta.getStatus())) {
                it.remove();
                eventHistory.remove(entry.getKey());
                log.debug("Cleaned up search [{}] (age={}ms)", entry.getKey(), age);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Inner types
    // -------------------------------------------------------------------------

    /** Metadata for a tracked search. */
    public static class SearchMetadata {
        private final String searchId;
        private final String taskId;
        private final String query;
        private final long tenantId;
        private final String owner;
        private final String tenantKey;
        private final Instant startedAt;
        private volatile String status;
        private volatile Instant completedAt;
        private volatile long durationMs;
        private volatile int shardsTotal;
        private volatile int shardsSearched;
        private volatile long totalHits;
        private volatile String error;
        private volatile String indexPattern;

        public SearchMetadata(String searchId, String taskId, String query, long tenantId) {
            this(searchId, taskId, query, tenantId, "unknown", "authorized");
        }

        public SearchMetadata(String searchId, String taskId, String query, long tenantId,
                              String owner, String tenantKey) {
            this.searchId = searchId;
            this.taskId = taskId;
            this.query = query;
            this.tenantId = tenantId;
            this.owner = owner;
            this.tenantKey = tenantKey;
            this.startedAt = Instant.now();
            this.status = "running";
        }

        public String getSearchId() { return searchId; }
        public String getTaskId() { return taskId; }
        public String getQuery() { return query; }
        public long getTenantId() { return tenantId; }
        public String getOwner() { return owner; }
        public String getTenantKey() { return tenantKey; }
        public Instant getStartedAt() { return startedAt; }
        public String getStatus() { return status; }
        public Instant getCompletedAt() { return completedAt; }
        public long getDurationMs() { return durationMs; }
        public int getShardsTotal() { return shardsTotal; }
        public int getShardsSearched() { return shardsSearched; }
        public long getTotalHits() { return totalHits; }
        public String getError() { return error; }
        public String getIndexPattern() { return indexPattern; }

        public void setStatus(String status) { this.status = status; }
        public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }
        public void setDurationMs(long durationMs) { this.durationMs = durationMs; }
        public void setShardsTotal(int shardsTotal) { this.shardsTotal = shardsTotal; }
        public void setShardsSearched(int shardsSearched) { this.shardsSearched = shardsSearched; }
        public void setTotalHits(long totalHits) { this.totalHits = totalHits; }
        public void setError(String error) { this.error = error; }
        public void setIndexPattern(String indexPattern) { this.indexPattern = indexPattern; }
    }

    /** Recorded SSE event for replay. */
    public static class SseEventRecord {
        private final String eventId;
        private final String eventType;
        private final Object data;

        public SseEventRecord(String eventId, String eventType, Object data) {
            this.eventId = eventId;
            this.eventType = eventType;
            this.data = data;
        }

        public String getEventId() { return eventId; }
        public String getEventType() { return eventType; }
        public Object getData() { return data; }
    }
}
