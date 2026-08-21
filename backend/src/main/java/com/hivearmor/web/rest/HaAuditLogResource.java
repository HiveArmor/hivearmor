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

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * REST controller for the Audit Log admin page.
 *
 * GET /api/ha-audit-log?from=&to=&action=&user=&page=&size=
 *
 * Each entry in the response array matches the frontend AuditLogEntryDTO shape:
 * { id, timestamp, actor, actionType, resourceType, resourceId, details, ipAddress, payload }
 *
 * Source of truth: OpenSearch index v11-backend-logs (same index used by UtmAuditEventResource).
 */
@RestController
@RequestMapping("/api")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class HaAuditLogResource {

    private static final Logger log = LoggerFactory.getLogger(HaAuditLogResource.class);
    private static final String AUDIT_INDEX = "v11-backend-logs";

    private final OpensearchClientBuilder osClient;

    public HaAuditLogResource(OpensearchClientBuilder osClient) {
        this.osClient = osClient;
    }

    @GetMapping("/ha-audit-log")
    public ResponseEntity<List<Map<String, Object>>> getAuditLog(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String user,
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "50") int size
    ) {
        try {
            List<Query> filters = new ArrayList<>();

            if (action != null && !action.isBlank()) {
                filters.add(Query.of(q -> q.term(t -> t
                    .field("type.keyword")
                    .value(FieldValue.of(f -> f.stringValue(action))))));
            }

            if (user != null && !user.isBlank()) {
                final String pattern = "*" + user + "*";
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
                .sort(s -> s.field(f -> f.field("@timestamp").order(SortOrder.Desc))));

            @SuppressWarnings("rawtypes")
            SearchResponse<Map> response = osClient.getClient().search(request, Map.class);

            long total = response.hits().total() != null ? response.hits().total().value() : 0L;

            // Map raw OS docs to the AuditLogEntryDTO shape the frontend expects
            List<Map<String, Object>> hits = response.hits().hits().stream()
                .map(Hit::source)
                .filter(Objects::nonNull)
                .map(this::toAuditEntry)
                .collect(Collectors.toList());

            HttpHeaders headers = UtilPagination.generatePaginationHttpHeaders(
                total, page, size, "/api/ha-audit-log");

            return ResponseEntity.ok().headers(headers).body(hits);
        } catch (Exception e) {
            log.error("HaAuditLogResource.getAuditLog: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Map a raw OpenSearch document to the AuditLogEntryDTO shape.
     * Fields: id, timestamp, actor, actionType, resourceType, resourceId, details, ipAddress, payload
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private Map<String, Object> toAuditEntry(Map rawDoc) {
        Map<String, Object> entry = new LinkedHashMap<>();
        Object rawId = rawDoc.get("id");
        entry.put("id", rawId != null ? rawId : UUID.randomUUID().toString());
        entry.put("timestamp", rawDoc.getOrDefault("@timestamp", Instant.now().toString()));
        entry.put("actor",        rawDoc.getOrDefault("user", rawDoc.getOrDefault("actor", "system")));
        entry.put("actionType",   rawDoc.getOrDefault("type", rawDoc.getOrDefault("actionType", "UNKNOWN")));
        entry.put("resourceType", rawDoc.get("resourceType"));
        entry.put("resourceId",   rawDoc.get("resourceId"));
        entry.put("details",      rawDoc.getOrDefault("message", ""));
        entry.put("ipAddress",    rawDoc.get("ipAddress"));
        entry.put("payload",      rawDoc.get("payload"));
        return entry;
    }
}
