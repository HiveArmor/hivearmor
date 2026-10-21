package com.hivearmor.service.telemetry;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.dto.cis.CisScanResultDTO;
import com.hivearmor.service.dto.cis.CisScanSummaryDTO;
import com.hivearmor.service.elasticsearch.ElasticsearchService;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Reads native CIS benchmark scan results from the net-new OpenSearch index
 * {@code v3-hive-cis-*} (PT-5, Option A). This is the per-host posture read surface —
 * cross-fleet trend/reporting is PT-6 and deliberately NOT built here.
 *
 * <p>Tenant scoping is enforced by {@link MsspIndexResolver#resolveIndexPattern(String)},
 * which fails closed for an MSSP request whose prefix did not resolve. The index name
 * is produced ONLY via the SDK index builder (SPEC-PT-5 constraint).
 *
 * <p>Honesty contract: a host with no ingested CIS scan returns a summary with
 * {@code scanned=false} (never a fabricated 100%). Constructor injection; no Lombok.
 */
@Service
public class HaCisScanService {

    private static final Logger log = LoggerFactory.getLogger(HaCisScanService.class);
    private static final String CLASSNAME = "HaCisScanService";
    private static final String CIS_TYPE = "cis";
    private static final int MAX_CONTROLS = 2000;
    private static final int MAX_AGENT_ID_LENGTH = 255;
    private static final Set<String> STATUSES =
            Set.of("PASS", "FAIL", "ERROR", "NOT_APPLICABLE", "NOT_CHECKED");

    private final ElasticsearchService elasticsearchService;
    private final MsspIndexResolver indexResolver;

    public HaCisScanService(ElasticsearchService elasticsearchService, MsspIndexResolver indexResolver) {
        this.elasticsearchService = elasticsearchService;
        this.indexResolver = indexResolver;
    }

    /**
     * Returns the control results of the latest CIS scan for a host. Empty list when
     * the host has never been scanned or the index does not exist yet (honest).
     */
    public List<CisScanResultDTO> findResultsByAgent(String agentId, String status) {
        String safeAgent = requireAgentId(agentId);
        String pattern = indexResolver.resolveIndexPattern(CIS_TYPE);
        if (!elasticsearchService.indexExist(pattern)) {
            return new ArrayList<>();
        }

        // Find the latest scanId for this host, then return that scan's control rows.
        String latestScanId = latestScanId(pattern, safeAgent);
        if (latestScanId == null) {
            return new ArrayList<>();
        }

        String normalizedStatus = normalizeStatus(status);
        try {
            SearchRequest request = SearchRequest.of(s -> {
                s.index(pattern)
                        .size(MAX_CONTROLS)
                        .query(controlQuery(safeAgent, latestScanId, normalizedStatus))
                        .sort(so -> so.field(f -> f.field("controlId.keyword").order(SortOrder.Asc)));
                return s;
            });
            SearchResponse<Map> response = elasticsearchService.search(request, Map.class);
            List<CisScanResultDTO> out = new ArrayList<>();
            for (Hit<Map> hit : response.hits().hits()) {
                CisScanResultDTO dto = toResult(hit.source());
                if (dto != null) {
                    out.add(dto);
                }
            }
            return out;
        } catch (Exception e) {
            log.error("{}.findResultsByAgent: {}", CLASSNAME, e.getMessage());
            throw new TelemetryQueryException(
                    "TELEMETRY_SOURCE_UNAVAILABLE",
                    "CIS scan results could not be loaded from the telemetry store");
        }
    }

    /**
     * Returns the latest CIS scan summary for a host, or an honest not-scanned summary
     * when no scan has been ingested.
     */
    public CisScanSummaryDTO summaryByAgent(String agentId) {
        String safeAgent = requireAgentId(agentId);
        String pattern = indexResolver.resolveIndexPattern(CIS_TYPE);
        if (!elasticsearchService.indexExist(pattern)) {
            return CisScanSummaryDTO.notScanned(safeAgent);
        }
        try {
            SearchRequest request = SearchRequest.of(s -> s
                    .index(pattern)
                    .size(1)
                    .query(summaryQuery(safeAgent))
                    .sort(so -> so.field(f -> f.field("scannedAt").order(SortOrder.Desc))));
            SearchResponse<Map> response = elasticsearchService.search(request, Map.class);
            if (response.hits().hits().isEmpty()) {
                return CisScanSummaryDTO.notScanned(safeAgent);
            }
            return toSummary(safeAgent, response.hits().hits().get(0).source());
        } catch (Exception e) {
            log.error("{}.summaryByAgent: {}", CLASSNAME, e.getMessage());
            throw new TelemetryQueryException(
                    "TELEMETRY_SOURCE_UNAVAILABLE",
                    "CIS scan summary could not be loaded from the telemetry store");
        }
    }

    private String latestScanId(String pattern, String agentId) {
        try {
            SearchRequest request = SearchRequest.of(s -> s
                    .index(pattern)
                    .size(1)
                    .query(summaryQuery(agentId))
                    .sort(so -> so.field(f -> f.field("scannedAt").order(SortOrder.Desc))));
            SearchResponse<Map> response = elasticsearchService.search(request, Map.class);
            if (response.hits().hits().isEmpty()) {
                return null;
            }
            Object scanId = response.hits().hits().get(0).source().get("scanId");
            return scanId != null ? scanId.toString() : null;
        } catch (Exception e) {
            log.error("{}.latestScanId: {}", CLASSNAME, e.getMessage());
            return null;
        }
    }

    // --- query builders -----------------------------------------------------

    private Query summaryQuery(String agentId) {
        return Query.of(q -> q.bool(b -> b
                .must(m -> m.term(t -> t.field("docType.keyword").value(v -> v.stringValue("summary"))))
                .must(m -> m.term(t -> t.field("agentId.keyword").value(v -> v.stringValue(agentId))))));
    }

    private Query controlQuery(String agentId, String scanId, String status) {
        return Query.of(q -> q.bool(b -> {
            b.must(m -> m.term(t -> t.field("docType.keyword").value(v -> v.stringValue("control"))));
            b.must(m -> m.term(t -> t.field("agentId.keyword").value(v -> v.stringValue(agentId))));
            b.must(m -> m.term(t -> t.field("scanId.keyword").value(v -> v.stringValue(scanId))));
            if (status != null) {
                b.must(m -> m.term(t -> t.field("status.keyword").value(v -> v.stringValue(status))));
            }
            return b;
        }));
    }

    // --- hit mapping --------------------------------------------------------

    private CisScanResultDTO toResult(Map<?, ?> src) {
        if (src == null) {
            return null;
        }
        CisScanResultDTO dto = new CisScanResultDTO();
        dto.setScanId(str(src, "scanId"));
        dto.setAgentId(str(src, "agentId"));
        dto.setHostname(str(src, "hostname"));
        dto.setProfile(str(src, "profile"));
        dto.setBenchmark(str(src, "benchmark"));
        dto.setContentHash(str(src, "contentHash"));
        dto.setMode(str(src, "mode"));
        dto.setControlId(str(src, "controlId"));
        dto.setTitle(str(src, "title"));
        dto.setSeverity(str(src, "severity"));
        dto.setStatus(str(src, "status"));
        dto.setIdref(str(src, "idref"));
        dto.setRemediation(str(src, "remediation"));
        dto.setScannedAt(str(src, "scannedAt"));
        return dto;
    }

    private CisScanSummaryDTO toSummary(String agentId, Map<?, ?> src) {
        if (src == null) {
            return CisScanSummaryDTO.notScanned(agentId);
        }
        CisScanSummaryDTO dto = new CisScanSummaryDTO();
        dto.setScanned(true);
        dto.setScanId(str(src, "scanId"));
        dto.setAgentId(str(src, "agentId"));
        dto.setHostname(str(src, "hostname"));
        dto.setProfile(str(src, "profile"));
        dto.setBenchmark(str(src, "benchmark"));
        dto.setContentHash(str(src, "contentHash"));
        dto.setMode(str(src, "mode"));
        dto.setTotal(intVal(src, "total"));
        dto.setPassCount(intVal(src, "passCount"));
        dto.setFailCount(intVal(src, "failCount"));
        dto.setErrorCount(intVal(src, "errorCount"));
        dto.setNaCount(intVal(src, "naCount"));
        dto.setNotCheckedCount(intVal(src, "notCheckedCount"));
        dto.setScorePct(doubleVal(src, "scorePct"));
        dto.setDurationMs((long) doubleVal(src, "durationMs"));
        dto.setScannedAt(str(src, "scannedAt"));
        return dto;
    }

    // --- helpers ------------------------------------------------------------

    private String requireAgentId(String agentId) {
        if (agentId == null || agentId.isBlank()) {
            throw new TelemetryQueryException("CIS_AGENT_INVALID", "agentId is required");
        }
        if (agentId.length() > MAX_AGENT_ID_LENGTH) {
            throw new TelemetryQueryException("CIS_AGENT_INVALID", "agentId exceeds maximum length");
        }
        return agentId;
    }

    private String normalizeStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        String normalized = status.toUpperCase(Locale.ROOT);
        if (!STATUSES.contains(normalized)) {
            throw new TelemetryQueryException(
                    "CIS_STATUS_INVALID",
                    "status must be one of PASS, FAIL, ERROR, NOT_APPLICABLE, NOT_CHECKED");
        }
        return normalized;
    }

    private String str(Map<?, ?> src, String key) {
        Object v = src.get(key);
        return v != null ? v.toString() : null;
    }

    private int intVal(Map<?, ?> src, String key) {
        Object v = src.get(key);
        if (v instanceof Number) {
            return ((Number) v).intValue();
        }
        return 0;
    }

    private double doubleVal(Map<?, ?> src, String key) {
        Object v = src.get(key);
        if (v instanceof Number) {
            return ((Number) v).doubleValue();
        }
        return 0.0;
    }
}
