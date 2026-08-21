package com.hivearmor.service.graph;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
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

import java.util.*;
import java.util.stream.Collectors;

/**
 * Graph expansion service for Threat Constellation (CON-002).
 *
 * <p>Handles node expansion within an existing snapshot: loads the snapshot,
 * queries relationships for the target node, identifies new nodes/edges,
 * enforces the absolute 500-node limit with pruning, enriches new nodes,
 * and updates the snapshot state.
 *
 * <p>Sprint 48 — Threat Constellation.
 */
@Service
public class GraphExpansionService {

    private static final Logger log = LoggerFactory.getLogger(GraphExpansionService.class);
    private static final String CLASSNAME = "GraphExpansionService";

    /** Absolute maximum nodes in a snapshot after expansion. */
    private static final int ABSOLUTE_NODE_LIMIT = 500;

    private static final int DEFAULT_HOP_DEPTH = 1;
    private static final int DEFAULT_NODE_LIMIT = 50;
    private static final int DEFAULT_EDGE_LIMIT = 100;
    private static final String DEFAULT_DIRECTION = "both";

    private final OpensearchClientBuilder osClient;
    private final ObjectMapper objectMapper;
    private final MsspIndexResolver indexResolver;
    private final GraphSnapshotStore snapshotStore;
    private final GraphPivotService pivotService;

    public GraphExpansionService(OpensearchClientBuilder osClient,
                                 ObjectMapper objectMapper,
                                 MsspIndexResolver indexResolver,
                                 GraphSnapshotStore snapshotStore,
                                 GraphPivotService pivotService) {
        this.osClient = osClient;
        this.objectMapper = objectMapper;
        this.indexResolver = indexResolver;
        this.snapshotStore = snapshotStore;
        this.pivotService = pivotService;
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Expands a node in an existing constellation snapshot.
     *
     * @param snapshotId         the snapshot UUID
     * @param nodeId             the node to expand
     * @param options            expansion options: { hopDepth, nodeLimit, edgeLimit, direction }
     * @param tenantIndexPattern not used directly — index patterns resolved via MsspIndexResolver
     * @return response map with addedNodes, addedEdges, removedNodes, snapshot metadata
     * @throws SnapshotNotFoundException if snapshot not found or expired
     * @throws NodeNotInSnapshotException if nodeId not present in snapshot
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> expand(String snapshotId, String nodeId,
                                      Map<String, Object> options,
                                      String tenantIndexPattern) throws Exception {
        final String ctx = CLASSNAME + ".expand";

        // Step 1: Load and validate snapshot
        GraphSnapshotStore.SnapshotEntry snapshot = snapshotStore.getSnapshot(snapshotId);
        if (snapshot == null) {
            throw new SnapshotNotFoundException(snapshotId);
        }

        // Validate tenant ownership
        String currentTenant = TenantContext.get();
        String effectiveTenant = currentTenant != null ? currentTenant : "__default__";
        if (!effectiveTenant.equals(snapshot.getTenantId())) {
            throw new SnapshotNotFoundException(snapshotId);
        }

        // Step 2: Verify nodeId exists in snapshot and is not already expanded
        Map<String, Object> graph = snapshot.getGraph();
        List<Map<String, Object>> existingNodes = (List<Map<String, Object>>) graph.get("nodes");
        List<Map<String, Object>> existingEdges = (List<Map<String, Object>>) graph.get("edges");

        if (existingNodes == null) existingNodes = new ArrayList<>();
        if (existingEdges == null) existingEdges = new ArrayList<>();

        Map<String, Object> targetNode = null;
        for (Map<String, Object> node : existingNodes) {
            if (nodeId.equals(node.get("id"))) {
                targetNode = node;
                break;
            }
        }

        if (targetNode == null) {
            throw new NodeNotInSnapshotException(nodeId, snapshotId);
        }

        // Check if already expanded
        Boolean alreadyExpanded = (Boolean) targetNode.get("expanded");
        if (Boolean.TRUE.equals(alreadyExpanded)) {
            // Return empty expansion — node already expanded
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("addedNodes", List.of());
            response.put("addedEdges", List.of());
            response.put("removedNodes", List.of());
            response.put("snapshot", snapshot.getMetadata());
            return response;
        }

        // Parse options
        int hopDepth = Math.min(getInt(options, "hopDepth", DEFAULT_HOP_DEPTH), 2);
        int nodeLimit = getInt(options, "nodeLimit", DEFAULT_NODE_LIMIT);
        int edgeLimit = getInt(options, "edgeLimit", DEFAULT_EDGE_LIMIT);
        String direction = getString(options, "direction", DEFAULT_DIRECTION);

        // Get confidence threshold from original snapshot metadata
        Map<String, Object> metadata = snapshot.getMetadata();
        double confidenceThreshold = getDouble(metadata, "confidenceThreshold", 0.0);

        // Build set of existing node IDs for duplicate filtering
        Set<String> existingNodeIds = existingNodes.stream()
            .map(n -> (String) n.get("id"))
            .collect(Collectors.toCollection(LinkedHashSet::new));

        // Step 3: Query relationships for node
        String relIndex = indexResolver.resolveIndexPattern("relationship");
        List<Map<String, Object>> relationships = queryNodeRelationships(
            nodeId, relIndex, direction, confidenceThreshold);

        // Step 4: Identify new nodes (not already in snapshot)
        Set<String> newNodeIds = new LinkedHashSet<>();
        for (Map<String, Object> edge : relationships) {
            String source = (String) edge.get("source");
            String target = (String) edge.get("target");

            if (!existingNodeIds.contains(source)) {
                newNodeIds.add(source);
            }
            if (!existingNodeIds.contains(target)) {
                newNodeIds.add(target);
            }
        }

        // Apply per-expansion node limit
        if (newNodeIds.size() > nodeLimit) {
            newNodeIds = newNodeIds.stream()
                .limit(nodeLimit)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        }

        // Step 5: Identify new edges
        // New edges = edges where at least one endpoint is a new node OR
        //             edges between existing nodes not already in the snapshot's edge list
        Set<String> existingEdgeIds = existingEdges.stream()
            .map(e -> (String) e.get("id"))
            .collect(Collectors.toSet());

        Set<String> allNodeIdsAfterExpansion = new LinkedHashSet<>(existingNodeIds);
        allNodeIdsAfterExpansion.addAll(newNodeIds);

        List<Map<String, Object>> newEdges = new ArrayList<>();
        for (Map<String, Object> edge : relationships) {
            String edgeId = (String) edge.get("id");
            String source = (String) edge.get("source");
            String target = (String) edge.get("target");

            // Skip edges already in graph
            if (existingEdgeIds.contains(edgeId)) continue;

            // Only include edges where both endpoints are in the final graph
            if (allNodeIdsAfterExpansion.contains(source) && allNodeIdsAfterExpansion.contains(target)) {
                newEdges.add(edge);
            }
        }

        // Apply edge limit
        if (newEdges.size() > edgeLimit) {
            newEdges = newEdges.subList(0, edgeLimit);
        }

        // Step 6: Absolute limit check — prune if total nodes > 500
        List<String> removedNodes = new ArrayList<>();
        int totalNodesAfter = existingNodeIds.size() + newNodeIds.size();
        if (totalNodesAfter > ABSOLUTE_NODE_LIMIT) {
            int excess = totalNodesAfter - ABSOLUTE_NODE_LIMIT;
            // Prune nodes farthest from seed by hop count
            removedNodes = identifyNodesToPrune(existingNodes, existingEdges, metadata, excess);

            // Remove pruned nodes from existing nodes
            Set<String> prunedSet = new HashSet<>(removedNodes);
            existingNodes = existingNodes.stream()
                .filter(n -> !prunedSet.contains(n.get("id")))
                .collect(Collectors.toList());

            // Remove edges connected to pruned nodes
            existingEdges = existingEdges.stream()
                .filter(e -> !prunedSet.contains(e.get("source")) && !prunedSet.contains(e.get("target")))
                .collect(Collectors.toList());

            // Also remove new edges connected to pruned nodes
            newEdges = newEdges.stream()
                .filter(e -> !prunedSet.contains(e.get("source")) && !prunedSet.contains(e.get("target")))
                .collect(Collectors.toList());
        }

        // Step 7: Enrich new nodes — batch fetch entity details
        List<Map<String, Object>> addedNodes = enrichNewNodes(newNodeIds);

        // Step 8: Update snapshot — add nodes/edges, mark node expanded, reset TTL
        List<Map<String, Object>> updatedNodes = new ArrayList<>(existingNodes);
        updatedNodes.addAll(addedNodes);

        // Mark the expanded node
        for (Map<String, Object> node : updatedNodes) {
            if (nodeId.equals(node.get("id"))) {
                node.put("expanded", true);
                break;
            }
        }

        List<Map<String, Object>> updatedEdges = new ArrayList<>(existingEdges);
        updatedEdges.addAll(newEdges);

        Map<String, Object> updatedGraph = new LinkedHashMap<>();
        updatedGraph.put("nodes", updatedNodes);
        updatedGraph.put("edges", updatedEdges);
        updatedGraph.put("clusters", graph.getOrDefault("clusters", List.of()));

        // Update metadata
        Map<String, Object> updatedMetadata = new LinkedHashMap<>(metadata);
        updatedMetadata.put("totalNodes", updatedNodes.size());
        updatedMetadata.put("totalEdges", updatedEdges.size());

        snapshotStore.updateSnapshot(snapshotId, updatedGraph, updatedMetadata);

        // Step 9: Build response
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("addedNodes", addedNodes);
        response.put("addedEdges", newEdges);
        response.put("removedNodes", removedNodes);
        response.put("snapshot", updatedMetadata);

        log.debug("{}: expanded node={}, added {} nodes, {} edges, pruned {} nodes",
            ctx, nodeId, addedNodes.size(), newEdges.size(), removedNodes.size());

        return response;
    }

    // =========================================================================
    // Relationship Query
    // =========================================================================

    /**
     * Queries relationships for a specific node filtered by direction and confidence.
     */
    @SuppressWarnings("rawtypes")
    private List<Map<String, Object>> queryNodeRelationships(String nodeId,
                                                             String relIndex,
                                                             String direction,
                                                             double confidenceThreshold) throws Exception {
        // Build direction-specific query
        // Support both field name conventions: sourceEntityId (Sprint 46) and source (Sprint 48 seed)
        List<Query> shouldQueries = new ArrayList<>();

        if ("outbound".equals(direction) || "both".equals(direction)) {
            shouldQueries.add(Query.of(q -> q.term(t -> t
                .field("sourceEntityId.keyword")
                .value(v -> v.stringValue(nodeId)))));
            shouldQueries.add(Query.of(q -> q.term(t -> t
                .field("source.keyword")
                .value(v -> v.stringValue(nodeId)))));
        }
        if ("inbound".equals(direction) || "both".equals(direction)) {
            shouldQueries.add(Query.of(q -> q.term(t -> t
                .field("targetEntityId.keyword")
                .value(v -> v.stringValue(nodeId)))));
            shouldQueries.add(Query.of(q -> q.term(t -> t
                .field("target.keyword")
                .value(v -> v.stringValue(nodeId)))));
        }

        // Filters
        List<Query> filters = new ArrayList<>();
        if (confidenceThreshold > 0) {
            filters.add(Query.of(q -> q.range(r -> r
                .field("confidence")
                .gte(JsonData.of(confidenceThreshold)))));
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
    // Pruning Logic
    // =========================================================================

    /**
     * Identifies nodes to prune — those farthest from the seed by hop count.
     * Uses BFS from the seed node(s) to compute distances, then prunes the farthest.
     */
    @SuppressWarnings("unchecked")
    private List<String> identifyNodesToPrune(List<Map<String, Object>> nodes,
                                              List<Map<String, Object>> edges,
                                              Map<String, Object> metadata,
                                              int countToPrune) {
        // Find seed node(s)
        Set<String> seedNodeIds = new HashSet<>();
        Object seedObj = metadata.get("seed");
        if (seedObj instanceof Map) {
            Map<String, Object> seed = (Map<String, Object>) seedObj;
            String seedValue = (String) seed.get("value");
            if (seedValue != null) seedNodeIds.add(seedValue);
        }

        // If no seed found, use expanded nodes as roots
        if (seedNodeIds.isEmpty()) {
            for (Map<String, Object> node : nodes) {
                if (Boolean.TRUE.equals(node.get("expanded"))) {
                    seedNodeIds.add((String) node.get("id"));
                }
            }
        }

        // If still empty, cannot determine distance — prune last nodes added
        if (seedNodeIds.isEmpty()) {
            return nodes.stream()
                .map(n -> (String) n.get("id"))
                .skip(Math.max(0, nodes.size() - countToPrune))
                .collect(Collectors.toList());
        }

        // Build adjacency list
        Map<String, Set<String>> adjacency = new HashMap<>();
        for (Map<String, Object> node : nodes) {
            adjacency.put((String) node.get("id"), new HashSet<>());
        }
        for (Map<String, Object> edge : edges) {
            String source = (String) edge.get("source");
            String target = (String) edge.get("target");
            if (adjacency.containsKey(source)) adjacency.get(source).add(target);
            if (adjacency.containsKey(target)) adjacency.get(target).add(source);
        }

        // BFS from seed to compute distances
        Map<String, Integer> distances = new HashMap<>();
        Queue<String> queue = new LinkedList<>(seedNodeIds);
        for (String seedId : seedNodeIds) {
            distances.put(seedId, 0);
        }

        while (!queue.isEmpty()) {
            String current = queue.poll();
            int currentDist = distances.get(current);
            Set<String> neighbors = adjacency.getOrDefault(current, Set.of());
            for (String neighbor : neighbors) {
                if (!distances.containsKey(neighbor)) {
                    distances.put(neighbor, currentDist + 1);
                    queue.add(neighbor);
                }
            }
        }

        // Sort nodes by distance (descending) — prune farthest first
        // Never prune seed nodes
        List<Map.Entry<String, Integer>> sortedByDistance = distances.entrySet().stream()
            .filter(e -> !seedNodeIds.contains(e.getKey()))
            .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
            .collect(Collectors.toList());

        // Also include unreachable nodes (not in distances map)
        Set<String> allNodeIds = nodes.stream()
            .map(n -> (String) n.get("id"))
            .collect(Collectors.toSet());
        List<String> unreachable = allNodeIds.stream()
            .filter(id -> !distances.containsKey(id) && !seedNodeIds.contains(id))
            .collect(Collectors.toList());

        List<String> toPrune = new ArrayList<>(unreachable);
        for (Map.Entry<String, Integer> entry : sortedByDistance) {
            if (toPrune.size() >= countToPrune) break;
            toPrune.add(entry.getKey());
        }

        return toPrune.stream().limit(countToPrune).collect(Collectors.toList());
    }

    // =========================================================================
    // Node Enrichment
    // =========================================================================

    /**
     * Batch fetches entity details for new node IDs and maps to GraphNode objects.
     */
    @SuppressWarnings("rawtypes")
    private List<Map<String, Object>> enrichNewNodes(Set<String> nodeIds) throws Exception {
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

        // Build lookup from entity ID to document
        Map<String, Map<String, Object>> entityDocs = new HashMap<>();
        for (Hit<Map> hit : response.hits().hits()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> doc = hit.source();
            if (doc != null) {
                entityDocs.put(hit.id(), doc);
            }
        }

        // Fallback: try matching by entityId.keyword for IDs not found by _id
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

            node.put("group", null);
            node.put("expandable", true);
            node.put("expanded", false);

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
    // Exception Classes
    // =========================================================================

    /**
     * Thrown when a snapshot is not found or has expired.
     */
    public static class SnapshotNotFoundException extends Exception {
        private final String snapshotId;

        public SnapshotNotFoundException(String snapshotId) {
            super("Snapshot not found or expired: " + snapshotId);
            this.snapshotId = snapshotId;
        }

        public String getSnapshotId() { return snapshotId; }
    }

    /**
     * Thrown when the specified node is not in the snapshot.
     */
    public static class NodeNotInSnapshotException extends Exception {
        private final String nodeId;
        private final String snapshotId;

        public NodeNotInSnapshotException(String nodeId, String snapshotId) {
            super("Node " + nodeId + " not found in snapshot " + snapshotId);
            this.nodeId = nodeId;
            this.snapshotId = snapshotId;
        }

        public String getNodeId() { return nodeId; }
        public String getSnapshotId() { return snapshotId; }
    }

    // =========================================================================
    // Helpers
    // =========================================================================

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
