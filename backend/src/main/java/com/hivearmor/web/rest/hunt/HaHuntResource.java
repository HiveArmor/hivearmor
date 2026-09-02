package com.hivearmor.web.rest.hunt;

import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.security.SecurityUtils;
import com.hivearmor.service.hunt.HaHuntService;
import com.hivearmor.service.hunt.HuntEventDetailService;
import com.hivearmor.service.hunt.HuntHistoryService;
import com.hivearmor.service.hunt.HuntQueryException;
import com.hivearmor.service.hunt.QueryCapabilityRegistry;
import com.hivearmor.service.hunt.SearchProgressTracker;
import com.hivearmor.service.hunt.SearchProgressTracker.SearchMetadata;
import com.hivearmor.service.hunt.SearchProgressTracker.SseEventRecord;
import com.hivearmor.web.rest.hunt.dto.HuntSearchRequestDTO;
import com.hivearmor.web.rest.hunt.dto.HuntSearchResponseDTO;
import com.hivearmor.web.rest.hunt.dto.HuntFieldDefinitionDTO;
import com.hivearmor.service.export.ExportFormat;
import com.hivearmor.service.export.ForensicExportService;
import com.hivearmor.web.rest.export.dto.ExportManifestDTO;
import com.hivearmor.web.rest.export.dto.HuntExportRequestDTO;
import com.hivearmor.domain.export.HaExportManifest;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * REST controller for the Search &amp; Hunt feature.
 *
 * <p>Provides bounded, cursor-paginated event search across raw log indices
 * ({@code v3-hive-log-*}), event indices ({@code v3-hive-event-*}), and
 * optionally alert indices. Results are projection-bounded and tenant-scoped.
 *
 * <p>Sprint 42 additions:
 * <ul>
 *   <li>HNT-002: Search cancellation + status diagnostics</li>
 *   <li>HNT-004: Event detail with pivots</li>
 *   <li>HNT-005: History recording hook into search execution</li>
 *   <li>HNT-008: SSE search progress streaming</li>
 *   <li>HNT-009: Query capabilities discovery</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/ha-hunts")
public class HaHuntResource {

    private static final Logger log = LoggerFactory.getLogger(HaHuntResource.class);
    private static final String CLASSNAME = "HaHuntResource";

    private static final String HUNT_AUTH =
        "hasAuthority('ROLE_ANALYST') or hasAuthority('ROLE_ADMIN') or hasAuthority('ROLE_USER')";

    private static final String ALERT_QUEUE_AUTH =
        "hasAuthority('ROLE_SOC_ANALYST') or hasAuthority('ROLE_SOC_MANAGER') "
        + "or hasAuthority('ROLE_ANALYST') or hasAuthority('ROLE_ADMIN')";

    /** SSE timeout for search progress: 5 minutes. */
    private static final long SSE_TIMEOUT_MS = 5 * 60 * 1000L;

    /** Progress polling interval: 2 seconds. */
    private static final long PROGRESS_POLL_INTERVAL_MS = 2000L;

    private final HaHuntService huntService;
    private final SearchProgressTracker searchProgressTracker;
    private final QueryCapabilityRegistry queryCapabilityRegistry;
    private final HuntHistoryService huntHistoryService;
    private final HuntEventDetailService huntEventDetailService;
    private final ForensicExportService forensicExportService;

    /** Scheduler for SSE progress polling loops. */
    private final ScheduledExecutorService progressPoller =
        Executors.newScheduledThreadPool(2, r -> {
            Thread t = new Thread(r, "search-progress-poller");
            t.setDaemon(true);
            return t;
        });

    public HaHuntResource(HaHuntService huntService,
                          SearchProgressTracker searchProgressTracker,
                          QueryCapabilityRegistry queryCapabilityRegistry,
                          HuntHistoryService huntHistoryService,
                          HuntEventDetailService huntEventDetailService,
                          ForensicExportService forensicExportService) {
        this.huntService = huntService;
        this.searchProgressTracker = searchProgressTracker;
        this.queryCapabilityRegistry = queryCapabilityRegistry;
        this.huntHistoryService = huntHistoryService;
        this.huntEventDetailService = huntEventDetailService;
        this.forensicExportService = forensicExportService;
    }

    // -------------------------------------------------------------------------
    // B0-4 — Forensic export (CSV / NDJSON) + chain-of-custody manifest
    // POST /api/ha-hunts/search/export
    // GET  /api/ha-hunts/search/export/{exportId}/manifest
    // -------------------------------------------------------------------------

    /**
     * Streams the full hunt-search result set as CSV or NDJSON, computing a SHA-256 of the exact
     * bytes delivered (chain of custody). The response carries {@code X-Export-Id}; the finalized
     * SHA-256 is read from the manifest endpoint once the download completes.
     */
    @PostMapping("/search/export")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    public void exportSearch(@RequestBody HuntExportRequestDTO request,
                             HttpServletResponse response) {
        final String ctx = CLASSNAME + ".exportSearch";
        try {
            ExportFormat format = ExportFormat.parse(request.getFormat());
            String indexPattern = forensicExportService.resolveIndexPattern(
                request.getIndexPattern(), ForensicExportService.SURFACE_HUNT);

            // Tenant-scope guard BEFORE streaming.
            forensicExportService.validateScope(indexPattern);

            String from = request.getTimeRange() != null ? request.getTimeRange().getFrom() : null;
            String to = request.getTimeRange() != null ? request.getTimeRange().getTo() : null;

            var filters = ForensicExportService.buildHuntFilters(request.getFilters(), from, to);

            Map<String, Object> queryContext = new LinkedHashMap<>();
            queryContext.put("kql", request.getQuery());
            queryContext.put("filters", request.getFilters());
            Map<String, Object> tr = new LinkedHashMap<>();
            tr.put("from", from);
            tr.put("to", to);
            queryContext.put("timeRange", tr);

            var exportRequest = new ForensicExportService.ExportRequest(
                ForensicExportService.SURFACE_HUNT, format, indexPattern,
                filters, request.getColumns(), queryContext);

            forensicExportService.streamExport(exportRequest, response);
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage(), e);
            throw new IllegalStateException("Hunt export failed", e);
        } finally {
            TenantContext.clear();
        }
    }

    @GetMapping("/search/export/{exportId}/manifest")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    public ResponseEntity<ExportManifestDTO> getExportManifest(@PathVariable String exportId) {
        try {
            HaExportManifest manifest = forensicExportService.findManifest(exportId);
            if (manifest == null) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.ok(ExportManifestDTO.from(manifest));
        } finally {
            TenantContext.clear();
        }
    }

    // -------------------------------------------------------------------------
    // POST /api/ha-hunts/search — HNT-001 + HNT-005 (history recording)
    // -------------------------------------------------------------------------
    /**
     * Executes a bounded, cursor-paginated hunt query against raw log and event indices.
     * After successful execution, auto-records the query in the user's history (HNT-005).
     */
    @PostMapping("/search")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    public ResponseEntity<HuntSearchResponseDTO> executeSearch(
            @Valid @RequestBody HuntSearchRequestDTO request) {

        final String ctx = CLASSNAME + ".executeSearch";
        log.debug("{}: query='{}', timeRange=[{} -> {}], limit={}",
            ctx, request.getQuery(), request.getTimeRange().getFrom(),
            request.getTimeRange().getTo(), request.getLimit());

        String owner = currentOwner();
        String tenantKey = currentTenantKey();
        boolean firstPage = request.getCursor() == null || request.getCursor().isBlank();
        String searchId = firstPage
            ? "HUNT-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase()
            : "CONTINUATION";
        if (!"CONTINUATION".equals(searchId)) {
            searchProgressTracker.track(searchId, null, request.getQuery(), currentTenantId(), owner, tenantKey);
        }

        try {
            long startTime = System.currentTimeMillis();
            HuntSearchResponseDTO response = huntService.executeSearch(request, searchId, owner, tenantKey);
            searchId = response.getSearchId();

            long durationMs = System.currentTimeMillis() - startTime;
            if (searchProgressTracker.exists(searchId)) {
                searchProgressTracker.complete(searchId, durationMs, response.getTotalApproximate());
            }

            // HNT-005: Record in query history (fire-and-forget, non-blocking)
            if (firstPage) {
                try {
                    huntHistoryService.record(
                        request.getQuery(),
                        null,
                        durationMs,
                        (int) Math.min(Integer.MAX_VALUE, response.getTotalApproximate()),
                        "completed",
                        owner,
                        currentTenantId(),
                        null
                    );
                } catch (Exception historyEx) {
                    log.warn("{}: failed to record search history: {}", ctx, historyEx.getMessage());
                }
            }

            return ResponseEntity.ok(response);
        } catch (HuntQueryException e) {
            if (!"CONTINUATION".equals(searchId)) searchProgressTracker.fail(searchId, e.getMessage());
            throw e;
        } catch (Exception e) {
            if (!"CONTINUATION".equals(searchId)) searchProgressTracker.fail(searchId, "Search execution failed");
            log.error("{}: search execution failed", ctx, e);
            throw new IllegalStateException("Search execution failed", e);
        } finally {
            TenantContext.clear();
        }
    }

    // -------------------------------------------------------------------------
    // DELETE /api/ha-hunts/search/{searchId} — HNT-002
    // -------------------------------------------------------------------------

    @DeleteMapping("/search/{searchId}")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    public ResponseEntity<Void> cancelSearch(@PathVariable String searchId) {
        final String ctx = CLASSNAME + ".cancelSearch";
        log.debug("{}: searchId={}", ctx, searchId);

        try {
            Optional<SearchMetadata> optMetadata = searchProgressTracker.getStatus(searchId);
            if (optMetadata.isEmpty()) {
                throw new HuntQueryException("HUNT_SEARCH_NOT_FOUND", "Search was not found", 0);
            }

            SearchMetadata metadata = optMetadata.get();
            requireOwner(metadata);
            huntService.closeSearch(searchId);
            searchProgressTracker.cancel(searchId);
            return ResponseEntity.noContent().build();
        } catch (HuntQueryException e) {
            throw e;
        } catch (Exception e) {
            log.error("{}: cancellation failed", ctx, e);
            throw new IllegalStateException("Search cancellation failed", e);
        } finally {
            TenantContext.clear();
        }
    }

    // -------------------------------------------------------------------------
    // GET /api/ha-hunts/search/{searchId}/status — HNT-002
    // -------------------------------------------------------------------------

    @GetMapping("/search/{searchId}/status")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    public ResponseEntity<Map<String, Object>> getSearchStatus(@PathVariable String searchId) {
        final String ctx = CLASSNAME + ".getSearchStatus";
        log.debug("{}: searchId={}", ctx, searchId);

        try {
            Optional<SearchMetadata> optMetadata = searchProgressTracker.getStatus(searchId);
            if (optMetadata.isEmpty()) {
                throw new HuntQueryException("HUNT_SEARCH_NOT_FOUND", "Search was not found", 0);
            }

            SearchMetadata metadata = optMetadata.get();
            requireOwner(metadata);

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("searchId", searchId);
            response.put("status", metadata.getStatus());
            response.put("query", metadata.getQuery());
            response.put("startedAt", metadata.getStartedAt().toString());
            response.put("completedAt", metadata.getCompletedAt() != null
                ? metadata.getCompletedAt().toString() : null);
            response.put("duration", metadata.getDurationMs());
            response.put("totalHits", metadata.getTotalHits());
            response.put("shardsSearched", metadata.getShardsSearched());
            response.put("shardsSucceeded", metadata.getShardsSearched());
            response.put("shardsFailed", 0);
            response.put("timeoutReached", false);

            Map<String, Object> queryPlan = new LinkedHashMap<>();
            queryPlan.put("indicesSearched", List.of("v3-hive-log-*", "v3-hive-alert-*"));
            queryPlan.put("filtersApplied", List.of("tenant_scope", "time_range", "typed_kql"));
            queryPlan.put("sortUsed", "@timestamp DESC, _shard_doc ASC");
            queryPlan.put("pagination", "pit_or_index_search_after");
            queryPlan.put("estimatedCost", "low");
            response.put("queryPlan", queryPlan);
            response.put("errors", Collections.emptyList());

            return ResponseEntity.ok(response);
        } catch (HuntQueryException e) {
            throw e;
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // -------------------------------------------------------------------------
    // GET /api/ha-hunts/search/{searchId}/stream — HNT-008 (SSE)
    // -------------------------------------------------------------------------

    @GetMapping(value = "/search/{searchId}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize(ALERT_QUEUE_AUTH)
    public SseEmitter streamSearchProgress(@PathVariable String searchId,
                                           HttpServletRequest request) {
        final String ctx = CLASSNAME + ".streamSearchProgress";
        log.debug("{}: searchId={}", ctx, searchId);

        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);

        Optional<SearchMetadata> optMetadata = searchProgressTracker.getStatus(searchId);
        if (optMetadata.isEmpty()) {
            try {
                emitter.send(SseEmitter.event()
                    .name("search.failed")
                    .data(Map.of("searchId", searchId, "error", "Search not found")));
                emitter.complete();
            } catch (IOException e) {
                emitter.completeWithError(e);
            }
            TenantContext.clear();
            return emitter;
        }

        SearchMetadata metadata = optMetadata.get();
        requireOwner(metadata);

        // If already completed, send final event immediately
        if ("completed".equals(metadata.getStatus())) {
            try {
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("searchId", searchId);
                data.put("totalHits", metadata.getTotalHits());
                data.put("duration", metadata.getDurationMs());
                data.put("status", "completed");
                emitter.send(SseEmitter.event().name("search.completed").id("completed-1").data(data));
                emitter.complete();
            } catch (IOException e) {
                emitter.completeWithError(e);
            }
            TenantContext.clear();
            return emitter;
        }

        if ("failed".equals(metadata.getStatus())) {
            try {
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("searchId", searchId);
                data.put("error", metadata.getError() != null ? metadata.getError() : "Unknown error");
                data.put("failedShards", 0);
                emitter.send(SseEmitter.event().name("search.failed").id("failed-1").data(data));
                emitter.complete();
            } catch (IOException e) {
                emitter.completeWithError(e);
            }
            TenantContext.clear();
            return emitter;
        }

        if ("cancelled".equals(metadata.getStatus())) {
            try {
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("searchId", searchId);
                data.put("partialHits", metadata.getTotalHits());
                data.put("cancelledBy", "user");
                emitter.send(SseEmitter.event().name("search.cancelled").id("cancelled-1").data(data));
                emitter.complete();
            } catch (IOException e) {
                emitter.completeWithError(e);
            }
            TenantContext.clear();
            return emitter;
        }

        // Search still running: register emitter for progress broadcasts
        searchProgressTracker.registerEmitter(searchId, emitter);

        // Support Last-Event-ID: replay missed events on reconnect
        String lastEventId = request.getHeader("Last-Event-ID");
        if (lastEventId != null && !lastEventId.isBlank()) {
            List<SseEventRecord> missed = searchProgressTracker.getMissedEvents(searchId, lastEventId);
            for (SseEventRecord record : missed) {
                try {
                    emitter.send(SseEmitter.event()
                        .name(record.getEventType())
                        .id(record.getEventId())
                        .data(record.getData()));
                } catch (IOException e) {
                    break;
                }
            }
        }

        // Progress polling loop: every 2 seconds
        final AtomicInteger eventCounter = new AtomicInteger(0);

        ScheduledFuture<?> pollTask = progressPoller.scheduleAtFixedRate(() -> {
            try {
                Optional<SearchMetadata> current = searchProgressTracker.getStatus(searchId);
                if (current.isEmpty()) {
                    emitter.complete();
                    return;
                }
                SearchMetadata meta = current.get();
                int eventNum = eventCounter.incrementAndGet();
                String evtId = "evt-" + eventNum;

                if ("completed".equals(meta.getStatus())) {
                    Map<String, Object> data = new LinkedHashMap<>();
                    data.put("searchId", searchId);
                    data.put("totalHits", meta.getTotalHits());
                    data.put("duration", meta.getDurationMs());
                    data.put("status", "completed");
                    searchProgressTracker.broadcast(searchId, "search.completed", data, evtId);
                    emitter.complete();
                } else if ("failed".equals(meta.getStatus()) || "cancelled".equals(meta.getStatus())) {
                    Map<String, Object> data = new LinkedHashMap<>();
                    data.put("searchId", searchId);
                    data.put("status", meta.getStatus());
                    data.put("partialHits", meta.getTotalHits());
                    searchProgressTracker.broadcast(searchId, "search." + meta.getStatus(), data, evtId);
                    emitter.complete();
                } else {
                    // Still running — send progress
                    Map<String, Object> data = new LinkedHashMap<>();
                    data.put("searchId", searchId);
                    data.put("status", "running");
                    data.put("shardsCompleted", meta.getShardsSearched());
                    data.put("shardsTotal", meta.getShardsTotal());
                    data.put("hitsFound", meta.getTotalHits());
                    data.put("elapsed", Duration.between(meta.getStartedAt(), Instant.now()).toMillis());
                    searchProgressTracker.broadcast(searchId, "search.progress", data, evtId);
                }
            } catch (Exception e) {
                log.debug("{}: SSE poll error for searchId={}: {}", ctx, searchId, e.getMessage());
            }
        }, PROGRESS_POLL_INTERVAL_MS, PROGRESS_POLL_INTERVAL_MS, TimeUnit.MILLISECONDS);

        // Keepalive every 15 seconds
        ScheduledFuture<?> keepaliveTask = progressPoller.scheduleAtFixedRate(() -> {
            try {
                emitter.send(SseEmitter.event().comment("keepalive"));
            } catch (IOException e) {
                // Connection closed
            }
        }, 15, 15, TimeUnit.SECONDS);

        // Cleanup on completion/timeout/error
        Runnable cleanup = () -> {
            pollTask.cancel(false);
            keepaliveTask.cancel(false);
            searchProgressTracker.unregisterEmitter(searchId, emitter);
        };
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(t -> cleanup.run());

        TenantContext.clear();
        return emitter;
    }

    // -------------------------------------------------------------------------
    // GET /api/ha-hunts/events/{eventId} — HNT-004 + HNT-006
    // -------------------------------------------------------------------------

    @GetMapping("/events/{eventId}")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    public ResponseEntity<Object> getEventDetail(
            @PathVariable String eventId,
            @RequestParam(required = false, defaultValue = "highlighted") String view,
            @RequestParam(required = false) String views,
            @RequestParam String searchId) {

        final String ctx = CLASSNAME + ".getEventDetail";
        log.debug("{}: eventId={}, view={}, searchId={}", ctx, eventId, view, searchId);

        try {
            var session = huntService.requireSession(searchId, currentOwner(), currentTenantKey());
            boolean includeRaw = "raw".equalsIgnoreCase(view)
                || (views != null && Arrays.stream(views.split(",")).anyMatch("raw"::equalsIgnoreCase));
            Map<String, Object> response = huntEventDetailService.getEventDetail(
                eventId, includeRaw, session);
            if (response == null) {
                throw new HuntQueryException("HUNT_EVENT_NOT_FOUND", "Event was not found in the search snapshot", 0);
            }
            return ResponseEntity.ok(response);
        } catch (HuntQueryException e) {
            throw e;
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // -------------------------------------------------------------------------
    // GET /api/ha-hunts/query-capabilities — HNT-009
    // -------------------------------------------------------------------------

    @GetMapping("/query-capabilities")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    public ResponseEntity<Map<String, Object>> getQueryCapabilities() {
        final String ctx = CLASSNAME + ".getQueryCapabilities";
        try {
            Map<String, Object> capabilities = queryCapabilityRegistry.getCapabilities();
            return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "max-age=3600")
                .body(capabilities);
        } catch (HuntQueryException e) {
            throw e;
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // -------------------------------------------------------------------------
    // GET /api/ha-hunts/schema — HNT-003
    // -------------------------------------------------------------------------

    @GetMapping("/schema")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    public ResponseEntity<List<HuntFieldDefinitionDTO>> getSchema() {
        final String ctx = CLASSNAME + ".getSchema";
        try {
            List<HuntFieldDefinitionDTO> fields = huntService.getSchemaFields();
            return ResponseEntity.ok(fields);
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // -------------------------------------------------------------------------
    // GET /api/ha-hunts/search/{searchId}/fields/{field}/values — HNT-003b
    // -------------------------------------------------------------------------

    @GetMapping("/search/{searchId}/fields/{field}/values")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    public ResponseEntity<Object> getFieldValues(
            @PathVariable String searchId,
            @PathVariable String field,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false, defaultValue = "10") int limit,
            @RequestParam(required = false) String q) {

        final String ctx = CLASSNAME + ".getFieldValues";
        log.debug("{}: searchId={}, field={}, limit={}", ctx, searchId, field, limit);

        try {
            Object response = huntService.getFieldValues(
                searchId, field, cursor, q, limit, currentOwner(), currentTenantKey());
            return ResponseEntity.ok(response);
        } catch (HuntQueryException e) {
            throw e;
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    private String currentOwner() {
        return SecurityUtils.getCurrentUserLogin()
            .orElseThrow(() -> new HuntQueryException("HUNT_PRINCIPAL_REQUIRED", "Authenticated principal is required", 0));
    }

    private String currentTenantKey() {
        String prefix = TenantContext.getClientPrefix();
        return prefix == null || prefix.isBlank() ? "authorized" : prefix;
    }

    private long currentTenantId() {
        return TenantContext.getClientId() == null ? 0L : TenantContext.getClientId();
    }

    private void requireOwner(SearchMetadata metadata) {
        if (!currentOwner().equals(metadata.getOwner()) || !currentTenantKey().equals(metadata.getTenantKey())) {
            throw new HuntQueryException("HUNT_SEARCH_FORBIDDEN", "Search does not belong to the current security scope", 0);
        }
    }
}
