package com.hivearmor.service.compliance;

import com.hivearmor.service.dto.compliance.ComplianceEvidenceDTO;
import com.hivearmor.service.elasticsearch.ElasticsearchService;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.json.JsonData;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

@Service
public class ComplianceEvidenceService {

    private static final String EVIDENCE_INDEX = "v3-hive-compliance-evidence-*";
    private static final int MAX_SUMMARY_CHARS = 200;

    private final ElasticsearchService elasticsearchService;

    public ComplianceEvidenceService(ElasticsearchService elasticsearchService) {
        this.elasticsearchService = elasticsearchService;
    }

    public Page<ComplianceEvidenceDTO> getEvidenceForControl(
            Long controlId, String mappingType, int days, Pageable pageable) {

        Instant since = Instant.now().minus(days, ChronoUnit.DAYS);

        final String mt = mappingType;
        final String sinceStr = since.toString();
        SearchRequest request = SearchRequest.of(s -> s
                .index(EVIDENCE_INDEX)
                .query(q -> q.bool(b -> {
                    b.must(m -> m.term(t -> t.field("controlId").value(FieldValue.of(controlId))));
                    b.filter(f -> f.range(r -> r.field("@timestamp").gte(JsonData.of(sinceStr))));
                    if (mt != null && !mt.isBlank()) {
                        b.filter(f -> f.term(t -> t.field("mappingType.keyword").value(FieldValue.of(mt))));
                    }
                    return b;
                }))
                .sort(sort -> sort.field(f -> f.field("@timestamp").order(SortOrder.Desc)))
                .from((int) pageable.getOffset())
                .size(pageable.getPageSize())
                .trackTotalHits(th -> th.enabled(true))
        );

        try {
            SearchResponse<Map> response = elasticsearchService.search(request, Map.class);
            long total = response.hits().total() != null ? response.hits().total().value() : 0;

            List<ComplianceEvidenceDTO> items = response.hits().hits().stream()
                    .map(hit -> toDto(hit.id(), hit.index(), hit.source()))
                    .toList();

            return new PageImpl<>(items, pageable, total);

        } catch (Exception e) {
            if (isIndexNotFound(e)) {
                return Page.empty(pageable);
            }
            throw new RuntimeException("Error fetching evidence for control " + controlId, e);
        }
    }

    public List<ComplianceEvidenceDTO> getAllEvidenceForControl(Long controlId, int days) {
        Instant since = Instant.now().minus(days, ChronoUnit.DAYS);

        final String sinceStr2 = since.toString();
        SearchRequest request = SearchRequest.of(s -> s
                .index(EVIDENCE_INDEX)
                .query(q -> q.bool(b -> {
                    b.must(m -> m.term(t -> t.field("controlId").value(FieldValue.of(controlId))));
                    b.filter(f -> f.range(r -> r.field("@timestamp").gte(JsonData.of(sinceStr2))));
                    return b;
                }))
                .sort(sort -> sort.field(f -> f.field("@timestamp").order(SortOrder.Desc)))
                .size(10_000)
        );

        try {
            SearchResponse<Map> response = elasticsearchService.search(request, Map.class);
            return response.hits().hits().stream()
                    .map(hit -> toDto(hit.id(), hit.index(), hit.source()))
                    .toList();
        } catch (Exception e) {
            if (isIndexNotFound(e)) {
                return List.of();
            }
            throw new RuntimeException("Error fetching evidence for control " + controlId, e);
        }
    }

    private ComplianceEvidenceDTO toDto(String hitId, String indexName, Map<String, Object> src) {
        if (src == null) src = Map.of();

        ComplianceEvidenceDTO dto = new ComplianceEvidenceDTO();
        dto.setEvidenceId(hitId);
        dto.setControlId(getLong(src.get("controlId")));
        dto.setMappingType(getString(src.get("mappingType")));

        Object ts = src.get("@timestamp");
        if (ts != null) {
            try { dto.setTimestamp(Instant.parse(ts.toString())); } catch (Exception ignored) {}
        }

        Object w = src.get("weight");
        if (w instanceof Number n) dto.setWeight(BigDecimal.valueOf(n.doubleValue()));

        String eventId = getString(src.get("eventId"));
        dto.setEventId(eventId);
        dto.setEventSource(getString(src.get("dataType")));

        // Build event summary: prefer rawEvent, fall back to a concatenation of available fields
        String raw = getString(src.get("rawEvent"));
        if (raw != null && raw.length() > MAX_SUMMARY_CHARS) raw = raw.substring(0, MAX_SUMMARY_CHARS);
        dto.setEventSummary(raw);

        // Index path for "View in Logs" deep-link
        dto.setEventIndexPath(indexName);

        return dto;
    }

    private static String getString(Object o) {
        return o != null ? o.toString() : null;
    }

    private static Long getLong(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.longValue();
        try { return Long.parseLong(o.toString()); } catch (NumberFormatException e) { return null; }
    }

    private boolean isIndexNotFound(Exception e) {
        String msg = e.getMessage();
        return msg != null && (msg.contains("index_not_found") || msg.contains("no such index"));
    }
}
