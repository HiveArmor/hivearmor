package com.hivearmor.service.uba;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.config.Constants;
import com.hivearmor.domain.chart_builder.types.query.FilterType;
import com.hivearmor.domain.chart_builder.types.query.OperatorType;
import com.hivearmor.domain.shared_types.alert.Side;
import com.hivearmor.domain.shared_types.alert.UtmAlert;
import com.hivearmor.domain.uba.UtmUbaAnomaly;
import com.hivearmor.domain.uba.UtmUbaEntityRisk;
import com.hivearmor.repository.uba.UtmUbaAnomalyRepository;
import com.hivearmor.repository.uba.UtmUbaEntityRiskRepository;
import com.hivearmor.service.elasticsearch.ElasticsearchService;
import com.hivearmor.service.elasticsearch.SearchUtil;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.search.Hit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Sort;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
public class UbaSyncService {

    private static final Logger log = LoggerFactory.getLogger(UbaSyncService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    // P0A2-3 (T19 G5) — the alert index is resolved per-tenant via MsspIndexResolver
    // ("alert" -> v3-hive-alert-<prefix>-* in MSSP, v3-hive-alert-* single-tenant),
    // NOT a hardcoded all-tenant pattern.
    private static final String ALERT_INDEX_TYPE = "alert";

    private static final int RISK_PER_ANOMALY_CRITICAL = 40;
    private static final int RISK_PER_ANOMALY_HIGH     = 25;
    private static final int RISK_PER_ANOMALY_MEDIUM   = 15;
    private static final int RISK_PER_ANOMALY_LOW      = 5;
    private static final double DECAY_FACTOR           = 0.95;
    private static final int    DECAY_THRESHOLD        = 2;

    private final ElasticsearchService elasticsearchService;
    private final UtmUbaEntityRiskRepository entityRepo;
    private final UtmUbaAnomalyRepository anomalyRepo;
    private final com.hivearmor.multitenancy.TenantScopedBackgroundExecutor backgroundExecutor;
    private final com.hivearmor.multitenancy.MsspIndexResolver indexResolver;

    public UbaSyncService(ElasticsearchService elasticsearchService,
                          UtmUbaEntityRiskRepository entityRepo,
                          UtmUbaAnomalyRepository anomalyRepo,
                          com.hivearmor.multitenancy.TenantScopedBackgroundExecutor backgroundExecutor,
                          com.hivearmor.multitenancy.MsspIndexResolver indexResolver) {
        this.elasticsearchService = elasticsearchService;
        this.entityRepo = entityRepo;
        this.anomalyRepo = anomalyRepo;
        this.backgroundExecutor = backgroundExecutor;
        this.indexResolver = indexResolver;
    }

    /**
     * Syncs ANOMALY-category alerts from OpenSearch into the PostgreSQL UBA tables.
     * Queries the last 24 hours so we pick up any anomalies that arrived since the last run.
     */
    @Scheduled(fixedDelay = 60_000, initialDelay = 30_000)
    public void syncAnomalies() {
        // P0A2-3 (T19 G5) — run the UBA sync once PER TENANT under that tenant's scope,
        // so each pass reads only that tenant's alert index and writes tenant-attributed
        // UBA rows. No cross-tenant all-index read, no cross-tenant entity/anomaly comingling.
        backgroundExecutor.runForEachTenant("UbaSyncService.syncAnomalies",
                this::syncAnomaliesForCurrentTenant);
    }

    @Transactional
    public void syncAnomaliesForCurrentTenant() {
        long tenantId = com.hivearmor.multitenancy.TenantScope.requireTenant();
        try {
            List<FilterType> filters = new ArrayList<>();
            filters.add(new FilterType(Constants.alertCategoryKeyword, OperatorType.IS, "ANOMALY"));
            filters.add(new FilterType(Constants.timestamp, OperatorType.IS_BETWEEN,
                List.of(Instant.now().minus(48, ChronoUnit.HOURS).toString(), Instant.now().toString())));

            SearchRequest req = SearchRequest.of(s -> s
                .index(indexResolver.resolveIndexPattern(ALERT_INDEX_TYPE))
                .query(SearchUtil.toQuery(filters))
                .sort(sort -> sort.field(f -> f.field(Constants.timestamp)
                    .order(org.opensearch.client.opensearch._types.SortOrder.Desc)))
                .size(500));

            List<Hit<UtmAlert>> hits = elasticsearchService
                .search(req, UtmAlert.class).hits().hits();

            int newAnomalies = 0;
            int updatedEntities = 0;

            for (Hit<UtmAlert> hit : hits) {
                UtmAlert alert = hit.source();
                if (alert == null) continue;

                String entityId   = resolveEntityId(alert);
                String entityType = resolveEntityType(alert);
                if (entityId == null) continue;

                String sourceIp      = resolveSourceIp(alert);
                String anomalyType   = resolveAnomalyType(alert);
                String severity      = resolveSeverity(alert.getSeverity());
                Instant detectedAt   = alert.getTimestampAsInstant();
                if (detectedAt == null) detectedAt = Instant.now();

                // Deduplicate WITHIN this tenant: the OS alert id is stored inside details_json.
                String alertOsId = alert.getId() != null ? alert.getId() : hit.id();
                if (anomalyRepo.existsByTenantIdAndDetailsJsonContaining(tenantId, "\"alertId\":\"" + alertOsId + "\"")) continue;

                UtmUbaAnomaly anomaly = new UtmUbaAnomaly();
                anomaly.setTenantId(tenantId);
                anomaly.setEntityId(entityId);
                anomaly.setEntityType(entityType);
                anomaly.setAnomalyType(anomalyType);
                anomaly.setSeverity(severity);
                anomaly.setDescription(alert.getDescription() != null ? alert.getDescription() : alert.getName());
                anomaly.setRiskContribution(riskContribution(severity));
                anomaly.setDetectedAt(detectedAt);
                anomaly.setSourceIp(sourceIp);
                anomaly.setStatus("open");
                anomaly.setDetailsJson(MAPPER.writeValueAsString(Map.of(
                    "alertId", alertOsId,
                    "alertName", alert.getName() != null ? alert.getName() : "",
                    "dataSource", alert.getDataSource() != null ? alert.getDataSource() : ""
                )));
                anomaly.setCreatedAt(Instant.now());
                anomalyRepo.save(anomaly);
                newAnomalies++;

                upsertEntityRisk(tenantId, entityId, entityType, sourceIp, detectedAt, severity, anomaly.getDescription());
                updatedEntities++;
            }

            log.info("UBA sync (tenant {}): {} new anomalies, {} entities updated (scanned {} hits)",
                tenantId, newAnomalies, updatedEntities, hits.size());
        } catch (Exception e) {
            log.warn("UBA sync failed (tenant {}): {}", tenantId, e.getMessage());
        }
    }

    /**
     * Applies risk-score decay every 5 minutes. Entities whose score drops below
     * the threshold are considered negligible risk and removed.
     */
    @Scheduled(fixedDelay = 300_000)
    public void decayRiskScores() {
        // P0A2-3 — decay per tenant so each pass only touches its own tenant's rows.
        backgroundExecutor.runForEachTenant("UbaSyncService.decayRiskScores",
                this::decayRiskScoresForCurrentTenant);
    }

    @Transactional
    public void decayRiskScoresForCurrentTenant() {
        long tenantId = com.hivearmor.multitenancy.TenantScope.requireTenant();
        try {
            List<UtmUbaEntityRisk> entities = entityRepo.findByTenantId(tenantId);
            int removed = 0;
            for (UtmUbaEntityRisk entity : entities) {
                int newScore = (int) Math.floor(entity.getRiskScore() * DECAY_FACTOR);
                if (newScore < DECAY_THRESHOLD) {
                    entityRepo.delete(entity);
                    removed++;
                } else if (newScore != entity.getRiskScore()) {
                    entity.setPrevRiskScore(entity.getRiskScore());
                    entity.setRiskScore(newScore);
                    entity.setRiskLevel(riskLevel(newScore));
                    entity.setUpdatedAt(Instant.now());
                    entityRepo.save(entity);
                }
            }
            if (removed > 0) {
                log.debug("UBA decay: removed {} negligible-risk entities", removed);
            }
        } catch (Exception e) {
            log.warn("UBA decay failed: {}", e.getMessage());
        }
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private void upsertEntityRisk(long tenantId, String entityId, String entityType, String sourceIp,
                                   Instant detectedAt, String severity, String description) {
        UtmUbaEntityRisk entity = entityRepo
            .findByTenantIdAndEntityIdAndEntityType(tenantId, entityId, entityType)
            .orElseGet(() -> {
                UtmUbaEntityRisk e = new UtmUbaEntityRisk();
                e.setTenantId(tenantId);
                e.setEntityId(entityId);
                e.setEntityType(entityType);
                e.setDisplayName(entityId);
                e.setFirstSeen(detectedAt);
                e.setRiskScore(0);
                e.setPrevRiskScore(0);
                e.setRiskLevel("low");
                e.setAnomalyCount(0);
                e.setAlertCount(0);
                e.setWatchlisted(false);
                e.setStatus("active");
                e.setCreatedAt(Instant.now());
                return e;
            });

        int delta = riskContribution(severity);
        int prev  = entity.getRiskScore();
        int next  = Math.min(100, prev + delta);

        entity.setPrevRiskScore(prev);
        entity.setRiskScore(next);
        entity.setRiskLevel(riskLevel(next));
        entity.setAnomalyCount(entity.getAnomalyCount() + 1);
        entity.setLastSeen(detectedAt);
        entity.setUpdatedAt(Instant.now());

        // Append to factors_json
        try {
            List<String> factors = new ArrayList<>();
            if (entity.getFactorsJson() != null && !entity.getFactorsJson().isBlank()) {
                String[] existing = MAPPER.readValue(entity.getFactorsJson(), String[].class);
                factors.addAll(Arrays.asList(existing));
            }
            if (description != null && !description.isBlank() && !factors.contains(description)) {
                if (factors.size() >= 10) factors.remove(0);
                factors.add(description);
            }
            entity.setFactorsJson(MAPPER.writeValueAsString(factors));
        } catch (Exception ignored) {}

        entityRepo.save(entity);
    }

    private String resolveEntityId(UtmAlert alert) {
        Side adversary = alert.getAdversary();
        if (adversary != null) {
            if (adversary.getUser() != null && !adversary.getUser().isBlank()) return adversary.getUser();
            if (adversary.getHost() != null && !adversary.getHost().isBlank()) return adversary.getHost();
            if (adversary.getIp()   != null && !adversary.getIp().isBlank())   return adversary.getIp();
        }
        Side target = alert.getTarget();
        if (target != null) {
            if (target.getUser() != null && !target.getUser().isBlank()) return target.getUser();
            if (target.getHost() != null && !target.getHost().isBlank()) return target.getHost();
            if (target.getIp()   != null && !target.getIp().isBlank())   return target.getIp();
        }
        return alert.getDataSource();
    }

    private String resolveEntityType(UtmAlert alert) {
        Side adversary = alert.getAdversary();
        if (adversary != null) {
            if (adversary.getUser() != null && !adversary.getUser().isBlank()) return "user";
            if (adversary.getHost() != null && !adversary.getHost().isBlank()) return "host";
        }
        Side target = alert.getTarget();
        if (target != null) {
            if (target.getUser() != null && !target.getUser().isBlank()) return "user";
            if (target.getHost() != null && !target.getHost().isBlank()) return "host";
        }
        return "host";
    }

    private String resolveSourceIp(UtmAlert alert) {
        Side adversary = alert.getAdversary();
        if (adversary != null && adversary.getIp() != null) return adversary.getIp();
        Side target = alert.getTarget();
        if (target != null && target.getIp() != null) return target.getIp();
        return null;
    }

    private String resolveAnomalyType(UtmAlert alert) {
        String name = alert.getName();
        if (name == null) return "behavioral_anomaly";
        String lower = name.toLowerCase();
        if (lower.contains("travel"))    return "impossible_travel";
        if (lower.contains("download"))  return "mass_download";
        if (lower.contains("country"))   return "new_country_login";
        if (lower.contains("off_hour") || lower.contains("after_hour")) return "after_hours_admin";
        if (lower.contains("privilege") || lower.contains("escalat"))   return "privilege_escalation";
        if (lower.contains("beacon") || lower.contains("c2"))           return "c2_beacon";
        if (lower.contains("lateral"))   return "lateral_movement";
        if (lower.contains("fail"))      return "failed_auth_spike";
        return "behavioral_anomaly";
    }

    private String resolveSeverity(Integer severity) {
        if (severity == null) return "medium";
        if (severity >= 9)  return "critical";
        if (severity >= 7)  return "high";
        if (severity >= 4)  return "medium";
        return "low";
    }

    private int riskContribution(String severity) {
        return switch (severity) {
            case "critical" -> RISK_PER_ANOMALY_CRITICAL;
            case "high"     -> RISK_PER_ANOMALY_HIGH;
            case "medium"   -> RISK_PER_ANOMALY_MEDIUM;
            default         -> RISK_PER_ANOMALY_LOW;
        };
    }

    private String riskLevel(int score) {
        if (score >= 80) return "critical";
        if (score >= 60) return "high";
        if (score >= 30) return "medium";
        return "low";
    }

}
