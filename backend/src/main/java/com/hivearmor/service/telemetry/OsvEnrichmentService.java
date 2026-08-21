package com.hivearmor.service.telemetry;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.hivearmor.config.HaAirGapConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/**
 * Matches SBOM components to OSV CVE ids. Skipped in air-gap. Does not invent EPSS or KEV.
 */
@Service
public class OsvEnrichmentService {

    private static final Logger log = LoggerFactory.getLogger(OsvEnrichmentService.class);
    private static final String CLASSNAME = "OsvEnrichmentService";
    private static final int MAX_QUERIES = 40;
    private static final int MAX_FINDINGS = 200;

    private final JdbcTemplate jdbc;
    private final OsvClient osvClient;
    private final HaAirGapConfig.AirGapGuard airGapGuard;
    private final ObjectMapper mapper = new ObjectMapper();

    public OsvEnrichmentService(JdbcTemplate jdbc, OsvClient osvClient,
                                HaAirGapConfig.AirGapGuard airGapGuard) {
        this.jdbc = jdbc;
        this.osvClient = osvClient;
        this.airGapGuard = airGapGuard;
    }

    public void enrich(String agentId, String hostname, Long tenantId, List<OsvFindingMapper.ComponentQuery> components) {
        final String ctx = CLASSNAME + ".enrich";
        if (airGapGuard.isAirGap()) {
            log.debug("{}: air-gap active — skipping OSV", ctx);
            return;
        }
        if (components == null || components.isEmpty()) {
            return;
        }
        int limit = Math.min(components.size(), MAX_QUERIES);
        List<OsvFindingMapper.ComponentQuery> slice = components.subList(0, limit);
        try {
            ObjectNode body = mapper.createObjectNode();
            ArrayNode queries = body.putArray("queries");
            for (OsvFindingMapper.ComponentQuery q : slice) {
                ObjectNode item = queries.addObject();
                ObjectNode pkg = item.putObject("package");
                if (q.purl != null && !q.purl.isBlank()) {
                    pkg.put("purl", q.purl);
                } else {
                    pkg.put("name", q.name);
                }
            }
            String raw = osvClient.queryBatch(body);
            List<OsvFindingMapper.FindingRow> rows = OsvFindingMapper.mapQueryBatch(slice, raw);
            persist(agentId, hostname, tenantId, rows);
        } catch (Exception e) {
            log.warn("{}: OSV enrichment failed: {}", ctx, e.getMessage());
        }
    }

    private void persist(String agentId, String hostname, Long tenantId, List<OsvFindingMapper.FindingRow> rows) {
        Timestamp now = Timestamp.from(Instant.now());
        int written = 0;
        for (OsvFindingMapper.FindingRow row : rows) {
            if (written >= MAX_FINDINGS) {
                break;
            }
            String pkg = row.packageName == null || row.packageName.isBlank() ? "unknown" : row.packageName;
            jdbc.update(
                    "INSERT INTO ha_vuln_finding "
                            + "(agent_id, agent_hostname, cve_id, purl, package_name, installed_version, "
                            + "fixed_version, cvss_v3, severity, is_kev, description, references_json, "
                            + "published_at, first_seen_at, last_seen_at, created_at, updated_at, tenant_id) "
                            + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) "
                            + "ON CONFLICT (agent_id, cve_id, purl) DO UPDATE SET "
                            + "last_seen_at=EXCLUDED.last_seen_at, updated_at=EXCLUDED.updated_at, "
                            + "cvss_v3=COALESCE(EXCLUDED.cvss_v3, ha_vuln_finding.cvss_v3), "
                            + "severity=COALESCE(EXCLUDED.severity, ha_vuln_finding.severity), "
                            + "description=EXCLUDED.description, tenant_id=EXCLUDED.tenant_id, "
                            + "agent_hostname=EXCLUDED.agent_hostname, installed_version=EXCLUDED.installed_version",
                    agentId, hostname, row.cveId, row.purl, pkg, row.installedVersion,
                    null, row.cvssV3, row.severity, false, row.description, null,
                    null, now, now, now, now, tenantId);
            written++;
        }
        if (written > 0) {
            log.info("{}: upserted {} CVE findings for agent {}", CLASSNAME, written, agentId);
        }
    }
}
