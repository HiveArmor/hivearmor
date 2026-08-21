package com.hivearmor.service.telemetry;

import com.fasterxml.jackson.databind.JsonNode;
import com.hivearmor.config.HaAirGapConfig;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Service that processes agent telemetry payloads: SBOM, SCA results, and vitals.
 *
 * <p>All persistence is via {@link JdbcTemplate} to keep dependencies minimal
 * and avoid JPA entity overhead on high-frequency write paths.
 *
 * <p>Constraints:
 * <ul>
 *   <li>Constructor injection only.
 *   <li>No Lombok.
 *   <li>No {@code List#getFirst()}.
 * </ul>
 */
@Service
public class HaTelemetryService {

    private static final Logger log = LoggerFactory.getLogger(HaTelemetryService.class);
    private static final String CLASSNAME = "HaTelemetryService";

    private final JdbcTemplate jdbc;
    private final OpensearchClientBuilder osClient;
    private final HaAirGapConfig.AirGapGuard airGapGuard;
    private final OsvEnrichmentService osvEnrichmentService;
    private final TransactionTemplate requiresNew;

    public HaTelemetryService(JdbcTemplate jdbc, OpensearchClientBuilder osClient,
                              HaAirGapConfig.AirGapGuard airGapGuard,
                              OsvEnrichmentService osvEnrichmentService,
                              PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.osClient = osClient;
        this.airGapGuard = airGapGuard;
        this.osvEnrichmentService = osvEnrichmentService;
        this.requiresNew = new TransactionTemplate(transactionManager);
        this.requiresNew.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    // -------------------------------------------------------------------------
    // SBOM processing
    // -------------------------------------------------------------------------

    /**
     * Parses a CycloneDX 1.5 JSON payload and upserts components into
     * {@code ha_sbom_component}. Triggers async CVE matching after upsert.
     */
    @Async
    public void processSbom(JsonNode payload, Long requestTenantId) {
        if (payload == null) return;
        final String ctx = CLASSNAME + ".processSbom";

        try {
            String agentId = safeText(payload, "metadata", "component", "serialNumber");
            if (agentId == null || agentId.isBlank()) {
                agentId = safeText(payload, "serialNumber");
            }
            if (agentId == null || agentId.isBlank()) {
                log.warn("{}: SBOM payload missing serialNumber (agentId)", ctx);
                return;
            }

            JsonNode components = payload.path("components");
            if (!components.isArray()) {
                log.debug("{}: no components array in SBOM", ctx);
                return;
            }

            String scanId = Long.toString(Instant.now().toEpochMilli());
            Timestamp now = Timestamp.from(Instant.now());
            final String finalAgentId = agentId;

            // Upsert each component.
            List<Object[]> rows = new ArrayList<>();
            for (JsonNode comp : components) {
                String purl    = textOrNull(comp, "purl");
                String name    = textOrEmpty(comp, "name");
                String version = textOrNull(comp, "version");
                String type    = textOrNull(comp, "type");
                String sha256  = null;

                JsonNode hashes = comp.path("hashes");
                if (hashes.isArray()) {
                    for (JsonNode h : hashes) {
                        if ("SHA-256".equals(textOrNull(h, "alg"))) {
                            sha256 = textOrNull(h, "content");
                            break;
                        }
                    }
                }
                rows.add(new Object[]{finalAgentId, scanId, purl, name, version, type, sha256, now, now, now});
            }

            // Batch upsert using PostgreSQL ON CONFLICT (requires uq_ha_sbom_agent_purl unique constraint
            // from migration 20260729002_sbom_unique_constraint.xml).
            String sql = "INSERT INTO ha_sbom_component "
                    + "(agent_id, scan_id, purl, name, version, component_type, sha256, scanned_at, created_at, updated_at) "
                    + "VALUES (?,?,?,?,?,?,?,?,?,?) "
                    + "ON CONFLICT (agent_id, purl) DO UPDATE SET "
                    + "scan_id=EXCLUDED.scan_id, version=EXCLUDED.version, "
                    + "sha256=EXCLUDED.sha256, scanned_at=EXCLUDED.scanned_at, updated_at=EXCLUDED.updated_at";

            requiresNew.executeWithoutResult(status -> jdbc.batchUpdate(sql, rows));
            log.info("{}: upserted {} SBOM components for agent {}", ctx, rows.size(), finalAgentId);

            if (airGapGuard.isAirGap()) {
                log.debug("{}: air-gap active — skipping CVE enrichment", ctx);
                return;
            }
            try {
                String hostname = safeText(payload, "metadata", "component", "name");
                Long tenantId = tenantFromSbom(payload, requestTenantId);
                List<OsvFindingMapper.ComponentQuery> queries = new ArrayList<>();
                for (JsonNode comp : components) {
                    queries.add(new OsvFindingMapper.ComponentQuery(
                            textOrEmpty(comp, "name"),
                            textOrNull(comp, "version"),
                            textOrNull(comp, "purl")));
                    if (queries.size() >= 40) {
                        break;
                    }
                }
                osvEnrichmentService.enrich(finalAgentId, hostname, tenantId, queries);
            } catch (Exception e) {
                log.warn("{}: CVE enrichment failed after SBOM commit: {}", ctx, e.getMessage());
            }

        } catch (Exception e) {
            log.error("{}: failed to process SBOM: {}", ctx, e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // SCA processing
    // -------------------------------------------------------------------------

    /**
     * Processes a batch of SCA check results from the agent and upserts them
     * into {@code ha_sca_result} and {@code ha_sca_summary}.
     */
    @Async
    public void processSca(JsonNode payload, Long tenantId) {
        if (payload == null) return;
        final String ctx = CLASSNAME + ".processSca";

        try {
            String agentId   = textOrEmpty(payload, "agentId");
            String hostname  = textOrEmpty(payload, "hostname");
            String packId    = textOrEmpty(payload, "packId");
            String packVersion = textOrEmpty(payload, "packVersion");
            if (packId.isBlank()) {
                packId = "unknown";
            }
            if (packVersion.isBlank()) {
                packVersion = "1";
            }
            final String packIdValue = packId;
            final String packVersionValue = packVersion;

            if (agentId.isBlank()) {
                log.warn("{}: SCA payload missing agentId", ctx);
                return;
            }

            JsonNode results = payload.path("results");
            if (!results.isArray()) {
                return;
            }

            Timestamp now = Timestamp.from(Instant.now());
            Long resolvedTenant = tenantId;
            if (resolvedTenant == null && payload.hasNonNull("tenantId")) {
                resolvedTenant = payload.get("tenantId").asLong();
            }
            if (resolvedTenant == null) {
                resolvedTenant = 0L;
            }
            final Long tenantForInsert = resolvedTenant;
            int[] counts = requiresNew.execute(status -> {
                int total = 0, pass = 0, fail = 0, na = 0, error = 0;
                for (JsonNode r : results) {
                    String checkId       = textOrEmpty(r, "checkId");
                    String checkTitle    = textOrEmpty(r, "title");
                    String level         = textOrNull(r, "level");
                    String statusValue   = textOrEmpty(r, "status").toUpperCase();
                    String observed      = textOrNull(r, "observedValue");
                    String expected      = textOrNull(r, "expectedValue");
                    String remediation   = textOrNull(r, "remediation");
                    String mitreJson     = r.path("mitre").toString();
                    String complianceTags = r.path("complianceTags").toString();

                    jdbc.update(
                            "INSERT INTO ha_sca_result "
                                    + "(agent_id, agent_hostname, check_id, check_title, pack_id, pack_version, level, status, "
                                    + "observed_value, expected_value, remediation, mitre_json, compliance_tags_json, "
                                    + "scanned_at, created_at, updated_at, tenant_id) "
                                    + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) "
                                    + "ON CONFLICT (tenant_id, agent_id, pack_id, pack_version, check_id) DO UPDATE SET "
                                    + "status=EXCLUDED.status, observed_value=EXCLUDED.observed_value, "
                                    + "scanned_at=EXCLUDED.scanned_at, updated_at=EXCLUDED.updated_at",
                            agentId, hostname, checkId, checkTitle, packIdValue, packVersionValue, level, statusValue,
                            observed, expected, remediation, mitreJson, complianceTags,
                            now, now, now, tenantForInsert);

                    total++;
                    switch (statusValue) {
                        case "PASS":
                            pass++;
                            break;
                        case "FAIL":
                            fail++;
                            break;
                        case "NOT_APPLICABLE":
                            na++;
                            break;
                        case "ERROR":
                            error++;
                            break;
                        default:
                            break;
                    }
                }

                int denominator = pass + fail + error;
                double score = denominator > 0 ? (double) pass / denominator * 100.0 : 0.0;
                jdbc.update(
                        "INSERT INTO ha_sca_summary "
                                + "(agent_id, agent_hostname, pack_id, pack_version, total, pass_count, fail_count, na_count, error_count, "
                                + "score_pct, scanned_at, created_at, updated_at, tenant_id) "
                                + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) "
                                + "ON CONFLICT (tenant_id, agent_id, pack_id, pack_version) DO UPDATE SET "
                                + "total=EXCLUDED.total, pass_count=EXCLUDED.pass_count, fail_count=EXCLUDED.fail_count, "
                                + "na_count=EXCLUDED.na_count, error_count=EXCLUDED.error_count, "
                                + "score_pct=EXCLUDED.score_pct, scanned_at=EXCLUDED.scanned_at, updated_at=EXCLUDED.updated_at",
                        agentId, hostname, packIdValue, packVersionValue, total, pass, fail, na, error, score, now, now, now, tenantForInsert);
                return new int[]{total, pass, fail, na, error};
            });

            int denominator = counts[1] + counts[2] + counts[4];
            double score = denominator > 0 ? (double) counts[1] / denominator * 100.0 : 0.0;
            log.info("{}: processed {} SCA checks for agent {} (score={})", ctx, counts[0], agentId, score);

        } catch (Exception e) {
            log.error("{}: failed to process SCA: {}", ctx, e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // Vitals processing
    // -------------------------------------------------------------------------

    /**
     * Persists a single agent vitals sample into {@code ha_agent_vitals}.
     */
    public void processVitals(String agentId, JsonNode payload) {
        if (agentId == null || payload == null) return;
        final String ctx = CLASSNAME + ".processVitals";
        try {
            double cpuPct       = doubleOrZero(payload, "cpuPct");
            long ramMb          = longOrZero(payload, "ramMb");
            int queueDepth      = intOrZero(payload, "queueDepth");
            double eps          = doubleOrZero(payload, "eventsPerSec");
            long droppedTotal   = longOrZero(payload, "droppedTotal");
            String lastError    = textOrNull(payload, "lastError");
            Timestamp sampledAt = Timestamp.from(Instant.now());

            jdbc.update(
                    "INSERT INTO ha_agent_vitals "
                            + "(agent_id, cpu_pct, ram_mb, queue_depth, events_per_sec, dropped_total, last_error, sampled_at) "
                            + "VALUES (?,?,?,?,?,?,?,?)",
                    agentId, cpuPct, ramMb, queueDepth, eps, droppedTotal, lastError, sampledAt);

        } catch (Exception e) {
            log.error("{}: failed to persist vitals for agent {}: {}", ctx, agentId, e.getMessage());
        }
    }

    /**
     * Returns the most recent vitals samples for a given agent (up to 144 rows,
     * newest first). Each row is returned as a raw map to avoid coupling to a DTO
     * that would require its own Liquibase mapping.
     */
    public java.util.List<java.util.Map<String, Object>> getRecentVitals(String agentId) {
        final String ctx = CLASSNAME + ".getRecentVitals";
        try {
            return jdbc.queryForList(
                    "SELECT cpu_pct, ram_mb, queue_depth, events_per_sec, dropped_total, last_error, sampled_at "
                            + "FROM ha_agent_vitals WHERE agent_id = ? "
                            + "ORDER BY sampled_at DESC LIMIT 144",
                    agentId);
        } catch (Exception e) {
            log.warn("{}: query failed for agent {}: {}", ctx, agentId, e.getMessage());
            return java.util.Collections.emptyList();
        }
    }

    private Long tenantFromSbom(JsonNode payload, Long requestTenantId) {
        if (payload.hasNonNull("tenantId")) {
            return payload.get("tenantId").asLong();
        }
        JsonNode props = payload.path("metadata").path("properties");
        if (props.isArray()) {
            for (JsonNode p : props) {
                if ("hivearmor:tenantId".equals(textOrNull(p, "name"))) {
                    String v = textOrNull(p, "value");
                    if (v != null && !v.isBlank()) {
                        try {
                            return Long.parseLong(v);
                        } catch (NumberFormatException ignored) {
                            return requestTenantId;
                        }
                    }
                }
            }
        }
        return requestTenantId;
    }

    private String textOrNull(JsonNode node, String... path) {
        JsonNode n = node;
        for (String p : path) {
            if (n == null) return null;
            n = n.path(p);
        }
        return (n != null && !n.isMissingNode() && !n.isNull()) ? n.asText(null) : null;
    }

    private String safeText(JsonNode node, String... path) {
        return textOrNull(node, path);
    }

    private String textOrEmpty(JsonNode node, String field) {
        String v = textOrNull(node, field);
        return v != null ? v : "";
    }

    private double doubleOrZero(JsonNode node, String field) {
        JsonNode n = node.path(field);
        return n.isNumber() ? n.asDouble(0.0) : 0.0;
    }

    private long longOrZero(JsonNode node, String field) {
        JsonNode n = node.path(field);
        return n.isNumber() ? n.asLong(0L) : 0L;
    }

    private int intOrZero(JsonNode node, String field) {
        JsonNode n = node.path(field);
        return n.isNumber() ? n.asInt(0) : 0;
    }
}
