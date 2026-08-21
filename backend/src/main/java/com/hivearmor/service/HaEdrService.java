package com.hivearmor.service;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.dto.EdrEventDTO;
import com.hivearmor.service.dto.ProcessNodeDTO;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.query_dsl.BoolQuery;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch._types.query_dsl.RangeQuery;
import org.opensearch.client.opensearch._types.query_dsl.TermQuery;
import org.opensearch.client.json.JsonData;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Service for EDR investigation queries backed by OpenSearch.
 *
 * Provides process-tree data for the GET /api/ha-edr/process-tree endpoint.
 * Index pattern follows the platform convention: v3-hive-event-*
 *
 * Constructor injection only. No Lombok. No List.getFirst().
 */
@Service
public class HaEdrService {

    private static final Logger log = LoggerFactory.getLogger(HaEdrService.class);
    private static final String CLASSNAME = "HaEdrService";

    /** OpenSearch index pattern for raw EDR process events. */
    private static final int MAX_PROCESS_NODES = 500;

    private final OpensearchClientBuilder osClient;
    private final MsspIndexResolver indexResolver;

    public HaEdrService(OpensearchClientBuilder osClient, MsspIndexResolver indexResolver) {
        this.osClient = osClient;
        this.indexResolver = indexResolver;
    }

    /**
     * Fetches a flat list of process nodes from OpenSearch for the given agent
     * over a sliding time window centred on {@code timestamp}.
     *
     * <p>The time window is [{@code timestamp} − {@code windowMinutes} minutes,
     * {@code timestamp} + {@code windowMinutes} minutes]. Results are sorted by
     * process start time ascending so that callers can trivially build a tree.
     *
     * @param agentId       the agent identifier (maps to the {@code agent.id} field)
     * @param timestamp     ISO-8601 anchor timestamp for the window centre
     * @param windowMinutes half-width of the time window in minutes (default 30)
     * @return flat list of {@link ProcessNodeDTO} — never null, may be empty
     */
    public List<ProcessNodeDTO> fetchProcessNodes(String agentId, String timestamp, int windowMinutes) {
        final String ctx = CLASSNAME + ".fetchProcessNodes";
        try {
            Instant anchor = Instant.parse(timestamp);
            Instant from   = anchor.minus(windowMinutes, ChronoUnit.MINUTES);
            Instant to     = anchor.plus(windowMinutes, ChronoUnit.MINUTES);

            Query agentFilter = Query.of(q -> q.term(
                    TermQuery.of(t -> t.field("agent.id")
                            .value(FieldValue.of(v -> v.stringValue(agentId))))));

            Query timeFilter = Query.of(q -> q.range(
                    RangeQuery.of(r -> r
                            .field("@timestamp")
                            .gte(JsonData.of(from.toString()))
                            .lte(JsonData.of(to.toString())))));

            Query eventTypeFilter = Query.of(q -> q.term(
                    TermQuery.of(t -> t.field("event.category")
                            .value(FieldValue.of(v -> v.stringValue("process"))))));

            Query combined = Query.of(q -> q.bool(
                    BoolQuery.of(b -> b
                            .filter(agentFilter)
                            .filter(timeFilter)
                            .filter(eventTypeFilter))));

            SearchRequest request = SearchRequest.of(s -> s
                    .index(indexResolver.resolveIndexPattern("event"))
                    .query(combined)
                    .size(MAX_PROCESS_NODES)
                    .sort(sort -> sort.field(f -> f
                            .field("process.start")
                            .order(SortOrder.Asc))));

            SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

            List<ProcessNodeDTO> nodes = new ArrayList<>();
            for (Hit<Map> hit : response.hits().hits()) {
                Map<?, ?> source = hit.source();
                if (source == null) {
                    continue;
                }
                ProcessNodeDTO node = mapToProcessNodeDTO(source);
                nodes.add(node);
            }
            return nodes;
        } catch (Exception e) {
            log.error("{}: failed to fetch process nodes for agent={} — {}", ctx, agentId, e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * Returns a paginated list of EDR timeline events from OpenSearch for the
     * given agent and time range.
     *
     * <p>Queries index pattern {@code v3-hive-process-*}, {@code v3-hive-netconn-*},
     * and {@code v3-hive-fim-*} based on the {@code types} filter. Results are
     * sorted by {@code @timestamp} descending (most recent first).
     *
     * @param agentId the agent identifier (maps to {@code dataSource.keyword})
     * @param from    ISO-8601 start of the time range (inclusive)
     * @param to      ISO-8601 end of the time range (inclusive)
     * @param types   comma-separated event type filter, or null/blank for no filter
     * @param page    zero-based page index
     * @param size    page size
     * @return paginated list of {@link EdrEventDTO}
     */
    public Page<EdrEventDTO> fetchTimeline(String agentId, String from, String to,
                                           String types, int page, int size) {
        final String ctx = CLASSNAME + ".fetchTimeline";
        log.debug("{}: agentId={}, from={}, to={}, types={}, page={}, size={}",
                ctx, agentId, from, to, types, page, size);

        try {
            // Determine index patterns from requested types.
            String indexPattern = resolveIndexPattern(types);

            Query agentFilter = Query.of(q -> q.term(
                    TermQuery.of(t -> t.field("dataSource.keyword")
                            .value(FieldValue.of(v -> v.stringValue(agentId))))));

            Query timeFilter = Query.of(q -> q.range(
                    RangeQuery.of(r -> r.field("@timestamp")
                            .gte(JsonData.of(from))
                            .lte(JsonData.of(to)))));

            BoolQuery.Builder boolQ = new BoolQuery.Builder().must(agentFilter).must(timeFilter);

            // Add event type filter if specified.
            if (types != null && !types.isBlank()) {
                List<Query> typeFilters = new ArrayList<>();
                for (String t : types.split(",")) {
                    String trimmed = t.trim();
                    if (!trimmed.isEmpty()) {
                        typeFilters.add(Query.of(q -> q.term(
                                TermQuery.of(term -> term.field("action.keyword")
                                        .value(FieldValue.of(v -> v.stringValue(trimmed)))))));
                    }
                }
                if (!typeFilters.isEmpty()) {
                    boolQ.should(typeFilters).minimumShouldMatch("1");
                }
            }

            SearchRequest req = SearchRequest.of(s -> s
                    .index(indexPattern)
                    .from(page * size)
                    .size(size)
                    .sort(so -> so.field(f -> f.field("@timestamp").order(SortOrder.Desc)))
                    .query(Query.of(q -> q.bool(boolQ.build()))));

            SearchResponse<Map> resp = osClient.execute(os -> os.search(req, Map.class));

            long total = resp.hits().total() != null ? resp.hits().total().value() : 0L;
            List<EdrEventDTO> events = new ArrayList<>();
            for (Hit<Map> hit : resp.hits().hits()) {
                if (hit.source() != null) {
                    events.add(mapToEdrEventDTO(hit.id(), hit.source()));
                }
            }
            return new PageImpl<>(events, PageRequest.of(page, size), total);

        } catch (Exception e) {
            log.error("{}: OpenSearch query failed: {}", ctx, e.getMessage());
            return new PageImpl<>(Collections.emptyList(), PageRequest.of(page, size), 0L);
        }
    }

    /**
     * Resolves OpenSearch index patterns based on the requested event types.
     * When types is null/blank all endpoint index patterns are searched.
     */
    private String resolveIndexPattern(String types) {
        if (types == null || types.isBlank()) {
            return "v3-hive-process-*,v3-hive-netconn-*,v3-hive-fim-*,v3-hive-dns-*";
        }
        StringBuilder sb = new StringBuilder();
        if (types.contains("process") || types.contains("exec")) {
            sb.append("v3-hive-process-*,");
        }
        if (types.contains("network") || types.contains("netconn")) {
            sb.append("v3-hive-netconn-*,");
        }
        if (types.contains("file") || types.contains("fim")) {
            sb.append("v3-hive-fim-*,");
        }
        if (types.contains("dns")) {
            sb.append("v3-hive-dns-*,");
        }
        String result = sb.toString();
        if (result.isEmpty()) {
            return "v3-hive-process-*,v3-hive-netconn-*,v3-hive-fim-*,v3-hive-dns-*";
        }
        return result.endsWith(",") ? result.substring(0, result.length() - 1) : result;
    }

    /**
     * Maps an OpenSearch hit source map to an {@link EdrEventDTO}.
     */
    @SuppressWarnings("unchecked")
    private EdrEventDTO mapToEdrEventDTO(String id, Map<?, ?> source) {
        EdrEventDTO dto = new EdrEventDTO();
        dto.setId(id);
        dto.setEventType(toString(source.get("action")));
        dto.setTimestamp(toString(source.get("@timestamp")));

        // Process fields.
        dto.setProcessName(toString(getNestedValue(source, "origin.process")));
        Object pidVal = source.get("origin.pid");
        if (pidVal != null) {
            try {
                dto.setPid(Long.parseLong(pidVal.toString()));
            } catch (NumberFormatException ignored) {
                dto.setPid(0L);
            }
        }
        dto.setUser(toString(getNestedValue(source, "origin.user")));
        dto.setAgentId(toString(source.get("dataSource")));

        // Severity: 3=HIGH, 2=MEDIUM, 1=LOW, 0=INFO
        String sev = toString(source.get("severity"));
        switch (sev.toUpperCase()) {
            case "HIGH":
                dto.setSeverity(3);
                break;
            case "MEDIUM":
                dto.setSeverity(2);
                break;
            case "LOW":
                dto.setSeverity(1);
                break;
            default:
                dto.setSeverity(0);
                break;
        }

        // All remaining fields go into details map.
        dto.setDetails((Map<String, Object>) source);
        return dto;
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Maps an OpenSearch document source (ECS-formatted) to a {@link ProcessNodeDTO}.
     * All field access uses safe null checks — missing fields produce zero/empty defaults.
     */
    @SuppressWarnings("unchecked")
    private ProcessNodeDTO mapToProcessNodeDTO(Map<?, ?> source) {
        ProcessNodeDTO dto = new ProcessNodeDTO();

        Map<?, ?> process = getNestedMap(source, "process");
        if (process != null) {
            dto.setPid(toLong(process.get("pid")));
            dto.setPpid(toLong(getNestedValue(process, "parent", "pid")));
            dto.setName(toString(process.get("name")));
            dto.setCmdline(toString(process.get("args_count") != null
                    ? process.get("command_line")
                    : process.get("command_line")));
            dto.setStartTime(toString(process.get("start")));
            dto.setEndTime(toString(process.get("end")));

            Map<?, ?> user = getNestedMap(process, "user");
            if (user != null) {
                dto.setUser(toString(user.get("name")));
            }
        }

        // Determine suspicious flag from threat enrichment or rule match fields
        Map<?, ?> threat = getNestedMap(source, "threat");
        if (threat != null) {
            dto.setSuspicious(true);
        } else {
            Object ruleMatched = getNestedValue(source, "rule", "name");
            dto.setSuspicious(ruleMatched != null && !ruleMatched.toString().isEmpty());
        }

        return dto;
    }

    @SuppressWarnings("unchecked")
    private Map<?, ?> getNestedMap(Map<?, ?> source, String key) {
        Object value = source.get(key);
        if (value instanceof Map) {
            return (Map<?, ?>) value;
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private Object getNestedValue(Map<?, ?> source, String... keys) {
        Object current = source;
        for (String key : keys) {
            if (!(current instanceof Map)) {
                return null;
            }
            current = ((Map<?, ?>) current).get(key);
        }
        return current;
    }

    private long toLong(Object value) {
        if (value == null) {
            return 0L;
        }
        if (value instanceof Number) {
            return ((Number) value).longValue();
        }
        try {
            return Long.parseLong(value.toString());
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    private String toString(Object value) {
        return value != null ? value.toString() : "";
    }
}
