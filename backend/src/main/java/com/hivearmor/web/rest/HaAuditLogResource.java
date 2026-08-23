package com.hivearmor.web.rest;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
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
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * REST controller for the Audit Log admin page.
 *
 * GET /api/ha-audit-log?from=&to=&action=&user=&page=&size=
 * GET /api/ha-audit-log/export?from=&to=&action=&user=  — ADMIN-only NDJSON, safe fields only
 *
 * Each entry in the list response matches the frontend AuditLogEntryDTO shape:
 * { id, timestamp, actor, actionType, resourceType, resourceId, details, ipAddress, payload }
 *
 * Export omits {@code payload} (may contain secrets) and caps row count.
 *
 * Source of truth: OpenSearch index v11-backend-logs (same index used by UtmAuditEventResource).
 */
@RestController
@RequestMapping("/api")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class HaAuditLogResource {

    private static final Logger log = LoggerFactory.getLogger(HaAuditLogResource.class);
    private static final String AUDIT_INDEX = "v11-backend-logs";
    /** Hard cap so export cannot dump unbounded OpenSearch results. */
    static final int EXPORT_MAX_ROWS = 10_000;

    private static final ObjectMapper AUDIT_NDJSON = new ObjectMapper()
        .registerModule(new JavaTimeModule())
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

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
            SearchResponse<Map> response = searchAudit(from, to, action, user, page * size, size);
            long total = response.hits().total() != null ? response.hits().total().value() : 0L;

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
     * Safe NDJSON export of the list projection without {@code payload}.
     * Same ADMIN authority and filter params as {@link #getAuditLog}.
     */
    @GetMapping("/ha-audit-log/export")
    public ResponseEntity<byte[]> exportAuditLog(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String user,
            @AuthenticationPrincipal UserDetails caller
    ) {
        try {
            SearchResponse<Map> response = searchAudit(from, to, action, user, 0, EXPORT_MAX_ROWS);
            long total = response.hits().total() != null ? response.hits().total().value() : 0L;

            List<Map<String, Object>> rows = response.hits().hits().stream()
                .map(Hit::source)
                .filter(Objects::nonNull)
                .map(this::toExportEntry)
                .collect(Collectors.toList());

            StringBuilder body = new StringBuilder();
            for (Map<String, Object> row : rows) {
                body.append(AUDIT_NDJSON.writeValueAsString(row)).append('\n');
            }

            boolean truncated = total > rows.size();
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.parseMediaType("application/x-ndjson"));
            headers.set(HttpHeaders.CONTENT_DISPOSITION,
                "attachment; filename=\"ha-audit-log-" + Instant.now().getEpochSecond() + ".ndjson\"");
            headers.add("X-Total-Count", Long.toString(total));
            headers.add("X-Export-Row-Count", Integer.toString(rows.size()));
            headers.add("X-Export-Truncated", Boolean.toString(truncated));
            headers.add("X-Audit-Export-Fields", "id,timestamp,actor,actionType,resourceType,resourceId,details,ipAddress");
            if (caller != null) {
                headers.add("X-Export-Actor", caller.getUsername());
            }
            return ResponseEntity.ok().headers(headers).body(body.toString().getBytes(StandardCharsets.UTF_8));
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "could not serialize audit export");
        } catch (Exception e) {
            log.error("HaAuditLogResource.exportAuditLog: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        }
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private SearchResponse<Map> searchAudit(
            String from, String to, String action, String user, int fromOffset, int size
    ) throws Exception {
        Query query = buildQuery(from, to, action, user);
        SearchRequest request = SearchRequest.of(r -> r
            .index(AUDIT_INDEX)
            .query(query)
            .from(fromOffset)
            .size(size)
            .sort(s -> s.field(f -> f.field("@timestamp").order(SortOrder.Desc))));
        return osClient.getClient().search(request, Map.class);
    }

    private Query buildQuery(String from, String to, String action, String user) {
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

        return filters.isEmpty()
            ? Query.of(q -> q.matchAll(m -> m))
            : Query.of(q -> q.bool(b -> b.filter(filters)));
    }

    /**
     * Map a raw OpenSearch document to the AuditLogEntryDTO shape.
     * Fields: id, timestamp, actor, actionType, resourceType, resourceId, details, ipAddress, payload
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    Map<String, Object> toAuditEntry(Map rawDoc) {
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

    /**
     * Export projection: same as list minus {@code payload} (secrets / credentials).
     */
    @SuppressWarnings("rawtypes")
    Map<String, Object> toExportEntry(Map rawDoc) {
        Map<String, Object> entry = toAuditEntry(rawDoc);
        entry.remove("payload");
        return entry;
    }
}
