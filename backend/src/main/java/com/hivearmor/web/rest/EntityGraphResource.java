package com.hivearmor.web.rest;

import com.hivearmor.opensearch.OpenSearch;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.aggregations.StringTermsBucket;
import org.opensearch.client.opensearch._types.query_dsl.BoolQuery;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch._types.query_dsl.RangeQuery;
import org.opensearch.client.opensearch._types.query_dsl.TermQuery;
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
 * REST controller for entity graph context queries.
 * Returns the neighborhood of a specific entity (IP, host, user) derived from alert data.
 */
@RestController
@RequestMapping("/api/ha-entities")
public class EntityGraphResource {

    private static final String CLASSNAME = "EntityGraphResource";
    private final Logger log = LoggerFactory.getLogger(EntityGraphResource.class);
    private static final String ALERT_INDEX = "v3-hive-alert-*";

    private final OpensearchClientBuilder client;

    public EntityGraphResource(OpensearchClientBuilder client) {
        this.client = client;
    }

    public record GraphNode(String id, String type, String label, Map<String, Object> properties) {}
    public record GraphEdge(String source, String target, String relation) {}
    public record EntityGraphDTO(List<GraphNode> nodes, List<GraphEdge> edges, long alertCount) {}

    /**
     * GET /api/ha-entities/{entityType}/{entityId}/graph
     *
     * Returns a graph of nodes and edges centered on the requested entity, built from
     * alert data in the last 30 days. depth=1 returns direct relationships only;
     * depth=2 (default) includes relationships of relationships.
     */
    @GetMapping("/{entityType}/{entityId}/graph")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_USER')")
    public ResponseEntity<EntityGraphDTO> getEntityGraph(
            @PathVariable("entityType") String entityType,
            @PathVariable("entityId") String entityId,
            @RequestParam(name = "depth", defaultValue = "2") int depth) {
        log.debug("GET /api/ha-entities/{}/{}/graph depth={}", entityType, entityId, depth);

        if (!isValidEntityType(entityType)) {
            return ResponseEntity.badRequest().build();
        }

        try {
            EntityGraphDTO graph = client.execute(os -> buildGraph(os, entityType, entityId, depth));
            return ResponseEntity.ok(graph);
        } catch (Exception e) {
            log.warn("{}.getEntityGraph: error for {}/{}: {}", CLASSNAME, entityType, entityId, e.getMessage());
            return ResponseEntity.ok(new EntityGraphDTO(List.of(), List.of(), 0));
        }
    }

    private EntityGraphDTO buildGraph(OpenSearch os, String entityType, String entityId, int depth) throws Exception {
        String field = entityField(entityType);
        String since = Instant.now().minus(30, ChronoUnit.DAYS).toString();

        Query query = Query.of(q -> q.bool(BoolQuery.of(b -> b
            .must(Query.of(m -> m.term(TermQuery.of(t -> t
                .field(field + ".keyword")
                .value(FieldValue.of(entityId))))))
            .must(Query.of(m -> m.range(RangeQuery.of(r -> r
                .field("@timestamp")
                .gte(JsonData.of(since))))))
        )));

        SearchRequest request = SearchRequest.of(r -> r
            .index(ALERT_INDEX)
            .query(query)
            .size(0)
            .aggregations("related_ips",   a -> a.terms(t -> t.field("adversary.ip.keyword").size(20)))
            .aggregations("related_users", a -> a.terms(t -> t.field("adversary.user.keyword").size(20)))
            .aggregations("related_hosts", a -> a.terms(t -> t.field("adversary.host.keyword").size(20)))
            .aggregations("target_ips",    a -> a.terms(t -> t.field("target.ip.keyword").size(20)))
            .aggregations("target_hosts",  a -> a.terms(t -> t.field("target.host.keyword").size(20)))
        );

        SearchResponse<Map> response = os.search(request, Map.class);
        long total = response.hits().total() != null ? response.hits().total().value() : 0;

        List<GraphNode> nodes = new ArrayList<>();
        List<GraphEdge> edges = new ArrayList<>();

        GraphNode root = new GraphNode(entityId, entityType, entityId, Map.of("count", total));
        nodes.add(root);

        addBucketNodes(response, "related_ips",   "ip",   entityId, nodes, edges, "adversary_ip_of");
        addBucketNodes(response, "related_users",  "user", entityId, nodes, edges, "adversary_user_of");
        addBucketNodes(response, "related_hosts",  "host", entityId, nodes, edges, "adversary_host_of");
        addBucketNodes(response, "target_ips",    "ip",   entityId, nodes, edges, "targeted_ip");
        addBucketNodes(response, "target_hosts",  "host", entityId, nodes, edges, "targeted_host");

        if (depth >= 2) {
            expandSecondHop(os, since, nodes, edges);
        }

        return new EntityGraphDTO(nodes, edges, total);
    }

    private void addBucketNodes(SearchResponse<Map> response, String aggName, String nodeType,
                                String rootId, List<GraphNode> nodes, List<GraphEdge> edges, String relation) {
        var agg = response.aggregations().get(aggName);
        if (agg == null || agg.sterms() == null) return;
        for (StringTermsBucket bucket : agg.sterms().buckets().array()) {
            String key = bucket.key();
            if (key == null || key.isBlank() || key.equals(rootId)) continue;
            String nodeId = nodeType + ":" + key;
            if (nodes.stream().noneMatch(n -> n.id().equals(nodeId))) {
                nodes.add(new GraphNode(nodeId, nodeType, key, Map.of("alertCount", bucket.docCount())));
            }
            edges.add(new GraphEdge(rootId, nodeId, relation));
        }
    }

    private void expandSecondHop(OpenSearch os, String since, List<GraphNode> nodes, List<GraphEdge> edges) {
        List<GraphNode> ipNodes = nodes.stream()
            .filter(n -> n.type().equals("ip") && !n.id().equals(n.label()))
            .limit(5)
            .toList();

        for (GraphNode ipNode : ipNodes) {
            String ip = ipNode.label();
            try {
                Query q = Query.of(qb -> qb.bool(BoolQuery.of(b -> b
                    .must(Query.of(m -> m.term(TermQuery.of(t -> t
                        .field("adversary.ip.keyword").value(FieldValue.of(ip))))))
                    .must(Query.of(m -> m.range(RangeQuery.of(r -> r
                        .field("@timestamp").gte(JsonData.of(since))))))
                )));

                SearchRequest req = SearchRequest.of(r -> r
                    .index(ALERT_INDEX).query(q).size(0)
                    .aggregations("users", a -> a.terms(t -> t.field("adversary.user.keyword").size(5)))
                    .aggregations("hosts", a -> a.terms(t -> t.field("adversary.host.keyword").size(5)))
                );

                SearchResponse<Map> resp = os.search(req, Map.class);
                addBucketNodes(resp, "users", "user", ipNode.id(), nodes, edges, "associated_user");
                addBucketNodes(resp, "hosts", "host", ipNode.id(), nodes, edges, "associated_host");
            } catch (Exception ignored) {
                // best-effort: partial graph is still useful
            }
        }
    }

    private static String entityField(String entityType) {
        return switch (entityType) {
            case "ip"      -> "adversary.ip";
            case "host"    -> "adversary.host";
            case "user"    -> "adversary.user";
            case "process" -> "adversary.process";
            default        -> "adversary.ip";
        };
    }

    private static boolean isValidEntityType(String t) {
        return t != null && Set.of("ip", "host", "user", "process").contains(t);
    }
}
