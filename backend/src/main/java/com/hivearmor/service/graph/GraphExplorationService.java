package com.hivearmor.service.graph;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.opensearch.client.json.JsonData;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Graph exploration service for Threat Constellation (CON-001).
 *
 * <p>Resolves seed entities, performs BFS traversal of the relationship graph,
 * enforces node/edge limits, enriches nodes, detects clusters, and creates
 * snapshots for subsequent expansion and streaming.
 *
 * <p>Sprint 48 — Threat Constellation.
 */
@Service
public class GraphExplorationService {

    private static final Logger log = LoggerFactory.getLogger(GraphExplorationService.class);
    private static final String CLASSNAME = "GraphExplorationService";

    private static final int DEFAULT_HOP_DEPTH = 2;
    private static final int MAX_HOP_DEPTH = 3;
    private static final int DEFAULT_NODE_LIMIT = 200;
    private static final int DEFAULT_EDGE_LIMIT = 500;
    private static final double DEFAULT_CONFIDENCE_THRESHOLD = 0.0;
    private static final String DEFAULT_TIME_WINDOW = "30d";

    private final OpensearchClientBuilder osClient;
    private final ObjectMapper objectMapper;
    private final MsspIndexResolver indexResolver;
    private final GraphClusterDetector clusterDetector;
    private final GraphSnapshotStore snapshotStore;
    private final GraphPivotService pivotService;

    public GraphExplorationService(OpensearchClientBuilder osClient,
                                   ObjectMapper objectMapper,
                                   MsspIndexResolver indexResolver,
                                   GraphClusterDetector clusterDetector,
                                   GraphSnapshotStore snapshotStore,
                                   GraphPivotService pivotService) {
        this.osClient = osClient;
        this.objectMapper = objectMapper;
        this.indexResolver = indexResolver;
        this.clusterDetector = clusterDetector;
        this.snapshotStore = snapshotStore;
        this.pivotService = pivotService;
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Explores the graph from a seed entity/query/incident/alert.
     *
     * @param seed               the seed descriptor: { type, value }
     * @param options            exploration options: { hopDepth, nodeLimit, edgeLimit, ... }
     * @param tenantIndexPattern not used directly — index patterns resolved via MsspIndexResolver
     * @return response map with snapshotId, graph, metadata
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> explore(Map<String, Object> seed,
                                       Map<String, Object> options,
                                       String tenantIndexPattern) throws Exception {
        final String ctx = CLASSNAME + ".explore";

        // Parse options
        int hopDepth = Math.min(getInt(options, "hopDepth", DEFAULT_HOP_DEPTH), MAX_HOP_DEPTH);
        int nodeLimit = getInt(options, "nodeLimit", DEFAULT_NODE_LIMIT);
        int edgeLimit = getInt(options, "edgeLimit", DEFAULT_EDGE_LIMIT);
        double confidenceThreshold = getDouble(options, "confidenceThreshold", DEFAULT_CONFIDENCE_THRESHOLD);
        String timeWindow = getString(options, "timeWindow", DEFAULT_TIME_WINDOW);
        List<String> entityTypes = options != null && options.containsKey("entityTypes")
            ? (List<String>) options.get("entityTypes") : null;

        // Step 1: Resolve seed nodes
        String seedType = seed != null ? (String) seed.get("type") : "entity";
        String seedValue = seed != null ? (String) seed.get("value") : "";
        List<String> seedNodeIds = resolveSeed(seedType, seedValue);

        if (seedNodeIds.isEmpty()) {
            log.warn("{}: no seed nodes resolved for type={} value={}", ctx, seedType, seedValue);
            return buildEmptyResponse(seed);
        }

        // Step 2-3: BFS traversal
        Instant timeWindowStart = parseTimeWindow(timeWindow);
        String relIndex = indexResolver.resolveIndexPattern("relationship");

        Set<String> visitedNodes = new LinkedHashSet<>(seedNodeIds);
        List<Map<String, Object>> allEdges = new ArrayList<>();
        boolean truncated = false;
        int hopsExplored = 0;

        Set<String> currentLevel = new LinkedHashSet<>(seedNodeIds);

        for (int hop = 0; hop < hopDepth && !truncated; hop++) {
            // Query relationships for current level nodes
            List<Map<String, Object>> hopEdges = queryRelationships(
                currentLevel, relIndex, confidenceThreshold, timeWindowStart);

            // Filter by entity types on target nodes
            Set<String> newNodes = new HashSet<>();
            List<Map<String, Object>> validEdges = new ArrayList<>();

            for (Map<String, Object> edge : hopEdges) {
                String source = (String) edge.get("source");
                String target = (String) edge.get("target");

                // Determine which end is new
                String newNode = null;
                if (!visitedNodes.contains(target)) newNode = target;
                else if (!visitedNodes.contains(source)) newNode = source;

                if (newNode != null) {
                    // Apply entity type filter
                    if (entityTypes != null && !entityTypes.isEmpty()) {
                        String nodeType = extractTypeFromEntityId(newNode);
                        if (!entityTypes.contains(nodeType)) continue;
                    }
                    newNodes.add(newNode);
                }
                validEdges.add(edge);
            }

            allEdges.addAll(validEdges);

            // Step 4: Limit enforcement
            if (visitedNodes.size() + newNodes.size() > nodeLimit) {
                // Truncate: keep only enough new nodes to reach limit
                int remaining = nodeLimit - visitedNodes.size();
                Set<String> truncatedNodes = newNodes.stream()
                    .limit(remaining)
                    .collect(Collectors.toCollection(LinkedHashSet::new));
                visitedNodes.addAll(truncatedNodes);
                truncated = true;
            } else {
                visitedNodes.addAll(newNodes);
            }

            if (allEdges.size() > edgeLimit) {
                allEdges = allEdges.subList(0, edgeLimit);
                truncated = true;
            }

            currentLevel = newNodes.stream()
                .filter(visitedNodes::contains)
                .collect(Collectors.toCollection(LinkedHashSet::new));

            hopsExplored = hop + 1;

            if (currentLevel.isEmpty()) break;
        }

        // Step 5: Node enrichment — batch fetch entity details
        List<Map<String, Object>> nodes = enrichNodes(visitedNodes, seedNodeIds);

        // Step 6: Detect clusters
        List<Map<String, Object>> clusters = clusterDetector.detectClusters(
            visitedNodes, allEdges);

        // Assign cluster groups to nodes
        for (Map<String, Object> node : nodes) {
            String nodeId = (String) node.get("id");
            String group = clusterDetector.getNodeCluster(nodeId, clusters);
            node.put("group", group);
        }

        // Remove internal nodeIds from cluster output
        List<Map<String, Object>> clusterOutput = clusters.stream()
            .map(c -> {
                Map<String, Object> out = new LinkedHashMap<>(c);
                out.remove("nodeIds");
                return out;
            })
            .collect(Collectors.toList());

        // Step 7: Build response graph
        Map<String, Object> graph = new LinkedHashMap<>();
        graph.put("nodes", nodes);
        graph.put("edges", allEdges);
        graph.put("clusters", clusterOutput);

        // Step 8: Create snapshot
        Instant now = Instant.now();
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("createdAt", now.toString());
        metadata.put("expiresAt", now.plus(30, ChronoUnit.MINUTES).toString());
        metadata.put("seed", seed);
        metadata.put("totalNodes", nodes.size());
        metadata.put("totalEdges", allEdges.size());
        metadata.put("truncated", truncated);
        metadata.put("hopsExplored", hopsExplored);

        String tenantId = com.hivearmor.multitenancy.TenantContext.get();
        String snapshotId = snapshotStore.createSnapshot(tenantId, graph, metadata);
        metadata.put("snapshotId", snapshotId);

        // Step 9: Build final response
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("snapshotId", snapshotId);
        response.put("graph", graph);
        response.put("metadata", metadata);

        log.debug("{}: explored {} nodes, {} edges, {} clusters, truncated={}",
            ctx, nodes.size(), allEdges.size(), clusterOutput.size(), truncated);

        return response;
    }

    // =========================================================================
    // Seed Resolution
    // =========================================================================

    /**
     * Resolves seed to a list of entity IDs depending on seed type.
     */
    private List<String> resolveSeed(String seedType, String seedValue) throws Exception {
        return switch (seedType) {
            case "entity" -> resolveSeedEntity(seedValue);
            case "query" -> resolveSeedQuery(seedValue);
            case "incident" -> resolveSeedIncident(seedValue);
            case "alert" -> resolveSeedAlert(seedValue);
            default -> {
                log.warn("{}.resolveSeed: unknown seed type={}", CLASSNAME, seedType);
                yield List.of();
            }
        };
    }

    /**
     * Entity seed: fetch entity from v3-hive-entity-* by ID, confirm it exists.
     */
    @SuppressWarnings("rawtypes")
    private List<String> resolveSeedEntity(String entityId) throws Exception {
        String entityIndex = indexResolver.resolveIndexPattern("entity");
        SearchRequest request = new SearchRequest.Builder()
            .index(entityIndex)
            .query(Query.of(q -> q.term(t -> t.field("_id").value(v -> v.stringValue(entityId)))))
            .size(1)
            .build();

        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));
        if (response.hits().total() != null && response.hits().total().value() > 0) {
            return List.of(entityId);
        }
        // Fallback: try matching by entityId field
        SearchRequest fallback = new SearchRequest.Builder()
            .index(entityIndex)
            .query(Query.of(q -> q.term(t -> t.field("entityId.keyword").value(v -> v.stringValue(entityId)))))
            .size(1)
            .build();
        SearchResponse<Map> fallbackResp = osClient.execute(os -> os.search(fallback, Map.class));
        if (fallbackResp.hits().hits() != null && !fallbackResp.hits().hits().isEmpty()) {
            Hit<Map> hit = fallbackResp.hits().hits().get(0);
            return List.of(hit.id());
        }
        return List.of(entityId); // Assume it exists; traversal will return empty if not
    }

    /**
     * Query seed: execute query on v3-hive-log-*, extract unique entity values,
     * resolve to entity IDs.
     */
    @SuppressWarnings("rawtypes")
    private List<String> resolveSeedQuery(String queryString) throws Exception {
        String logIndex = indexResolver.resolveIndexPattern("log");
        SearchRequest request = new SearchRequest.Builder()
            .index(logIndex)
            .query(Query.of(q -> q.queryString(qs -> qs.query(queryString))))
            .size(100)
            .source(src -> src.filter(f -> f.includes(List.of(
                "source.ip", "host.name", "user.name",
                "destination.ip", "source.host"
            ))))
            .build();

        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        Set<String> entityValues = new LinkedHashSet<>();
        for (Hit<Map> hit : response.hits().hits()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> source = hit.source();
            if (source == null) continue;
            extractEntityValue(source, "source.ip", entityValues);
            extractEntityValue(source, "host.name", entityValues);
            extractEntityValue(source, "user.name", entityValues);
            extractEntityValue(source, "destination.ip", entityValues);
        }

        // Resolve values to entity IDs
        return resolveEntityValues(entityValues);
    }

    /**
     * Incident seed: fetch incident, extract linked entity IDs.
     */
    @SuppressWarnings({"rawtypes", "unchecked"})
    private List<String> resolveSeedIncident(String incidentId) throws Exception {
        String incidentIndex = indexResolver.resolveIndexPattern("incident");
        SearchRequest request = new SearchRequest.Builder()
            .index(incidentIndex)
            .query(Query.of(q -> q.term(t -> t.field("_id").value(v -> v.stringValue(incidentId)))))
            .size(1)
            .build();

        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));
        if (response.hits().hits() == null || response.hits().hits().isEmpty()) {
            return List.of();
        }

        Map<String, Object> incidentDoc = response.hits().hits().get(0).source();
        if (incidentDoc == null) return List.of();

        // Extract entity IDs from incident's entities field
        List<String> entityIds = new ArrayList<>();
        Object entities = incidentDoc.get("entities");
        if (entities instanceof List) {
            for (Object entity : (List<Object>) entities) {
                if (entity instanceof Map) {
                    String id = (String) ((Map<String, Object>) entity).get("entityId");
                    if (id != null) entityIds.add(id);
                } else if (entity instanceof String) {
                    entityIds.add((String) entity);
                }
            }
        }
        return entityIds.isEmpty() ? List.of() : entityIds;
    }

    /**
     * Alert seed: fetch alert, extract entity values, resolve to IDs.
     */
    @SuppressWarnings({"rawtypes", "unchecked"})
    private List<String> resolveSeedAlert(String alertId) throws Exception {
        String alertIndex = indexResolver.resolveIndexPattern("alert");
        SearchRequest request = new SearchRequest.Builder()
            .index(alertIndex)
            .query(Query.of(q -> q.term(t -> t.field("_id").value(v -> v.stringValue(alertId)))))
            .size(1)
            .build();

        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));
        if (response.hits().hits() == null || response.hits().hits().isEmpty()) {
            return List.of();
        }

        Map<String, Object> alertDoc = response.hits().hits().get(0).source();
        if (alertDoc == null) return List.of();

        // Extract entity values from alert fields
        Set<String> entityValues = new LinkedHashSet<>();
        extractEntityValue(alertDoc, "source.ip", entityValues);
        extractEntityValue(alertDoc, "host.name", entityValues);
        extractEntityValue(alertDoc, "user.name", entityValues);
        extractEntityValue(alertDoc, "destination.ip", entityValues);

        // Also check for explicit entity references
        Object entities = alertDoc.get("entities");
        if (entities instanceof List) {
            for (Object entity : (List<Object>) entities) {
                if (entity instanceof Map) {
                    String id = (String) ((Map<String, Object>) entity).get("entityId");
                    if (id != null) return List.of(id); // Direct entity IDs
                }
            }
        }

        return resolveEntityValues(entityValues);
    }

    // =========================================================================
    // Graph Traversal
    // =========================================================================

    /**
     * Queries v3-hive-relationship-* for edges where source OR target is in the given node set.
     */
    @SuppressWarnings("rawtypes")
    private List<Map<String, Object>> queryRelationships(Set<String> nodeIds,
                                                         String relIndex,
                                                         double confidenceThreshold,
                                                         Instant timeWindowStart) throws Exception {
        if (nodeIds.isEmpty()) return List.of();

        List<FieldValue> nodeIdValues = nodeIds.stream()
            .map(FieldValue::of)
            .collect(Collectors.toList());

        // Query: source OR target IN current level nodes
        // Support both field name conventions: sourceEntityId (Sprint 46) and source (Sprint 48 seed)
        List<Query> shouldQueries = List.of(
            Query.of(q -> q.terms(t -> t.field("sourceEntityId.keyword")
                .terms(tv -> tv.value(nodeIdValues)))),
            Query.of(q -> q.terms(t -> t.field("targetEntityId.keyword")
                .terms(tv -> tv.value(nodeIdValues)))),
            Query.of(q -> q.terms(t -> t.field("source.keyword")
                .terms(tv -> tv.value(nodeIdValues)))),
            Query.of(q -> q.terms(t -> t.field("target.keyword")
                .terms(tv -> tv.value(nodeIdValues))))
        );

        // Filters: confidence >= threshold, lastSeen within timeWindow
        List<Query> filters = new ArrayList<>();
        if (confidenceThreshold > 0) {
            filters.add(Query.of(q -> q.range(r -> r
                .field("confidence")
                .gte(JsonData.of(confidenceThreshold)))));
        }
        if (timeWindowStart != null) {
            final String sinceStr = timeWindowStart.toString();
            filters.add(Query.of(q -> q.range(r -> r
                .field("lastSeen")
                .gte(JsonData.of(sinceStr)))));
        }

        SearchRequest request = new SearchRequest.Builder()
            .index(relIndex)
            .query(Query.of(q -> q.bool(b -> {
                b.should(shouldQueries).minimumShouldMatch("1");
                if (!filters.isEmpty()) b.filter(filters);
                return b;
            })))
            .size(500)
            .sort(s -> s.field(f -> f.field("strength").order(SortOrder.Desc)))
            .build();

        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        List<Map<String, Object>> edges = new ArrayList<>();
        for (Hit<Map> hit : response.hits().hits()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> source = hit.source();
            if (source == null) continue;

            Map<String, Object> edge = new LinkedHashMap<>();
            edge.put("id", hit.id());
            edge.put("source", getString(source, "sourceEntityId",
                getString(source, "source", "")));
            edge.put("target", getString(source, "targetEntityId",
                getString(source, "target", "")));
            edge.put("relationshipType", getString(source, "relationshipType", "related_to"));
            edge.put("strength", getDouble(source, "strength", 0.5));
            edge.put("confidence", getDouble(source, "confidence", 0.5));
            edge.put("label", getString(source, "label", ""));
            edge.put("eventCount", getInt(source, "eventCount", 0));
            edge.put("firstSeen", getString(source, "firstSeen", ""));
            edge.put("lastSeen", getString(source, "lastSeen", ""));
            edges.add(edge);
        }

        return edges;
    }

    // =========================================================================
    // Node Enrichment
    // =========================================================================

    /**
     * Batch fetches entity details for all discovered node IDs and maps to GraphNode objects.
     */
    @SuppressWarnings("rawtypes")
    private List<Map<String, Object>> enrichNodes(Set<String> nodeIds,
                                                  List<String> seedNodeIds) throws Exception {
        if (nodeIds.isEmpty()) return List.of();

        String entityIndex = indexResolver.resolveIndexPattern("entity");
        List<FieldValue> idValues = nodeIds.stream()
            .map(FieldValue::of)
            .collect(Collectors.toList());

        // Batch fetch using terms query on _id
        SearchRequest request = new SearchRequest.Builder()
            .index(entityIndex)
            .query(Query.of(q -> q.terms(t -> t.field("_id")
                .terms(tv -> tv.value(idValues)))))
            .size(nodeIds.size())
            .build();

        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        // Build a lookup map from entity ID to document
        Map<String, Map<String, Object>> entityDocs = new HashMap<>();
        for (Hit<Map> hit : response.hits().hits()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> doc = hit.source();
            if (doc != null) {
                entityDocs.put(hit.id(), doc);
            }
        }

        // Also try matching by entityId.keyword field for IDs not found by _id
        Set<String> unfound = nodeIds.stream()
            .filter(id -> !entityDocs.containsKey(id))
            .collect(Collectors.toSet());

        if (!unfound.isEmpty()) {
            List<FieldValue> unfoundValues = unfound.stream()
                .map(FieldValue::of)
                .collect(Collectors.toList());

            SearchRequest fallback = new SearchRequest.Builder()
                .index(entityIndex)
                .query(Query.of(q -> q.terms(t -> t.field("entityId.keyword")
                    .terms(tv -> tv.value(unfoundValues)))))
                .size(unfound.size())
                .build();

            SearchResponse<Map> fallbackResp = osClient.execute(os -> os.search(fallback, Map.class));
            for (Hit<Map> hit : fallbackResp.hits().hits()) {
                @SuppressWarnings("unchecked")
                Map<String, Object> doc = hit.source();
                if (doc != null) {
                    String entityId = (String) doc.get("entityId");
                    if (entityId != null) entityDocs.put(entityId, doc);
                    entityDocs.put(hit.id(), doc);
                }
            }
        }

        // Map to GraphNode objects
        Set<String> seedSet = new HashSet<>(seedNodeIds);
        List<Map<String, Object>> nodes = new ArrayList<>();

        for (String nodeId : nodeIds) {
            Map<String, Object> doc = entityDocs.get(nodeId);
            Map<String, Object> node = new LinkedHashMap<>();
            node.put("id", nodeId);
            node.put("entityId", nodeId);

            if (doc != null) {
                node.put("type", getString(doc, "entityType", extractTypeFromEntityId(nodeId)));
                node.put("value", getString(doc, "entityValue", nodeId));
                node.put("displayName", getString(doc, "displayName",
                    getString(doc, "entityValue", nodeId)));
                int riskScore = getInt(doc, "riskScore", 0);
                node.put("riskScore", riskScore);
                node.put("riskLevel", computeRiskLevel(riskScore));
                node.put("alertCount", getInt(doc, "alertCount", 0));
                node.put("size", computeNodeSize(riskScore));
            } else {
                // Minimal node from ID only
                node.put("type", extractTypeFromEntityId(nodeId));
                node.put("value", nodeId);
                node.put("displayName", nodeId);
                node.put("riskScore", 0);
                node.put("riskLevel", "low");
                node.put("alertCount", 0);
                node.put("size", 1);
            }

            node.put("group", null); // Assigned after cluster detection
            node.put("expandable", true);
            node.put("expanded", seedSet.contains(nodeId));

            // Generate pivots for this node (CON-004)
            String nodeType = (String) node.get("type");
            String nodeValue = (String) node.get("value");
            node.put("pivots", pivotService.generatePivots(nodeId, nodeType, nodeValue));

            nodes.add(node);
        }

        return nodes;
    }

    // =========================================================================
    // Node Sizing
    // =========================================================================

    /**
     * Computes node size based on riskScore:
     * low (0-39) = 1, medium (40-69) = 2, high/critical (70+) = 3
     */
    private int computeNodeSize(int riskScore) {
        if (riskScore >= 70) return 3;
        if (riskScore >= 40) return 2;
        return 1;
    }

    private String computeRiskLevel(int riskScore) {
        if (riskScore >= 85) return "critical";
        if (riskScore >= 70) return "high";
        if (riskScore >= 40) return "medium";
        return "low";
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    @SuppressWarnings("unchecked")
    private void extractEntityValue(Map<String, Object> doc, String path, Set<String> values) {
        String[] parts = path.split("\\.");
        Object current = doc;
        for (String part : parts) {
            if (current instanceof Map) {
                current = ((Map<String, Object>) current).get(part);
            } else {
                return;
            }
        }
        if (current instanceof String && !((String) current).isBlank()) {
            values.add((String) current);
        }
    }

    /**
     * Resolves raw entity values (IP, hostname, username) to entity document IDs.
     */
    @SuppressWarnings("rawtypes")
    private List<String> resolveEntityValues(Set<String> entityValues) throws Exception {
        if (entityValues.isEmpty()) return List.of();

        String entityIndex = indexResolver.resolveIndexPattern("entity");
        List<FieldValue> values = entityValues.stream()
            .map(FieldValue::of)
            .collect(Collectors.toList());

        SearchRequest request = new SearchRequest.Builder()
            .index(entityIndex)
            .query(Query.of(q -> q.terms(t -> t.field("entityValue.keyword")
                .terms(tv -> tv.value(values)))))
            .size(entityValues.size())
            .build();

        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        List<String> ids = new ArrayList<>();
        for (Hit<Map> hit : response.hits().hits()) {
            ids.add(hit.id());
        }
        return ids;
    }

    private Instant parseTimeWindow(String timeWindow) {
        if (timeWindow == null || timeWindow.isBlank()) {
            return Instant.now().minus(30, ChronoUnit.DAYS);
        }
        String value = timeWindow.replaceAll("[^0-9]", "");
        String unit = timeWindow.replaceAll("[0-9]", "");
        int amount = value.isEmpty() ? 30 : Integer.parseInt(value);

        return switch (unit) {
            case "h" -> Instant.now().minus(amount, ChronoUnit.HOURS);
            case "d" -> Instant.now().minus(amount, ChronoUnit.DAYS);
            case "w" -> Instant.now().minus((long) amount * 7, ChronoUnit.DAYS);
            default -> Instant.now().minus(30, ChronoUnit.DAYS);
        };
    }

    private String extractTypeFromEntityId(String entityId) {
        if (entityId == null) return "unknown";
        if (entityId.startsWith("ent-")) {
            String rest = entityId.substring(4);
            int dashIdx = rest.indexOf('-');
            if (dashIdx > 0) return rest.substring(0, dashIdx);
            return rest;
        }
        return "unknown";
    }

    private Map<String, Object> buildEmptyResponse(Map<String, Object> seed) {
        Map<String, Object> graph = new LinkedHashMap<>();
        graph.put("nodes", List.of());
        graph.put("edges", List.of());
        graph.put("clusters", List.of());

        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("snapshotId", null);
        metadata.put("createdAt", Instant.now().toString());
        metadata.put("expiresAt", Instant.now().toString());
        metadata.put("seed", seed);
        metadata.put("totalNodes", 0);
        metadata.put("totalEdges", 0);
        metadata.put("truncated", false);
        metadata.put("hopsExplored", 0);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("snapshotId", null);
        response.put("graph", graph);
        response.put("metadata", metadata);
        return response;
    }

    private static int getInt(Map<String, Object> map, String key, int defaultValue) {
        if (map == null || !map.containsKey(key)) return defaultValue;
        Object val = map.get(key);
        if (val instanceof Number) return ((Number) val).intValue();
        if (val instanceof String) {
            try { return Integer.parseInt((String) val); }
            catch (NumberFormatException e) { return defaultValue; }
        }
        return defaultValue;
    }

    private static double getDouble(Map<String, Object> map, String key, double defaultValue) {
        if (map == null || !map.containsKey(key)) return defaultValue;
        Object val = map.get(key);
        if (val instanceof Number) return ((Number) val).doubleValue();
        if (val instanceof String) {
            try { return Double.parseDouble((String) val); }
            catch (NumberFormatException e) { return defaultValue; }
        }
        return defaultValue;
    }

    private static String getString(Map<String, Object> map, String key, String defaultValue) {
        if (map == null || !map.containsKey(key)) return defaultValue;
        Object val = map.get(key);
        if (val instanceof String) return (String) val;
        if (val != null) return val.toString();
        return defaultValue;
    }
}
