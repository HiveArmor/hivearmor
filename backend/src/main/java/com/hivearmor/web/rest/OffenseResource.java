package com.hivearmor.web.rest;

import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.domain.chart_builder.types.query.FilterType;
import com.hivearmor.domain.chart_builder.types.query.OperatorType;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.elasticsearch.ElasticsearchService;
import com.hivearmor.util.ResponseUtil;
import com.hivearmor.util.UtilPagination;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.opensearch.client.opensearch.core.search.HitsMetadata;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.constraints.NotBlank;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api")
public class OffenseResource {

    private static final String CLASSNAME = "OffenseResource";
    private static final String OFFENSE_INDEX = "_v3_hive_offense-*";
    private static final String ALERT_INDEX = "_v3_hive_alert-*";

    private final Logger log = LoggerFactory.getLogger(OffenseResource.class);
    private final ElasticsearchService elasticsearchService;
    private final ApplicationEventService applicationEventService;

    public OffenseResource(ElasticsearchService elasticsearchService,
                           ApplicationEventService applicationEventService) {
        this.elasticsearchService = elasticsearchService;
        this.applicationEventService = applicationEventService;
    }

    /**
     * GET /api/offenses
     * Query _v3_hive_offense-* with optional status filter, paged and sorted.
     */
    @GetMapping("/offenses")
    public ResponseEntity<List<Map>> getOffenses(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "25") Integer size,
            Pageable pageable) {
        final String ctx = CLASSNAME + ".getOffenses";
        try {
            List<FilterType> filters = new java.util.ArrayList<>();
            if (status != null && !status.isBlank()) {
                filters.add(new FilterType("status", OperatorType.IS, status));
            }

            SearchResponse<Map> searchResponse = elasticsearchService.search(
                    filters, size, OFFENSE_INDEX, pageable, Map.class);

            if (searchResponse == null || searchResponse.hits() == null
                    || searchResponse.hits().total().value() == 0) {
                return ResponseEntity.ok(Collections.emptyList());
            }

            HitsMetadata<Map> hits = searchResponse.hits();
            HttpHeaders headers = UtilPagination.generatePaginationHttpHeaders(
                    Math.min(hits.total().value(), size),
                    pageable.getPageNumber(), pageable.getPageSize(), "/api/offenses");

            List<Map> results = hits.hits().stream()
                    .map(h -> enrichWithId(h))
                    .collect(Collectors.toList());

            return ResponseEntity.ok().headers(headers).body(results);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    /**
     * GET /api/offenses/{id}
     * Fetch a single offense document by its OpenSearch _id.
     */
    @GetMapping("/offenses/{id}")
    public ResponseEntity<Map> getOffense(@PathVariable @NotBlank String id) {
        final String ctx = CLASSNAME + ".getOffense";
        try {
            List<FilterType> filters = List.of(new FilterType("_id", OperatorType.IS, id));

            SearchResponse<Map> searchResponse = elasticsearchService.search(
                    filters, 1, OFFENSE_INDEX,
                    org.springframework.data.domain.PageRequest.of(0, 1), Map.class);

            if (searchResponse == null || searchResponse.hits() == null
                    || searchResponse.hits().hits().isEmpty()) {
                return ResponseUtil.buildNotFoundResponse(ctx + ": Offense not found: " + id);
            }

            Hit<Map> hit = searchResponse.hits().hits().get(0);
            return ResponseEntity.ok(enrichWithId(hit));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    /**
     * PUT /api/offenses/{id}/status
     * Body: {"status": "closed"}  — update the status field via updateByQuery.
     */
    @PutMapping("/offenses/{id}/status")
    public ResponseEntity<Void> updateOffenseStatus(
            @PathVariable @NotBlank String id,
            @RequestBody Map<String, String> body) {
        final String ctx = CLASSNAME + ".updateOffenseStatus";
        try {
            String newStatus = body.get("status");
            if (newStatus == null || newStatus.isBlank()) {
                return ResponseEntity.badRequest().build();
            }

            Query query = Query.of(q -> q.ids(i -> i.values(id)));
            String script = "ctx._source.status = '" + newStatus.replace("'", "\\'") + "'";
            elasticsearchService.updateByQuery(query, OFFENSE_INDEX, script);

            return ResponseEntity.ok().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    /**
     * GET /api/offenses/{id}/alerts
     * Fetch alert documents for IDs listed in the offense's alerts[] array.
     */
    @GetMapping("/offenses/{id}/alerts")
    public ResponseEntity<List<Map>> getOffenseAlerts(@PathVariable @NotBlank String id) {
        final String ctx = CLASSNAME + ".getOffenseAlerts";
        try {
            // First, fetch the offense to get its alerts[] array
            List<FilterType> offenseFilter = List.of(new FilterType("_id", OperatorType.IS, id));
            SearchResponse<Map> offenseResp = elasticsearchService.search(
                    offenseFilter, 1, OFFENSE_INDEX,
                    org.springframework.data.domain.PageRequest.of(0, 1), Map.class);

            if (offenseResp == null || offenseResp.hits() == null
                    || offenseResp.hits().hits().isEmpty()) {
                return ResponseUtil.buildNotFoundResponse(ctx + ": Offense not found: " + id);
            }

            Map<String, Object> offense = offenseResp.hits().hits().get(0).source();
            Object alertsField = offense.get("alerts");
            if (!(alertsField instanceof List) || ((List<?>) alertsField).isEmpty()) {
                return ResponseEntity.ok(Collections.emptyList());
            }

            @SuppressWarnings("unchecked")
            List<String> alertIds = (List<String>) alertsField;

            // Fetch alert documents by their IDs
            List<FilterType> alertFilter = List.of(new FilterType("id", OperatorType.IS_ONE_OF, alertIds));
            SearchResponse<Map> alertResp = elasticsearchService.search(
                    alertFilter, alertIds.size(), ALERT_INDEX,
                    org.springframework.data.domain.PageRequest.of(0, alertIds.size()), Map.class);

            if (alertResp == null || alertResp.hits() == null
                    || alertResp.hits().hits().isEmpty()) {
                return ResponseEntity.ok(Collections.emptyList());
            }

            List<Map> alerts = alertResp.hits().hits().stream()
                    .map(Hit::source)
                    .collect(Collectors.toList());

            return ResponseEntity.ok(alerts);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    /** Copy source map and inject the OpenSearch _id as "id". */
    @SuppressWarnings("unchecked")
    private Map enrichWithId(Hit<Map> hit) {
        Map<String, Object> doc = new java.util.HashMap<>(hit.source() != null ? hit.source() : Collections.emptyMap());
        if (hit.id() != null) doc.put("id", hit.id());
        return doc;
    }
}
