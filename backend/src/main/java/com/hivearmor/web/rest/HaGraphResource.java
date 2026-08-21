package com.hivearmor.web.rest;

import com.hivearmor.opensearch.OpenSearch;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.dto.HiveGraphEdgeDTO;
import com.hivearmor.service.dto.HiveGraphNodeDTO;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.aggregations.StringTermsBucket;
import org.opensearch.client.opensearch._types.query_dsl.BoolQuery;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch._types.query_dsl.RangeQuery;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.json.JsonData;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * REST controller — Threat Constellation (INV-06).
 *
 * The frontend constellation.service.ts calls TWO endpoints and merges the results:
 *
 *   GET /api/ha-graph/nodes  — returns { nodes: GraphNodeDTO[] }
 *   GET /api/ha-graph/edges  — returns { edges: GraphEdgeDTO[] }
 *
 * Both are derived from OpenSearch v3-hive-alert-* aggregations — no Neo4j required.
 *
 * Query params (both endpoints accept the same set):
 *   type[]   — filter by entity type(s): user | host | ip | process | file | domain
 *   minRisk  — minimum risk score (integer 0-100), ignored here (risk comes from PG)
 *   timeRange — preset: 1h | 4h | 24h | 7d (default 24h)
 *   depth    — hop depth 1-3 (default 2, capped at 2 for performance)
 *   limit    — max nodes to return (default 500, hard-capped at 500)
 *   edgeType — filter edge types (ignored for nodes; applied to edge label mapping)
 */
@RestController
@RequestMapping("/api/ha-graph")
@PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_USER')")
@Tag(name = "Constellation", description = "Threat constellation graph exploration (CON-001 through CON-005)")
public class HaGraphResource {

    private static final Logger log = LoggerFactory.getLogger(HaGraphResource.class);

    private final OpensearchClientBuilder osClient;
    private final MsspIndexResolver indexResolver;

    public HaGraphResource(OpensearchClientBuilder osClient, MsspIndexResolver indexResolver) {
        this.osClient = osClient;
        this.indexResolver = indexResolver;
    }

    // ------------------------------------------------------------------
    // GET /api/ha-graph/nodes
    // ------------------------------------------------------------------

    @GetMapping("/nodes")
    @Operation(
        summary = "List constellation graph nodes",
        description = "Returns graph nodes representing distinct entities (IPs, hosts, users) derived from "
            + "alert aggregations. Supports filtering by entity type, time range, and node limit. (CON-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Graph nodes returned successfully"),
        @ApiResponse(responseCode = "400", description = "Invalid query parameters"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges")
    })
    public ResponseEntity<Map<String, Object>> getNodes(
            @RequestParam(name = "type",      required = false) List<String> types,
            @RequestParam(name = "timeRange", defaultValue = "24h") String timeRange,
            @RequestParam(name = "limit",     defaultValue = "500") int limit,
            @RequestParam(name = "minRisk",   defaultValue = "0")   int minRisk,
            @RequestParam(name = "depth",     defaultValue = "2")   int depth) {
        log.debug("GET /api/ha-graph/nodes timeRange={} limit={}", timeRange, limit);

        int cappedLimit = Math.min(limit, 500);
        String since = sinceFromTimeRange(timeRange);

        try {
            List<HiveGraphNodeDTO> nodes = osClient.execute(os -> buildNodes(os, since, types, cappedLimit));
            // Fallback: if alert-based aggregation returns empty, query entity index directly
            if (nodes.isEmpty()) {
                nodes = osClient.execute(os -> buildNodesFromEntityIndex(os, since, types, cappedLimit));
            }
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("nodes", nodes);
            return ResponseEntity.ok(resp);
        } catch (Exception e) {
            log.warn("HaGraphResource.getNodes: {}", e.getMessage());
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("nodes", List.of());
            return ResponseEntity.ok(resp);
        }
    }

    // ------------------------------------------------------------------
    // GET /api/ha-graph/edges
    // ------------------------------------------------------------------

    @GetMapping("/edges")
    @Operation(
        summary = "List constellation graph edges",
        description = "Returns edges representing co-occurrence relationships between adversary and target "
            + "entities derived from alert data and the relationship index. Supports time range and depth filtering. (CON-002)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Graph edges returned successfully"),
        @ApiResponse(responseCode = "400", description = "Invalid query parameters"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges")
    })
    public ResponseEntity<Map<String, Object>> getEdges(
            @RequestParam(name = "timeRange", defaultValue = "24h") String timeRange,
            @RequestParam(name = "depth",     defaultValue = "2")   int depth,
            @RequestParam(name = "edgeType",  required = false) List<String> edgeTypes) {
        log.debug("GET /api/ha-graph/edges timeRange={} depth={}", timeRange, depth);

        String since = sinceFromTimeRange(timeRange);

        try {
            List<HiveGraphEdgeDTO> edges = osClient.execute(os -> buildEdges(os, since, Math.min(depth, 2)));
            // Always merge with relationship index edges (Sprint 48 data uses ent-* ID format)
            List<HiveGraphEdgeDTO> relEdges = osClient.execute(os -> buildEdgesFromRelationshipIndex(os, since));
            if (!relEdges.isEmpty()) {
                // Merge: prefer relationship index edges, add alert-based edges that don't duplicate
                Set<String> relEdgeKeys = new java.util.HashSet<>();
                for (HiveGraphEdgeDTO e : relEdges) {
                    relEdgeKeys.add(e.getSource() + "||" + e.getTarget());
                }
                for (HiveGraphEdgeDTO e : edges) {
                    if (!relEdgeKeys.contains(e.getSource() + "||" + e.getTarget())) {
                        relEdges.add(e);
                    }
                }
                edges = relEdges;
            }
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("edges", edges);
            return ResponseEntity.ok(resp);
        } catch (Exception e) {
            log.warn("HaGraphResource.getEdges: {}", e.getMessage());
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("edges", List.of());
            return ResponseEntity.ok(resp);
        }
    }

    // ------------------------------------------------------------------
    // Node building — one node per distinct entity value from aggregations
    // ------------------------------------------------------------------

    @SuppressWarnings("rawtypes")
    private List<HiveGraphNodeDTO> buildNodes(
            OpenSearch os,
            String since,
            List<String> typeFilter,
            int limit) throws Exception {

        Query q = Query.of(qb -> qb.bool(BoolQuery.of(b -> b
            .must(Query.of(m -> m.range(RangeQuery.of(r -> r
                .field("@timestamp").gte(JsonData.of(since))))))
        )));

        // Aggregate all entity fields at once; filter by type in post-processing
        SearchRequest req = SearchRequest.of(r -> r
            .index(indexResolver.resolveAlertIndexPattern())
            .query(q)
            .size(0)
            .aggregations("adv_ip",    a -> a.terms(t -> t.field("adversary.ip.keyword").size(200)))
            .aggregations("adv_host",  a -> a.terms(t -> t.field("adversary.host.keyword").size(200)))
            .aggregations("adv_user",  a -> a.terms(t -> t.field("adversary.user.keyword").size(200)))
            .aggregations("tgt_ip",    a -> a.terms(t -> t.field("target.ip.keyword").size(200)))
            .aggregations("tgt_host",  a -> a.terms(t -> t.field("target.host.keyword").size(200)))
        );

        SearchResponse<Map> resp = os.search(req, Map.class);

        Map<String, HiveGraphNodeDTO> nodeMap = new LinkedHashMap<>();

        addNodes(resp, "adv_ip",   "ip",   nodeMap, typeFilter);
        addNodes(resp, "adv_host", "host", nodeMap, typeFilter);
        addNodes(resp, "adv_user", "user", nodeMap, typeFilter);
        addNodes(resp, "tgt_ip",   "ip",   nodeMap, typeFilter);
        addNodes(resp, "tgt_host", "host", nodeMap, typeFilter);

        return nodeMap.values().stream().limit(limit).toList();
    }

    @SuppressWarnings("rawtypes")
    private void addNodes(SearchResponse<Map> resp,
                          String aggName,
                          String entityType,
                          Map<String, HiveGraphNodeDTO> nodeMap,
                          List<String> typeFilter) {
        // Type filter: skip if caller restricted types and this type isn't in the list
        if (typeFilter != null && !typeFilter.isEmpty() && !typeFilter.contains(entityType)) return;

        var agg = resp.aggregations().get(aggName);
        if (agg == null || agg.sterms() == null) return;

        for (StringTermsBucket bucket : agg.sterms().buckets().array()) {
            String value = bucket.key();
            if (value == null || value.isBlank()) continue;
            String nodeId = entityType + ":" + value;
            if (!nodeMap.containsKey(nodeId)) {
                HiveGraphNodeDTO node = new HiveGraphNodeDTO();
                node.setId(nodeId);
                node.setEntityType(entityType);
                node.setEntityValue(value);
                node.setRiskScore(0);   // enriched later from PG by the frontend or a separate call
                node.setAlertCount((int) bucket.docCount());
                nodeMap.put(nodeId, node);
            } else {
                // Accumulate alert count across adversary / target sides
                HiveGraphNodeDTO existing = nodeMap.get(nodeId);
                existing.setAlertCount(existing.getAlertCount() + (int) bucket.docCount());
            }
        }
    }

    // ------------------------------------------------------------------
    // Edge building — one edge per co-occurring adversary/target pair
    // ------------------------------------------------------------------

    @SuppressWarnings("rawtypes")
    private List<HiveGraphEdgeDTO> buildEdges(
            OpenSearch os,
            String since,
            int depth) throws Exception {

        // Fetch the most recent alerts (up to 1000) and derive edges from co-occurrences
        Query q = Query.of(qb -> qb.bool(BoolQuery.of(b -> b
            .must(Query.of(m -> m.range(RangeQuery.of(r -> r
                .field("@timestamp").gte(JsonData.of(since))))))
        )));

        SearchRequest req = SearchRequest.of(r -> r
            .index(indexResolver.resolveAlertIndexPattern())
            .query(q)
            .size(1000)
            .sort(s -> s.field(f -> f.field("@timestamp").order(SortOrder.Desc)))
            .source(src -> src.filter(f -> f.includes(List.of(
                "adversary.ip", "adversary.host", "adversary.user",
                "target.ip", "target.host",
                "@timestamp"
            ))))
        );

        SearchResponse<Map> resp = os.search(req, Map.class);

        // Build edge map keyed by "sourceId||targetId" to de-duplicate
        Map<String, HiveGraphEdgeDTO> edgeMap = new LinkedHashMap<>();

        for (var hit : resp.hits().hits()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> src = hit.source() != null ? hit.source() : Collections.emptyMap();
            String ts = (String) src.getOrDefault("@timestamp", Instant.now().toString());

            @SuppressWarnings("unchecked")
            Map<String, Object> adversary = (Map<String, Object>) src.get("adversary");
            @SuppressWarnings("unchecked")
            Map<String, Object> target    = (Map<String, Object>) src.get("target");
            if (adversary == null || target == null) continue;

            // Derive source node (adversary) and target node (target)
            String advId  = resolveNodeId(adversary);
            String tgtId  = resolveNodeId(target);
            if (advId == null || tgtId == null || advId.equals(tgtId)) continue;

            String edgeKey = advId + "||" + tgtId;
            if (edgeMap.containsKey(edgeKey)) {
                HiveGraphEdgeDTO existing = edgeMap.get(edgeKey);
                existing.setWeight(existing.getWeight() + 1);
                // Update lastSeen to the most recent timestamp
                if (ts.compareTo(existing.getLastSeen()) > 0) existing.setLastSeen(ts);
            } else {
                HiveGraphEdgeDTO edge = new HiveGraphEdgeDTO();
                edge.setId(UUID.randomUUID().toString());
                edge.setSource(advId);
                edge.setTarget(tgtId);
                edge.setEdgeType(inferEdgeType(adversary, target));
                edge.setWeight(1);
                edge.setFirstSeen(ts);
                edge.setLastSeen(ts);
                edgeMap.put(edgeKey, edge);
            }
        }

        return new ArrayList<>(edgeMap.values());
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private static String resolveNodeId(Map<String, Object> side) {
        if (side.containsKey("ip")   && side.get("ip")   != null) return "ip:"   + side.get("ip");
        if (side.containsKey("host") && side.get("host") != null) return "host:" + side.get("host");
        if (side.containsKey("user") && side.get("user") != null) return "user:" + side.get("user");
        return null;
    }

    private static String inferEdgeType(Map<String, Object> adversary, Map<String, Object> target) {
        // Heuristic: user→host = LOGGED_IN_FROM; ip→host = CONNECTED_TO; else CONNECTED_TO
        boolean advIsUser  = adversary.containsKey("user")  && adversary.get("user")  != null;
        boolean tgtIsHost  = target.containsKey("host")     && target.get("host")     != null;
        if (advIsUser && tgtIsHost) return "LOGGED_IN_FROM";
        return "CONNECTED_TO";
    }

    private static String sinceFromTimeRange(String timeRange) {
        Instant now = Instant.now();
        return switch (timeRange) {
            case "1h"  -> now.minus(1,  ChronoUnit.HOURS).toString();
            case "4h"  -> now.minus(4,  ChronoUnit.HOURS).toString();
            case "7d"  -> now.minus(7,  ChronoUnit.DAYS).toString();
            case "30d" -> now.minus(30, ChronoUnit.DAYS).toString();
            default    -> now.minus(24, ChronoUnit.HOURS).toString();  // 24h
        };
    }

    // ------------------------------------------------------------------
    // Fallback: query v3-hive-entity-* directly (Sprint 48 graph data)
    // ------------------------------------------------------------------

    @SuppressWarnings("rawtypes")
    private List<HiveGraphNodeDTO> buildNodesFromEntityIndex(
            OpenSearch os,
            String since,
            List<String> typeFilter,
            int limit) throws Exception {

        String entityIndex = indexResolver.resolveIndexPattern("entity");

        BoolQuery.Builder boolBuilder = new BoolQuery.Builder();
        boolBuilder.must(Query.of(m -> m.range(RangeQuery.of(r -> r
            .field("lastSeen").gte(JsonData.of(since))))));

        if (typeFilter != null && !typeFilter.isEmpty()) {
            List<String> types = typeFilter;
            boolBuilder.must(Query.of(m -> m.terms(t -> t
                .field("type.keyword")
                .terms(tv -> tv.value(types.stream()
                    .map(org.opensearch.client.opensearch._types.FieldValue::of)
                    .toList())))));
        }

        SearchRequest req = SearchRequest.of(r -> r
            .index(entityIndex)
            .query(Query.of(q -> q.bool(boolBuilder.build())))
            .size(limit)
            .sort(s -> s.field(f -> f.field("riskScore").order(SortOrder.Desc)))
        );

        SearchResponse<Map> resp = os.search(req, Map.class);

        List<HiveGraphNodeDTO> nodes = new ArrayList<>();
        for (var hit : resp.hits().hits()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> src = hit.source() != null ? hit.source() : Collections.emptyMap();
            HiveGraphNodeDTO node = new HiveGraphNodeDTO();
            node.setId(hit.id());
            node.setEntityType(Objects.toString(src.getOrDefault("type", "unknown"), "unknown"));
            node.setEntityValue(Objects.toString(src.getOrDefault("value",
                src.getOrDefault("entityValue", hit.id())), hit.id()));
            Object risk = src.get("riskScore");
            node.setRiskScore(risk instanceof Number ? ((Number) risk).intValue() : 0);
            Object alerts = src.get("alertCount");
            node.setAlertCount(alerts instanceof Number ? ((Number) alerts).intValue() : 0);
            nodes.add(node);
        }
        return nodes;
    }

    @SuppressWarnings("rawtypes")
    private List<HiveGraphEdgeDTO> buildEdgesFromRelationshipIndex(
            OpenSearch os,
            String since) throws Exception {

        String relIndex = indexResolver.resolveIndexPattern("relationship");

        SearchRequest req = SearchRequest.of(r -> r
            .index(relIndex)
            .query(Query.of(q -> q.range(RangeQuery.of(rq -> rq
                .field("lastSeen").gte(JsonData.of(since))))))
            .size(400)
            .sort(s -> s.field(f -> f.field("strength").order(SortOrder.Desc)))
        );

        SearchResponse<Map> resp = os.search(req, Map.class);

        List<HiveGraphEdgeDTO> edges = new ArrayList<>();
        for (var hit : resp.hits().hits()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> src = hit.source() != null ? hit.source() : Collections.emptyMap();

            String source = Objects.toString(src.getOrDefault("sourceEntityId",
                src.getOrDefault("source", "")), "");
            String target = Objects.toString(src.getOrDefault("targetEntityId",
                src.getOrDefault("target", "")), "");
            if (source.isBlank() || target.isBlank()) continue;

            HiveGraphEdgeDTO edge = new HiveGraphEdgeDTO();
            edge.setId(hit.id());
            edge.setSource(source);
            edge.setTarget(target);
            String relType = Objects.toString(src.getOrDefault("relationshipType", "CONNECTED_TO"), "CONNECTED_TO");
            edge.setEdgeType(relType.toUpperCase());
            Object strength = src.get("strength");
            edge.setWeight(strength instanceof Number ? (int) (((Number) strength).doubleValue() * 10) : 1);
            edge.setFirstSeen(Objects.toString(src.getOrDefault("firstSeen", ""), ""));
            edge.setLastSeen(Objects.toString(src.getOrDefault("lastSeen", ""), ""));
            edges.add(edge);
        }
        return edges;
    }
}
