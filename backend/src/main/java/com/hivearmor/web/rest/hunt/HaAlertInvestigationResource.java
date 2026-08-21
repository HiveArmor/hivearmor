package com.hivearmor.web.rest.hunt;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.hunt.AlertCorrelationService;
import com.hivearmor.service.hunt.AlertEventFieldClassifier;
import com.hivearmor.service.hunt.EntityGraphBuilder;
import com.hivearmor.service.hunt.IndicatorExtractor;
import com.hivearmor.service.hunt.InvestigationEventPublisher;
import com.hivearmor.service.hunt.InvestigationStepRegistry;
import com.hivearmor.service.hunt.MitreTacticOrderMap;
import com.hivearmor.service.hunt.NetworkActivityBuilder;
import com.hivearmor.service.hunt.ProcessTreeBuilder;
import com.hivearmor.service.hunt.SseConnectionManager;
import com.hivearmor.service.sse.HaSseRateLimiter;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.query_dsl.*;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * REST controller for alert investigation sub-resource endpoints.
 *
 * <p>Provides:
 * <ul>
 *   <li>ALT-002: Attack Story — GET /ha-alerts/{alertId}/story</li>
 *   <li>ALT-006: Entity Relationship Graph — GET /ha-alerts/{alertId}/relationships</li>
 *   <li>ALT-008: Activity Feed — GET /ha-alerts/{alertId}/activity</li>
 *   <li>ALT-009: Detection Guide — GET /ha-alerts/{alertId}/guide</li>
 *   <li>ALT-011: Event Detail — GET /ha-alerts/{alertId}/events/{eventId}</li>
 *   <li>ALT-012: Live Investigation SSE Stream — GET /ha-alerts/{alertId}/stream</li>
 * </ul>
 */
@RestController
@RequestMapping("/api")
public class HaAlertInvestigationResource {

    private static final Logger log = LoggerFactory.getLogger(HaAlertInvestigationResource.class);
    private static final String CLASSNAME = "HaAlertInvestigationResource";

    private static final String ALERT_QUEUE_AUTH =
        "hasAuthority('ROLE_SOC_ANALYST') or hasAuthority('ROLE_SOC_MANAGER') "
        + "or hasAuthority('ROLE_ANALYST') or hasAuthority('ROLE_ADMIN')";

    private final OpensearchClientBuilder osClient;
    private final MsspIndexResolver indexResolver;
    private final ObjectMapper objectMapper;
    private final InvestigationStepRegistry stepRegistry;
    private final AlertEventFieldClassifier fieldClassifier;
    private final ProcessTreeBuilder processTreeBuilder;
    private final NetworkActivityBuilder networkActivityBuilder;
    private final IndicatorExtractor indicatorExtractor;
    private final AlertCorrelationService alertCorrelationService;
    private final EntityGraphBuilder entityGraphBuilder;
    private final SseConnectionManager sseConnectionManager;
    private final InvestigationEventPublisher investigationEventPublisher;
    private final HaSseRateLimiter rateLimiter;

    public HaAlertInvestigationResource(OpensearchClientBuilder osClient,
                                        MsspIndexResolver indexResolver,
                                        ObjectMapper objectMapper,
                                        InvestigationStepRegistry stepRegistry,
                                        AlertEventFieldClassifier fieldClassifier,
                                        ProcessTreeBuilder processTreeBuilder,
                                        NetworkActivityBuilder networkActivityBuilder,
                                        IndicatorExtractor indicatorExtractor,
                                        AlertCorrelationService alertCorrelationService,
                                        EntityGraphBuilder entityGraphBuilder,
                                        SseConnectionManager sseConnectionManager,
                                        InvestigationEventPublisher investigationEventPublisher,
                                        HaSseRateLimiter rateLimiter) {
        this.osClient = osClient;
        this.indexResolver = indexResolver;
        this.objectMapper = objectMapper;
        this.stepRegistry = stepRegistry;
        this.fieldClassifier = fieldClassifier;
        this.processTreeBuilder = processTreeBuilder;
        this.networkActivityBuilder = networkActivityBuilder;
        this.indicatorExtractor = indicatorExtractor;
        this.alertCorrelationService = alertCorrelationService;
        this.entityGraphBuilder = entityGraphBuilder;
        this.sseConnectionManager = sseConnectionManager;
        this.investigationEventPublisher = investigationEventPublisher;
        this.rateLimiter = rateLimiter;
    }

    // =========================================================================
    // ALT-002: Attack Story
    // =========================================================================

    /**
     * Returns the attack story for an alert — stages grouped by MITRE tactic
     * and individual event items sorted chronologically.
     */
    @GetMapping("/ha-alerts/{alertId}/story")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @SuppressWarnings({"unchecked", "rawtypes"})
    public ResponseEntity<?> getAttackStory(@PathVariable String alertId) {
        try {
            // 1. Fetch alert to get correlationId
            Map<String, Object> alertSource = fetchAlertById(alertId);
            if (alertSource == null) {
                return ResponseEntity.notFound().build();
            }

            // 2. Query v3-hive-log-* for events linked to this alert
            String logIndex = indexResolver.resolveIndexPattern("log");

            SearchRequest eventRequest = SearchRequest.of(r -> r
                .index(logIndex)
                .query(buildAssociatedEventQuery(alertId, alertSource))
                .sort(s -> s.field(f -> f.field("@timestamp").order(SortOrder.Asc)))
                .size(200));

            SearchResponse<Map> eventResponse = osClient.execute(os -> os.search(eventRequest, Map.class));

            List<Hit<Map>> hits = eventResponse.hits() != null
                ? eventResponse.hits().hits() : Collections.emptyList();

            // 3. If no events, return empty arrays
            if (hits.isEmpty()) {
                return ResponseEntity.ok(Map.of("stages", Collections.emptyList(),
                    "items", Collections.emptyList()));
            }

            // 4. Group events by mitre.tactic.id and build stages
            Map<String, List<Hit<Map>>> byTactic = new LinkedHashMap<>();
            for (Hit<Map> hit : hits) {
                Map<String, Object> src = hit.source() != null
                    ? (Map<String, Object>) hit.source() : Collections.emptyMap();
                String tacticId = firstNonBlank(
                    extractNested(src, "mitre.tactic.id"),
                    stringValue(alertSource.get("mitreTacticId")));
                if (tacticId == null || tacticId.isBlank()) {
                    tacticId = "unknown";
                }
                byTactic.computeIfAbsent(tacticId, k -> new ArrayList<>()).add(hit);
            }

            // 5. Build stage objects and sort by kill-chain order
            List<Map<String, Object>> stages = new ArrayList<>();
            for (Map.Entry<String, List<Hit<Map>>> entry : byTactic.entrySet()) {
                String tacticId = entry.getKey();
                List<Hit<Map>> tacticHits = entry.getValue();
                Map<String, Object> firstSrc = tacticHits.get(0).source() != null
                    ? (Map<String, Object>) tacticHits.get(0).source() : Collections.emptyMap();

                Map<String, Object> stage = new LinkedHashMap<>();
                stage.put("id", "stage-" + tacticId.toLowerCase());
                stage.put("order", MitreTacticOrderMap.getOrder(tacticId));
                stage.put("tacticId", tacticId);
                String tacticName = firstNonBlank(
                    extractNested(firstSrc, "mitre.tactic.name"),
                    stringValue(alertSource.get("mitreTacticName")), tacticId);
                String techniqueId = firstNonBlank(
                    extractNested(firstSrc, "mitre.technique.id"),
                    stringValue(alertSource.get("mitreTechniqueId")));
                String techniqueName = firstNonBlank(
                    extractNested(firstSrc, "mitre.technique.name"),
                    stringValue(alertSource.get("mitreTechniqueName")));
                stage.put("tacticName", tacticName);
                stage.put("label", tacticName);
                stage.put("techniqueId", techniqueId);
                stage.put("techniqueName", techniqueName);
                stage.put("technique", firstNonBlank(
                    String.join(" ", Arrays.asList(techniqueId, techniqueName).stream()
                        .filter(Objects::nonNull).filter(value -> !value.isBlank())
                        .collect(Collectors.toList())), "Technique not mapped"));
                stage.put("state", "observed");
                stage.put("eventCount", tacticHits.size());
                stages.add(stage);
            }

            stages.sort(Comparator.comparingInt(s -> (int) ((Map<String, Object>) s).get("order")));

            // 6. Map events to story items
            List<Map<String, Object>> items = new ArrayList<>();
            for (Hit<Map> hit : hits) {
                Map<String, Object> src = hit.source() != null
                    ? (Map<String, Object>) hit.source() : Collections.emptyMap();
                items.add(buildStoryItem(hit.id(), src,
                    stringValue(alertSource.get("mitreTacticId"))));
            }

            return ResponseEntity.ok(Map.of("stages", stages, "items", items));

        } catch (Exception e) {
            log.error("{}.getAttackStory: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * Builds a single story item from an event hit.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> buildStoryItem(String eventId, Map<String, Object> src,
                                                String fallbackTacticId) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", eventId);
        item.put("timestamp", src.get("@timestamp"));

        // Accept canonical ECS and the normalized engine projection while old
        // indices age out. The producer writes action/origin/log at top level.
        String action = firstNonBlank(extractNested(src, "event.action"), stringValue(src.get("action")));
        String hostName = firstNonBlank(extractNested(src, "host.name"), extractNested(src, "origin.host"));
        String title = action != null ? action : "Unknown action";
        if (hostName != null) {
            title = title + " on " + hostName;
        }
        item.put("title", title);

        // Derive summary from process.name, user.name, source.ip → destination.ip
        item.put("summary", buildSummary(src));

        // Derive category from event.category
        item.put("category", deriveCategory(src));

        // Severity from alert severity or default to medium
        Object severity = src.get("severity");
        if (severity != null) {
            item.put("severity", severity);
        } else {
            item.put("severity", "medium");
        }

        item.put("processId", firstNonBlank(extractNested(src, "process.pid"), extractNested(src, "log.pid")));
        item.put("source", firstNonBlank(stringValue(src.get("dataSource")), "endpoint-logs"));

        // Map to stage
        String tacticId = firstNonBlank(extractNested(src, "mitre.tactic.id"), fallbackTacticId);
        item.put("stageId", tacticId != null ? "stage-" + tacticId.toLowerCase() : null);

        item.put("evidenceIds", Collections.emptyList());
        return item;
    }

    /**
     * Derives the story item category from ECS event.category field.
     */
    @SuppressWarnings("unchecked")
    private String deriveCategory(Map<String, Object> src) {
        Object catRaw = extractNestedObject(src, "event.category");
        String category = null;
        if (catRaw instanceof List) {
            List<?> catList = (List<?>) catRaw;
            if (!catList.isEmpty()) {
                category = catList.get(0).toString();
            }
        } else if (catRaw != null) {
            category = catRaw.toString();
        }

        if (category == null) return "detection";
        switch (category.toLowerCase()) {
            case "process": return "process";
            case "file": return "file";
            case "network": return "network";
            case "registry": return "registry";
            case "authentication": return "identity";
            default: return "detection";
        }
    }

    /**
     * Builds a human-readable summary from event fields.
     */
    private String buildSummary(Map<String, Object> src) {
        StringBuilder sb = new StringBuilder();
        String processName = firstNonBlank(extractNested(src, "process.name"), extractNested(src, "origin.process"));
        String userName = firstNonBlank(extractNested(src, "user.name"), extractNested(src, "origin.user"));
        String sourceIp = firstNonBlank(extractNested(src, "source.ip"), extractNested(src, "origin.ip"));
        String destIp = firstNonBlank(extractNested(src, "destination.ip"), extractNested(src, "target.ip"));

        if (processName != null) {
            sb.append(processName);
        }
        if (userName != null) {
            if (sb.length() > 0) sb.append(" executed by ");
            sb.append(userName);
        }
        if (sourceIp != null && destIp != null) {
            if (sb.length() > 0) sb.append(", ");
            sb.append(sourceIp).append(" → ").append(destIp);
        } else if (sourceIp != null) {
            if (sb.length() > 0) sb.append(" from ");
            sb.append(sourceIp);
        }

        return sb.length() > 0 ? sb.toString() : null;
    }

    // =========================================================================
    // ALT-003: Process Lineage Tree
    // =========================================================================

    /**
     * Returns the process lineage tree for an alert — processes linked by parent-child
     * relationships with verdicts and code signature information.
     */
    @GetMapping("/ha-alerts/{alertId}/processes")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @SuppressWarnings({"unchecked", "rawtypes"})
    public ResponseEntity<?> getProcessTree(@PathVariable String alertId) {
        try {
            // 1. Fetch alert to get correlationId and alertTriggerPid
            Map<String, Object> alertSource = fetchAlertById(alertId);
            if (alertSource == null) {
                return ResponseEntity.notFound().build();
            }

            // Extract the alert trigger PID from the alert's process.pid field
            String alertTriggerPid = extractNested(alertSource, "process.pid");

            // 2. Query v3-hive-log-* for process events linked to this alert
            String logIndex = indexResolver.resolveIndexPattern("log");

            // Must filter on event.category: process
            Query categoryFilter = Query.of(q -> q.term(t ->
                t.field("event.category.keyword").value(v -> v.stringValue("process"))));

            SearchRequest eventRequest = SearchRequest.of(r -> r
                .index(logIndex)
                .query(buildAssociatedEventQuery(alertId, alertSource, categoryFilter))
                .sort(s -> s.field(f -> f.field("@timestamp").order(SortOrder.Asc)))
                .size(500));

            SearchResponse<Map> eventResponse = osClient.execute(os -> os.search(eventRequest, Map.class));

            List<Hit<Map>> hits = eventResponse.hits() != null
                ? eventResponse.hits().hits() : Collections.emptyList();

            // 3. Extract event sources
            List<Map<String, Object>> processEvents = new ArrayList<>();
            for (Hit<Map> hit : hits) {
                if (hit.source() != null) {
                    processEvents.add((Map<String, Object>) hit.source());
                }
            }

            // 4. Build tree via ProcessTreeBuilder
            ProcessTreeBuilder.ProcessTreeResult result =
                processTreeBuilder.buildTree(processEvents, alertTriggerPid);

            // 5. Return response
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("tree", result.getTree());
            response.put("alertProcessIds", result.getAlertProcessIds());
            response.put("totalProcesses", result.getTotalProcesses());

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("{}.getProcessTree: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // ALT-004: Network Activity
    // =========================================================================

    /**
     * Returns network activity for an alert — connections, DNS records, TLS metadata,
     * and IP reputation data extracted from network events.
     */
    @GetMapping("/ha-alerts/{alertId}/network")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @SuppressWarnings({"unchecked", "rawtypes"})
    public ResponseEntity<?> getNetworkActivity(@PathVariable String alertId) {
        try {
            // 1. Fetch alert to get correlationId
            Map<String, Object> alertSource = fetchAlertById(alertId);
            if (alertSource == null) {
                return ResponseEntity.notFound().build();
            }

            // 2. Query v3-hive-log-* for network events linked to this alert
            String logIndex = indexResolver.resolveIndexPattern("log");

            // Must filter on event.category: network
            Query categoryFilter = Query.of(q -> q.term(t ->
                t.field("event.category.keyword").value(v -> v.stringValue("network"))));

            SearchRequest eventRequest = SearchRequest.of(r -> r
                .index(logIndex)
                .query(buildAssociatedEventQuery(alertId, alertSource, categoryFilter))
                .sort(s -> s.field(f -> f.field("@timestamp").order(SortOrder.Asc)))
                .size(50));

            SearchResponse<Map> eventResponse = osClient.execute(os -> os.search(eventRequest, Map.class));

            List<Hit<Map>> hits = eventResponse.hits() != null
                ? eventResponse.hits().hits() : Collections.emptyList();

            // 3. Extract event sources
            List<Map<String, Object>> networkEvents = new ArrayList<>();
            for (Hit<Map> hit : hits) {
                if (hit.source() != null) {
                    networkEvents.add((Map<String, Object>) hit.source());
                }
            }

            // 4. Build network activity via NetworkActivityBuilder
            NetworkActivityBuilder.NetworkActivityResult result =
                networkActivityBuilder.build(networkEvents);

            // 5. Return response
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("connections", result.getConnections());
            response.put("dns", result.getDns());
            response.put("tls", result.getTls());
            response.put("reputation", result.getReputation());
            response.put("totalConnections", result.getTotalConnections());

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("{}.getNetworkActivity: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // ALT-005: Indicators / IOCs
    // =========================================================================

    /**
     * Returns extracted and deduplicated Indicators of Compromise (IOCs) for an alert,
     * enriched with threat intelligence data from event fields.
     */
    @GetMapping("/ha-alerts/{alertId}/indicators")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @SuppressWarnings({"unchecked", "rawtypes"})
    public ResponseEntity<?> getIndicators(@PathVariable String alertId) {
        try {
            // 1. Fetch alert to get correlationId
            Map<String, Object> alertSource = fetchAlertById(alertId);
            if (alertSource == null) {
                return ResponseEntity.notFound().build();
            }

            // 2. Query ALL events for this alert (not just network)
            String logIndex = indexResolver.resolveIndexPattern("log");

            SearchRequest eventRequest = SearchRequest.of(r -> r
                .index(logIndex)
                .query(buildAssociatedEventQuery(alertId, alertSource))
                .size(200));

            SearchResponse<Map> eventResponse = osClient.execute(os -> os.search(eventRequest, Map.class));

            List<Hit<Map>> hits = eventResponse.hits() != null
                ? eventResponse.hits().hits() : Collections.emptyList();

            // 3. Extract event sources
            List<Map<String, Object>> events = new ArrayList<>();
            for (Hit<Map> hit : hits) {
                if (hit.source() != null) {
                    events.add((Map<String, Object>) hit.source());
                }
            }

            // 4. Extract IOCs via IndicatorExtractor
            IndicatorExtractor.IndicatorResult result = indicatorExtractor.extract(events);

            // 5. Return response
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("indicators", result.getIndicators());
            response.put("totalCount", result.getTotalCount());
            response.put("enrichmentStatus", result.getEnrichmentStatus());

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("{}.getIndicators: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // ALT-007: Related Alerts
    // =========================================================================

    /**
     * Returns alerts related to the given alert through four correlation methods:
     * shared entity, shared session, process ancestry, and rule correlation.
     */
    @GetMapping("/ha-alerts/{alertId}/related")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @SuppressWarnings({"unchecked", "rawtypes"})
    public ResponseEntity<?> getRelatedAlerts(@PathVariable String alertId) {
        try {
            // 1. Fetch alert document
            Map<String, Object> alertSource = fetchAlertById(alertId);
            if (alertSource == null) {
                return ResponseEntity.notFound().build();
            }

            // Ensure the alert has its own ID available
            if (alertSource.get("id") == null) {
                alertSource.put("id", alertId);
            }

            // 2. Resolve tenant alert index pattern
            String alertIndex = indexResolver.resolveAlertIndexPattern();

            // 3. Find related via AlertCorrelationService
            AlertCorrelationService.RelatedAlertsResult result =
                alertCorrelationService.findRelated(alertSource, alertIndex);

            // 4. Return response
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("relatedAlerts", result.getRelatedAlerts());
            response.put("totalCount", result.getTotalCount());

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("{}.getRelatedAlerts: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // ALT-008: Activity Feed
    // =========================================================================

    /**
     * Returns a paginated activity feed for an alert — merged from status history,
     * notes, and assignment changes, sorted descending by timestamp.
     */
    @GetMapping("/ha-alerts/{alertId}/activity")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> getActivityFeed(
            @PathVariable String alertId,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "50") int limit) {
        try {
            // Validate limit
            if (limit > 100) {
                return ResponseEntity.badRequest().body(Map.of(
                    "error", "INVALID_LIMIT",
                    "message", "Limit must not exceed 100"));
            }

            // Fetch alert
            Map<String, Object> alertSource = fetchAlertById(alertId);
            if (alertSource == null) {
                return ResponseEntity.notFound().build();
            }

            List<Map<String, Object>> allItems = new ArrayList<>();

            // 4.3: Build creation activity item
            String createdAt = alertSource.get("@timestamp") != null
                ? alertSource.get("@timestamp").toString() : null;
            String alertName = alertSource.get("name") != null
                ? alertSource.get("name").toString() : "Unknown alert";
            if (createdAt != null) {
                Map<String, Object> creation = new LinkedHashMap<>();
                creation.put("id", "act-creation");
                creation.put("timestamp", createdAt);
                creation.put("type", "creation");
                creation.put("actor", "system");
                creation.put("action", "Alert created");
                creation.put("detail", "Detection rule triggered: " + alertName);
                creation.put("metadata", null);
                allItems.add(creation);
            }

            // 4.4: Build status_change items from statusHistory[]
            Object historyRaw = alertSource.get("statusHistory");
            if (historyRaw instanceof List) {
                List<Map<String, Object>> history = (List<Map<String, Object>>) historyRaw;
                for (int i = 0; i < history.size(); i++) {
                    Map<String, Object> entry = history.get(i);
                    Map<String, Object> statusItem = new LinkedHashMap<>();
                    statusItem.put("id", "act-status-" + i);
                    statusItem.put("timestamp", entry.get("at"));
                    statusItem.put("type", "status_change");
                    statusItem.put("actor", entry.getOrDefault("actor", "system"));
                    statusItem.put("action", "Status changed");

                    String fromLabel = mapStatusLabel(entry.get("from"));
                    String toLabel = mapStatusLabel(entry.get("to"));
                    statusItem.put("detail", fromLabel + " → " + toLabel);

                    Map<String, Object> meta = new LinkedHashMap<>();
                    meta.put("from", entry.get("from"));
                    meta.put("to", entry.get("to"));
                    statusItem.put("metadata", meta);
                    allItems.add(statusItem);
                }
            }

            // 4.5: Build note items from notes[]
            Object notesRaw = alertSource.get("notes");
            if (notesRaw instanceof List) {
                List<Map<String, Object>> notes = (List<Map<String, Object>>) notesRaw;
                for (Map<String, Object> note : notes) {
                    Map<String, Object> noteItem = new LinkedHashMap<>();
                    String noteId = note.get("id") != null
                        ? note.get("id").toString() : UUID.randomUUID().toString();
                    noteItem.put("id", noteId);
                    noteItem.put("timestamp", note.get("at"));
                    noteItem.put("type", "note");
                    noteItem.put("actor", note.getOrDefault("author", "unknown"));
                    noteItem.put("action", "Added analyst note");
                    noteItem.put("detail", note.get("body"));

                    Map<String, Object> meta = new LinkedHashMap<>();
                    meta.put("visibility", note.getOrDefault("visibility", "soc"));
                    meta.put("noteId", noteId);
                    noteItem.put("metadata", meta);
                    allItems.add(noteItem);
                }
            }

            // 4.6: Build assignment items from statusHistory where assignee changes
            if (historyRaw instanceof List) {
                List<Map<String, Object>> history = (List<Map<String, Object>>) historyRaw;
                for (int i = 0; i < history.size(); i++) {
                    Map<String, Object> entry = history.get(i);
                    Object assignee = entry.get("assigneeId");
                    if (assignee != null && !assignee.toString().isBlank()) {
                        Map<String, Object> assignItem = new LinkedHashMap<>();
                        assignItem.put("id", "act-assign-" + i);
                        assignItem.put("timestamp", entry.get("at"));
                        assignItem.put("type", "assignment");
                        assignItem.put("actor", entry.getOrDefault("actor", "system"));
                        assignItem.put("action", "Alert assigned");
                        assignItem.put("detail", "Assigned to " + assignee);
                        assignItem.put("metadata", null);
                        allItems.add(assignItem);
                    }
                }
            }

            // 4.7: Sort descending by timestamp
            allItems.sort((a, b) -> {
                String tsA = a.get("timestamp") != null ? a.get("timestamp").toString() : "";
                String tsB = b.get("timestamp") != null ? b.get("timestamp").toString() : "";
                return tsB.compareTo(tsA);
            });

            // 4.8: Cursor pagination
            int startIdx = 0;
            if (cursor != null && !cursor.isBlank()) {
                try {
                    String decoded = new String(
                        Base64.getDecoder().decode(cursor), StandardCharsets.UTF_8);
                    Map<String, Object> cursorObj = objectMapper.readValue(decoded, Map.class);
                    String cursorTs = cursorObj.get("t") != null
                        ? cursorObj.get("t").toString() : null;
                    String cursorId = cursorObj.get("id") != null
                        ? cursorObj.get("id").toString() : null;

                    // Skip items until we pass the cursor position
                    for (int i = 0; i < allItems.size(); i++) {
                        Map<String, Object> item = allItems.get(i);
                        String itemTs = item.get("timestamp") != null
                            ? item.get("timestamp").toString() : "";
                        String itemId = item.get("id") != null
                            ? item.get("id").toString() : "";
                        if (itemTs.equals(cursorTs) && itemId.equals(cursorId)) {
                            startIdx = i + 1;
                            break;
                        }
                    }
                } catch (Exception e) {
                    // Invalid cursor — start from beginning
                    log.warn("{}.getActivityFeed: invalid cursor", CLASSNAME);
                }
            }

            // Slice to limit+1 to determine hasMore
            int endIdx = Math.min(startIdx + limit + 1, allItems.size());
            List<Map<String, Object>> sliced = allItems.subList(startIdx, endIdx);

            boolean hasMore = sliced.size() > limit;
            List<Map<String, Object>> pageItems = hasMore
                ? sliced.subList(0, limit) : sliced;

            // 4.9: Encode nextCursor
            String nextCursor = null;
            if (hasMore && !pageItems.isEmpty()) {
                Map<String, Object> lastItem = pageItems.get(pageItems.size() - 1);
                Map<String, Object> cursorPayload = new LinkedHashMap<>();
                cursorPayload.put("t", lastItem.get("timestamp"));
                cursorPayload.put("id", lastItem.get("id"));
                try {
                    String json = objectMapper.writeValueAsString(cursorPayload);
                    nextCursor = Base64.getEncoder().encodeToString(
                        json.getBytes(StandardCharsets.UTF_8));
                } catch (Exception e) {
                    log.warn("{}.getActivityFeed: failed to encode cursor", CLASSNAME);
                }
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("items", pageItems);
            result.put("nextCursor", nextCursor);
            result.put("hasMore", hasMore);
            return ResponseEntity.ok(result);

        } catch (Exception e) {
            log.error("{}.getActivityFeed: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // ALT-009: Detection Guide
    // =========================================================================

    /**
     * Returns detection guide for an alert — alert reason, rule description,
     * investigation steps, and MITRE reference.
     */
    @GetMapping("/ha-alerts/{alertId}/guide")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> getDetectionGuide(@PathVariable String alertId) {
        try {
            Map<String, Object> alertSource = fetchAlertById(alertId);
            if (alertSource == null) {
                return ResponseEntity.notFound().build();
            }

            // 5.8: Extract fields
            String ruleName = alertSource.get("ruleName") != null
                ? alertSource.get("ruleName").toString() : null;
            String ruleDescription = alertSource.get("ruleDescription") != null
                ? alertSource.get("ruleDescription").toString() : null;
            String mitreTacticId = alertSource.get("mitreTacticId") != null
                ? alertSource.get("mitreTacticId").toString() : null;
            String mitreTacticName = alertSource.get("mitreTacticName") != null
                ? alertSource.get("mitreTacticName").toString() : null;
            String mitreTechniqueId = alertSource.get("mitreTechniqueId") != null
                ? alertSource.get("mitreTechniqueId").toString() : null;
            String mitreTechniqueName = alertSource.get("mitreTechniqueName") != null
                ? alertSource.get("mitreTechniqueName").toString() : null;
            String primaryEntityLabel = alertSource.get("primaryEntityLabel") != null
                ? alertSource.get("primaryEntityLabel").toString() : null;
            String description = alertSource.get("description") != null
                ? alertSource.get("description").toString() : null;

            // 5.9: Build alertReason (null-safe)
            StringBuilder reasonBuilder = new StringBuilder();
            if (ruleName != null) {
                reasonBuilder.append(ruleName);
                if (mitreTacticName != null) {
                    reasonBuilder.append(" detected ").append(mitreTacticName).append(" activity");
                    if (primaryEntityLabel != null) {
                        reasonBuilder.append(" on ").append(primaryEntityLabel);
                    }
                }
            }
            if (description != null) {
                if (reasonBuilder.length() > 0) {
                    reasonBuilder.append(". ");
                }
                reasonBuilder.append(description);
            }
            String alertReason = reasonBuilder.length() > 0 ? reasonBuilder.toString() : null;

            // 5.10: Build MITRE object with URL
            Map<String, Object> mitre = null;
            if (mitreTechniqueId != null) {
                mitre = new LinkedHashMap<>();
                mitre.put("tacticId", mitreTacticId);
                mitre.put("tacticName", mitreTacticName);
                mitre.put("techniqueId", mitreTechniqueId);
                mitre.put("techniqueName", mitreTechniqueName);
                mitre.put("url", buildMitreUrl(mitreTechniqueId));
            }

            // 5.11: Get investigation steps
            List<String> steps = stepRegistry.getSteps(mitreTechniqueId);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("alertReason", alertReason);
            result.put("ruleDescription", ruleDescription);
            result.put("steps", steps);
            result.put("mitre", mitre);
            return ResponseEntity.ok(result);

        } catch (Exception e) {
            log.error("{}.getDetectionGuide: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // ALT-011: Event Detail
    // =========================================================================

    /**
     * Returns event detail for a specific event within an alert's context.
     * Supports highlighted (classified fields) and raw (full document) views.
     */
    @GetMapping("/ha-alerts/{alertId}/events/{eventId}")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @SuppressWarnings({"unchecked", "rawtypes"})
    public ResponseEntity<?> getEventDetail(
            @PathVariable String alertId,
            @PathVariable String eventId,
            @RequestParam(defaultValue = "highlighted") String view) {
        try {
            // 6.6: Fetch alert to get correlationId
            Map<String, Object> alertSource = fetchAlertById(alertId);
            if (alertSource == null) {
                return ResponseEntity.notFound().build();
            }

            String correlationId = stringValue(alertSource.get("correlationId"));

            // 6.7: Fetch event by ID from v3-hive-log-*
            String logIndex = indexResolver.resolveIndexPattern("log");

            SearchRequest eventRequest = SearchRequest.of(r -> r
                .index(logIndex)
                .query(Query.of(q -> q.ids(i -> i.values(List.of(eventId)))))
                .size(1));

            SearchResponse<Map> eventResponse = osClient.execute(os -> os.search(eventRequest, Map.class));

            if (eventResponse.hits() == null || eventResponse.hits().hits().isEmpty()) {
                return ResponseEntity.notFound().build();
            }

            Hit<Map> eventHit = eventResponse.hits().hits().get(0);
            Map<String, Object> eventSource = eventHit.source() != null
                ? new LinkedHashMap<>((Map<String, Object>) eventHit.source())
                : new LinkedHashMap<>();

            // 6.8: Validate association
            String eventAlertId = extractNested(eventSource, "alert.id");
            String eventCorrelationId = extractNested(eventSource, "correlation.id");

            boolean associated = extractSourceEventIds(alertSource).contains(eventId);
            if (alertId.equals(eventAlertId)) {
                associated = true;
            } else if (correlationId != null && correlationId.equals(eventCorrelationId)) {
                associated = true;
            }

            if (!associated) {
                return ResponseEntity.status(404).body(Map.of(
                    "error", "NOT_ASSOCIATED",
                    "message", "Event not associated with this alert"));
            }

            // 6.9 / 6.10: Return based on view
            if ("raw".equalsIgnoreCase(view)) {
                return ResponseEntity.ok(Map.of("raw", eventSource));
            }

            // Default: highlighted
            List<Map<String, Object>> fields = fieldClassifier.classify(eventSource);
            return ResponseEntity.ok(Map.of("fields", fields));

        } catch (Exception e) {
            log.error("{}.getEventDetail: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // ALT-006: Entity Relationship Graph
    // =========================================================================

    /**
     * Returns the entity relationship graph for an alert — nodes representing entities
     * (hosts, users, IPs, processes, files, domains) and edges representing their relationships.
     */
    @GetMapping("/ha-alerts/{alertId}/relationships")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @SuppressWarnings({"unchecked", "rawtypes"})
    public ResponseEntity<?> getRelationships(@PathVariable String alertId) {
        try {
            // 1. Fetch alert document
            Map<String, Object> alertSource = fetchAlertById(alertId);
            if (alertSource == null) {
                return ResponseEntity.notFound().build();
            }

            // 2. Query ALL events for this alert from v3-hive-log-*
            String logIndex = indexResolver.resolveIndexPattern("log");

            SearchRequest eventRequest = SearchRequest.of(r -> r
                .index(logIndex)
                .query(buildAssociatedEventQuery(alertId, alertSource))
                .sort(s -> s.field(f -> f.field("@timestamp").order(SortOrder.Asc)))
                .size(200));

            SearchResponse<Map> eventResponse = osClient.execute(os -> os.search(eventRequest, Map.class));

            List<Hit<Map>> hits = eventResponse.hits() != null
                ? eventResponse.hits().hits() : Collections.emptyList();

            // 3. Extract event sources
            List<Map<String, Object>> events = new ArrayList<>();
            for (Hit<Map> hit : hits) {
                if (hit.source() != null) {
                    events.add(new LinkedHashMap<>((Map<String, Object>) hit.source()));
                }
            }

            // 4. Build entity graph
            EntityGraphBuilder.EntityGraphResult graphResult =
                entityGraphBuilder.build(events, alertSource);

            // 5. Return response
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("nodes", graphResult.getNodes());
            response.put("edges", graphResult.getEdges());
            response.put("metadata", graphResult.getMetadata());

            return ResponseEntity.ok(response);

        } catch (Exception e) {
            log.error("{}.getRelationships: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // ALT-012: Live Investigation SSE Stream
    // =========================================================================

    /**
     * Establishes a Server-Sent Events connection for live investigation updates.
     *
     * <p>Clients receive real-time events as the alert evolves: status changes,
     * new story items, process updates, network connections, and enrichment results.
     *
     * <p>Connection lifecycle:
     * <ol>
     *   <li>Validate alert exists and tenant access</li>
     *   <li>Check connection limit (max 10 per alert)</li>
     *   <li>Create emitter with 30-minute timeout</li>
     *   <li>Register in SseConnectionManager (schedules keepalive)</li>
     *   <li>Send initial "connected" event</li>
     *   <li>Register cleanup callbacks</li>
     *   <li>Clear TenantContext (connection stays open)</li>
     * </ol>
     */
    @GetMapping(value = "/ha-alerts/{alertId}/stream")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @SuppressWarnings({"unchecked", "rawtypes"})
    public Object streamInvestigationEvents(@PathVariable String alertId,
                                            HttpServletResponse response) throws IOException {
        // 1. Validate alert exists and tenant access
        Map<String, Object> alertSource;
        try {
            alertSource = fetchAlertById(alertId);
        } catch (Exception e) {
            log.error("{}.streamInvestigationEvents: failed to validate alert [{}]: {}",
                CLASSNAME, alertId, e.getMessage(), e);
            return ResponseEntity.notFound().build();
        }

        if (alertSource == null) {
            return ResponseEntity.notFound().build();
        }

        // HAR-006: Check SSE rate limits before creating emitter
        String tenantPrefix = TenantContext.get();
        String endpoint = "/ha-alerts/investigation/stream";
        rateLimiter.checkLimit(tenantPrefix, endpoint, alertId);
        HaSseRateLimiter.ConnectionHandle connectionHandle = rateLimiter.register(tenantPrefix, endpoint, alertId);

        // 2. Check connection limit (per-alert limit from SseConnectionManager)
        if (sseConnectionManager.getConnectionCount(alertId) >= SseConnectionManager.MAX_CONNECTIONS_PER_ALERT) {
            connectionHandle.close();
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body("Maximum SSE connections reached for alert " + alertId);
        }

        // 3. Create SseEmitter with 30-minute timeout
        SseEmitter emitter = new SseEmitter(30 * 60 * 1000L);

        // 4. Register in SseConnectionManager (also schedules keepalive)
        sseConnectionManager.register(alertId, emitter);

        // 5. Send initial connected event
        try {
            emitter.send(SseEmitter.event()
                .name("connected")
                .id("1")
                .data(Map.of(
                    "alertId", alertId,
                    "serverTime", Instant.now().toString()
                )));
        } catch (IOException e) {
            log.warn("{}.streamInvestigationEvents: failed to send initial event for alert [{}]",
                CLASSNAME, alertId);
            sseConnectionManager.remove(alertId, emitter);
            connectionHandle.close();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Failed to initialize SSE stream");
        }

        // 6. Cleanup on disconnect
        emitter.onCompletion(() -> {
            sseConnectionManager.remove(alertId, emitter);
            connectionHandle.close();
        });
        emitter.onTimeout(() -> {
            sseConnectionManager.remove(alertId, emitter);
            connectionHandle.close();
        });
        emitter.onError(e -> {
            sseConnectionManager.remove(alertId, emitter);
            connectionHandle.close();
        });

        // 7. Clear TenantContext after emitter setup (NOT in finally — emitter stays open)
        TenantContext.clear();

        return emitter;
    }

    // =========================================================================
    // Shared helpers
    // =========================================================================

    /**
     * Fetches an alert document by ID from the alert index.
     * Returns the source map or null if not found.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private Map<String, Object> fetchAlertById(String alertId) throws Exception {
        String indexPattern = indexResolver.resolveAlertIndexPattern();

        SearchRequest request = SearchRequest.of(r -> r
            .index(indexPattern)
            .query(Query.of(q -> q.ids(i -> i.values(List.of(alertId)))))
            .size(1));

        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        if (response.hits() == null || response.hits().hits().isEmpty()) {
            return null;
        }

        Hit<Map> hit = response.hits().hits().get(0);
        if (hit.source() == null) {
            return null;
        }

        Map<String, Object> source = new LinkedHashMap<>((Map<String, Object>) hit.source());
        normalizeAlertSource(alertId, source);
        return source;
    }

    /**
     * Builds the bounded event-association query used by every investigation projection.
     * Producer generations may link evidence by nested alert/correlation fields, by the
     * event.id field, or by OpenSearch document IDs listed in sourceEvents.
     */
    private Query buildAssociatedEventQuery(String alertId, Map<String, Object> alertSource,
                                             Query... filters) {
        List<Query> shouldQueries = new ArrayList<>();
        shouldQueries.add(Query.of(q -> q.term(t ->
            t.field("alert.id.keyword").value(FieldValue.of(alertId)))));

        String correlationId = stringValue(alertSource.get("correlationId"));
        if (correlationId != null && !correlationId.isBlank()) {
            shouldQueries.add(Query.of(q -> q.term(t ->
                t.field("correlation.id.keyword").value(FieldValue.of(correlationId)))));
        }

        List<String> sourceEventIds = extractSourceEventIds(alertSource);
        if (!sourceEventIds.isEmpty()) {
            shouldQueries.add(Query.of(q -> q.ids(i -> i.values(sourceEventIds))));
            List<FieldValue> eventIdValues = sourceEventIds.stream()
                .map(FieldValue::of)
                .collect(Collectors.toList());
            shouldQueries.add(Query.of(q -> q.terms(t -> t
                .field("event.id.keyword")
                .terms(v -> v.value(eventIdValues)))));
        }

        return Query.of(q -> q.bool(b -> {
            b.should(shouldQueries).minimumShouldMatch("1");
            if (filters != null && filters.length > 0) {
                b.filter(Arrays.asList(filters));
            }
            return b;
        }));
    }

    @SuppressWarnings("unchecked")
    private List<String> extractSourceEventIds(Map<String, Object> alertSource) {
        Object raw = alertSource.get("sourceEvents");
        if (!(raw instanceof List)) {
            raw = alertSource.get("sourceEventIds");
        }
		if (!(raw instanceof List)) {
			raw = alertSource.get("eventIds");
		}
        if (!(raw instanceof List)) {
            return Collections.emptyList();
        }

        return ((List<Object>) raw).stream()
            .filter(Objects::nonNull)
            .map(Object::toString)
            .filter(value -> !value.isBlank())
            .distinct()
            .limit(500)
            .collect(Collectors.toList());
    }

    @SuppressWarnings("unchecked")
    private void normalizeAlertSource(String alertId, Map<String, Object> source) {
        source.putIfAbsent("id", alertId);
        source.putIfAbsent("alertId", alertId);
        source.putIfAbsent("@timestamp", source.get("detectedAt"));

        Object ruleRaw = source.get("rule");
        if (ruleRaw instanceof Map) {
            Map<String, Object> rule = (Map<String, Object>) ruleRaw;
            source.putIfAbsent("ruleId", rule.get("id"));
            source.putIfAbsent("ruleName", rule.get("name"));
            source.putIfAbsent("ruleDescription", rule.get("description"));
        }

        Object mitreRaw = source.get("mitre");
        if (mitreRaw instanceof Map) {
            Map<String, Object> mitre = (Map<String, Object>) mitreRaw;
            Object tacticRaw = mitre.get("tactic");
            if (tacticRaw instanceof Map) {
                Map<String, Object> tactic = (Map<String, Object>) tacticRaw;
                source.putIfAbsent("mitreTacticId", tactic.get("id"));
                source.putIfAbsent("mitreTacticName", tactic.get("name"));
            } else if (tacticRaw != null) {
                source.putIfAbsent("mitreTacticName", tacticRaw);
                source.putIfAbsent("mitreTacticId", tacticIdForName(tacticRaw.toString()));
            }

            Object techniqueRaw = mitre.get("technique");
            if (techniqueRaw instanceof Map) {
                Map<String, Object> technique = (Map<String, Object>) techniqueRaw;
                source.putIfAbsent("mitreTechniqueId", technique.get("id"));
                source.putIfAbsent("mitreTechniqueName", technique.get("name"));
            } else if (techniqueRaw != null) {
                source.putIfAbsent("mitreTechniqueId", techniqueRaw);
                source.putIfAbsent("mitreTechniqueName", mitre.get("name"));
            }
        }

		Object legacyTechnique = source.get("technique");
		if (legacyTechnique instanceof String technique && !technique.isBlank()) {
			String[] parts = technique.trim().split("\\s+-\\s+", 2);
			if (parts.length > 0 && parts[0].toUpperCase(Locale.ROOT).startsWith("T")) {
				source.putIfAbsent("mitreTechniqueId", parts[0]);
				if (parts.length == 2 && !parts[1].isBlank()) {
					source.putIfAbsent("mitreTechniqueName", parts[1]);
				}
			}
		}

		Object legacyEventIds = source.get("eventIds");
		if (!source.containsKey("sourceEventIds") && legacyEventIds instanceof List<?>) {
			source.put("sourceEventIds", legacyEventIds);
		}

        Object entitiesRaw = source.get("entities");
        if (entitiesRaw instanceof List && !((List<?>) entitiesRaw).isEmpty()) {
            Object primaryRaw = ((List<?>) entitiesRaw).get(0);
            if (primaryRaw instanceof Map) {
                Map<String, Object> primary = (Map<String, Object>) primaryRaw;
                source.putIfAbsent("primaryEntityId", primary.get("id"));
                source.putIfAbsent("primaryEntityType", primary.get("type"));
                source.putIfAbsent("primaryEntityLabel", primary.get("value"));
            }
        }
    }

    private String tacticIdForName(String tacticName) {
        if (tacticName == null) return null;
        switch (tacticName.trim().toLowerCase(Locale.ROOT)) {
            case "reconnaissance": return "TA0043";
            case "resource development": return "TA0042";
            case "initial access": return "TA0001";
            case "execution": return "TA0002";
            case "persistence": return "TA0003";
            case "privilege escalation": return "TA0004";
            case "defense evasion": return "TA0005";
            case "credential access": return "TA0006";
            case "discovery": return "TA0007";
            case "lateral movement": return "TA0008";
            case "collection": return "TA0009";
            case "command and control": return "TA0011";
            case "exfiltration": return "TA0010";
            case "impact": return "TA0040";
            default: return null;
        }
    }

    private String firstNonBlank(String... values) {
        if (values == null) return null;
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return null;
    }

    private String stringValue(Object value) {
        return value != null ? value.toString() : null;
    }

    /**
     * Extracts a dot-notation nested field value as a String from a map.
     * E.g., "mitre.tactic.id" navigates into nested maps.
     */
    @SuppressWarnings("unchecked")
    private String extractNested(Map<String, Object> src, String path) {
        Object val = extractNestedObject(src, path);
        return val != null ? val.toString() : null;
    }

    /**
     * Extracts a dot-notation nested field value as an Object from a map.
     */
    @SuppressWarnings("unchecked")
    private Object extractNestedObject(Map<String, Object> src, String path) {
        if (src == null || path == null) return null;

        String[] parts = path.split("\\.");
        Object current = src;

        for (String part : parts) {
            if (current instanceof Map) {
                current = ((Map<String, Object>) current).get(part);
            } else {
                return null;
            }
        }
        return current;
    }

    /**
     * Builds a MITRE ATT&CK URL for the given technique ID.
     * Sub-techniques (e.g., T1059.001) produce /techniques/T1059/001/
     * Base techniques (e.g., T1190) produce /techniques/T1190/
     */
    private String buildMitreUrl(String techniqueId) {
        if (techniqueId == null) return null;

        if (techniqueId.contains(".")) {
            String[] parts = techniqueId.split("\\.");
            return "https://attack.mitre.org/techniques/" + parts[0] + "/" + parts[1] + "/";
        }
        return "https://attack.mitre.org/techniques/" + techniqueId + "/";
    }

    /**
     * Maps a numeric status to a human-readable label.
     */
    private String mapStatusLabel(Object status) {
        if (status == null) return "Unknown";
        int val;
        if (status instanceof Number) {
            val = ((Number) status).intValue();
        } else {
            try {
                val = Integer.parseInt(status.toString());
            } catch (NumberFormatException e) {
                return status.toString();
            }
        }
        switch (val) {
            case 1: return "New";
            case 2: return "In Progress";
            case 3: return "Acknowledged";
            case 4: return "Resolved";
            case 5: return "Closed";
            default: return "Unknown";
        }
    }
}
