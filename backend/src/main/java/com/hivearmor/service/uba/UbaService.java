package com.hivearmor.service.uba;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.uba.UtmUbaAnomaly;
import com.hivearmor.domain.uba.UtmUbaEntityRisk;
import com.hivearmor.repository.uba.UtmUbaAnomalyRepository;
import com.hivearmor.repository.uba.UtmUbaEntityRiskRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
@Transactional(readOnly = true)
public class UbaService {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final UtmUbaEntityRiskRepository entityRepo;
    private final UtmUbaAnomalyRepository anomalyRepo;

    public UbaService(UtmUbaEntityRiskRepository entityRepo, UtmUbaAnomalyRepository anomalyRepo) {
        this.entityRepo = entityRepo;
        this.anomalyRepo = anomalyRepo;
    }

    /** Summary stats for the KPI row */
    public Map<String, Object> getSummary() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("critical", entityRepo.countByRiskLevel("critical"));
        out.put("high",     entityRepo.countByRiskLevel("high"));
        out.put("medium",   entityRepo.countByRiskLevel("medium"));
        out.put("low",      entityRepo.countByRiskLevel("low"));
        out.put("watchlisted", entityRepo.findByWatchlistedTrueOrderByRiskScoreDesc().size());
        out.put("openAnomalies",  anomalyRepo.countByStatus("open"));
        out.put("anomaliesLast24h", anomalyRepo.countByDetectedAtAfter(
            Instant.now().minus(24, ChronoUnit.HOURS)));
        Double avg = entityRepo.avgRiskScore();
        out.put("avgRiskScore", avg != null ? Math.round(avg) : 0);
        return out;
    }

    /** Paginated entity risk leaderboard */
    public Map<String, Object> listEntities(String entityType, String riskLevel, int page, int size) {
        var pageable = PageRequest.of(page, size);
        var result = (entityType != null && !entityType.isBlank())
            ? entityRepo.findByEntityTypeOrderByRiskScoreDesc(entityType, pageable)
            : (riskLevel != null && !riskLevel.isBlank())
                ? entityRepo.findByRiskLevelOrderByRiskScoreDesc(riskLevel, pageable)
                : entityRepo.findAllByOrderByRiskScoreDesc(pageable);

        List<Map<String, Object>> items = result.getContent().stream()
            .map(this::entityToMap)
            .toList();

        return Map.of(
            "content", items,
            "totalElements", result.getTotalElements(),
            "totalPages", result.getTotalPages(),
            "page", page
        );
    }

    /** Recent anomalies feed */
    public List<Map<String, Object>> listAnomalies(int page, int size) {
        return anomalyRepo.findAllByOrderByDetectedAtDesc(PageRequest.of(page, size))
            .getContent().stream()
            .map(this::anomalyToMap)
            .toList();
    }

    /** Anomalies for a single entity */
    public List<Map<String, Object>> getEntityAnomalies(String entityId, String entityType) {
        return anomalyRepo.findByEntityIdAndEntityTypeOrderByDetectedAtDesc(entityId, entityType)
            .stream().map(this::anomalyToMap).toList();
    }

    /** Toggle watchlist flag */
    @Transactional
    public Map<String, Object> setWatchlist(Long id, boolean watchlisted) {
        UtmUbaEntityRisk entity = entityRepo.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Entity not found: " + id));
        entity.setWatchlisted(watchlisted);
        entity.setUpdatedAt(Instant.now());
        return entityToMap(entityRepo.save(entity));
    }

    /** Update anomaly status (investigating / resolved / false_positive) */
    @Transactional
    public Map<String, Object> updateAnomalyStatus(Long id, String status) {
        UtmUbaAnomaly anomaly = anomalyRepo.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Anomaly not found: " + id));
        anomaly.setStatus(status);
        return anomalyToMap(anomalyRepo.save(anomaly));
    }

    // ── mappers ───────────────────────────────────────────────────────────────

    private Map<String, Object> entityToMap(UtmUbaEntityRisk e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id",          e.getId());
        m.put("entityId",    e.getEntityId());
        m.put("entityType",  e.getEntityType());
        m.put("displayName", e.getDisplayName());
        m.put("department",  e.getDepartment());
        m.put("role",        e.getRole());
        m.put("riskScore",   e.getRiskScore());
        m.put("prevRiskScore", e.getPrevRiskScore());
        m.put("riskLevel",   e.getRiskLevel());
        m.put("anomalyCount",e.getAnomalyCount());
        m.put("alertCount",  e.getAlertCount());
        m.put("lastSeen",    e.getLastSeen());
        m.put("watchlisted", e.getWatchlisted());
        m.put("status",      e.getStatus());
        m.put("factors",     parseJsonList(e.getFactorsJson()));
        m.put("riskTrend",   parseJsonList(e.getRiskTrendJson()));
        return m;
    }

    private Map<String, Object> anomalyToMap(UtmUbaAnomaly a) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id",               a.getId());
        m.put("entityId",         a.getEntityId());
        m.put("entityType",       a.getEntityType());
        m.put("anomalyType",      a.getAnomalyType());
        m.put("severity",         a.getSeverity());
        m.put("description",      a.getDescription());
        m.put("riskContribution", a.getRiskContribution());
        m.put("detectedAt",       a.getDetectedAt());
        m.put("sourceIp",         a.getSourceIp());
        m.put("sourceCountry",    a.getSourceCountry());
        m.put("status",           a.getStatus());
        m.put("details",          parseJsonMap(a.getDetailsJson()));
        return m;
    }

    private List<Object> parseJsonList(String json) {
        if (json == null || json.isBlank()) return Collections.emptyList();
        try {
            return MAPPER.readValue(json, new TypeReference<List<Object>>() {});
        } catch (Exception e) { return Collections.emptyList(); }
    }

    private Map<String, Object> parseJsonMap(String json) {
        if (json == null || json.isBlank()) return Collections.emptyMap();
        try {
            return MAPPER.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) { return Collections.emptyMap(); }
    }
}
