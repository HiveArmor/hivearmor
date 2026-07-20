package com.hivearmor.web.rest;

import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.util.UtilPagination;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.opensearch.client.json.JsonData;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Read-only admin endpoint for browsing application audit events indexed in OpenSearch.
 * Events are written by ApplicationEventService to the v11-backend-logs index.
 */
@RestController
@RequestMapping("/api")
public class UtmAuditEventResource {

    private static final Logger log = LoggerFactory.getLogger(UtmAuditEventResource.class);
    private static final String AUDIT_INDEX = "v11-backend-logs";

    private final OpensearchClientBuilder osClient;

    public UtmAuditEventResource(OpensearchClientBuilder osClient) {
        this.osClient = osClient;
    }

    @GetMapping("/ha-audit-events")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
    public ResponseEntity<List<Map>> getAuditEvents(
            @RequestParam(required = false) String eventType,
            @RequestParam(required = false) String actor,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "50") int size
    ) {
        try {
            List<Query> filters = new ArrayList<>();

            if (eventType != null && !eventType.isBlank()) {
                filters.add(Query.of(q -> q.term(t -> t
                        .field("type.keyword")
                        .value(FieldValue.of(f -> f.stringValue(eventType))))));
            }
            if (actor != null && !actor.isBlank()) {
                final String pattern = "*" + actor + "*";
                filters.add(Query.of(q -> q.wildcard(w -> w
                        .field("message.keyword")
                        .value(pattern))));
            }
            if (from != null || to != null) {
                final String f = from;
                final String t = to;
                filters.add(Query.of(q -> q.range(r -> {
                    var rb = r.field("@timestamp");
                    if (f != null && !f.isBlank()) rb = rb.gte(JsonData.of(f));
                    if (t != null && !t.isBlank()) rb = rb.lte(JsonData.of(t));
                    return rb;
                })));
            }

            Query query = filters.isEmpty()
                    ? Query.of(q -> q.matchAll(m -> m))
                    : Query.of(q -> q.bool(b -> b.filter(filters)));

            SearchRequest request = SearchRequest.of(r -> r
                    .index(AUDIT_INDEX)
                    .query(query)
                    .from(page * size)
                    .size(size)
                    .sort(s -> s.field(f -> f.field("@timestamp").order(SortOrder.Desc)))
            );

            SearchResponse<Map> response = osClient.getClient().search(request, Map.class);

            long total = response.hits().total() != null ? response.hits().total().value() : 0L;

            List<Map> hits = response.hits().hits().stream()
                    .map(Hit::source)
                    .collect(Collectors.toList());

            HttpHeaders headers = UtilPagination.generatePaginationHttpHeaders(
                    total, page, size, "/api/ha-audit-events");

            return ResponseEntity.ok().headers(headers).body(hits);
        } catch (Exception e) {
            log.error("UtmAuditEventResource.getAuditEvents: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        }
    }
}
