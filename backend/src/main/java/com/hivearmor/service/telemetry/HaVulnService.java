package com.hivearmor.service.telemetry;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.service.dto.vuln.VulnFindingDTO;
import com.hivearmor.service.dto.vuln.VulnRemediationDTO;
import com.hivearmor.service.dto.vuln.VulnSummaryDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Queries vulnerability findings from {@code ha_vuln_finding}.
 *
 * <p>Constructor injection only; no Lombok; no {@code List#getFirst()}.
 */
@Service
public class HaVulnService {

    private static final Logger log = LoggerFactory.getLogger(HaVulnService.class);
    private static final String CLASSNAME = "HaVulnService";
    private static final Set<String> SEVERITIES = Set.of("CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO");
    private static final int MAX_CVE_LENGTH = 64;
    private static final int MAX_AGENT_ID_LENGTH = 255;

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public HaVulnService(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public TelemetrySlice<VulnFindingDTO> findAll(String agentId, String severity, Boolean isKev,
                                                  String cve, String from, String to,
                                                  int page, int size, String cursor) {
        TelemetryQueryLimits.requireSize(size);
        if (cursor == null || cursor.isBlank()) {
            TelemetryQueryLimits.requirePage(page);
        }
        FilterSpec filter = buildFilter(agentId, severity, isKev, cve, from, to, cursor);

        long total;
        try {
            Long cnt = jdbc.queryForObject(
                "SELECT COUNT(*) FROM ha_vuln_finding" + filter.whereSql, Long.class, filter.args.toArray());
            total = cnt == null ? 0L : cnt;
        } catch (DataAccessException e) {
            throw sourceUnavailable("findAll count", e);
        }

        List<Object> dataArgs = new ArrayList<>(filter.args);
        dataArgs.add(size + 1);
        if (cursor == null || cursor.isBlank()) {
            dataArgs.add((long) page * size);
        }

        List<VulnFindingDTO> rows;
        try {
            String limitSql = (cursor == null || cursor.isBlank())
                ? " LIMIT ? OFFSET ?"
                : " LIMIT ?";
            rows = jdbc.query(
                "SELECT * FROM ha_vuln_finding" + filter.whereSql
                    + " ORDER BY COALESCE(cvss_v3, -1) DESC, is_kev DESC, id DESC"
                    + limitSql,
                new VulnFindingRowMapper(objectMapper),
                dataArgs.toArray());
        } catch (DataAccessException e) {
            throw sourceUnavailable("findAll data", e);
        }

        boolean hasMore = rows.size() > size;
        if (hasMore) {
            rows = new ArrayList<>(rows.subList(0, size));
        }
        String nextCursor = null;
        if (hasMore && !rows.isEmpty()) {
            VulnFindingDTO last = rows.get(rows.size() - 1);
            nextCursor = TelemetryCursor.encode(List.of(
                String.valueOf(last.getCvssV3() == null ? -1d : last.getCvssV3()),
                last.isKev() ? "1" : "0",
                String.valueOf(last.getId())));
        }
        return new TelemetrySlice<>(rows, total, nextCursor, hasMore);
    }

    public VulnFindingDTO findById(long findingId) {
        if (findingId <= 0) {
            throw new TelemetryQueryException("VULN_FINDING_NOT_FOUND", "Finding was not found");
        }
        List<VulnFindingDTO> rows;
        try {
            rows = jdbc.query(
                "SELECT * FROM ha_vuln_finding WHERE id = ?" + tenantPredicate(),
                new VulnFindingRowMapper(objectMapper),
                findingId, TelemetryTenantScope.requireTenantId());
        } catch (DataAccessException e) {
            throw sourceUnavailable("findById", e);
        }
        if (rows.isEmpty()) {
            throw new TelemetryQueryException("VULN_FINDING_NOT_FOUND", "Finding was not found");
        }
        return rows.get(0);
    }

    public VulnSummaryDTO buildSummary(String agentId, String severity, Boolean isKev,
                                       String cve, String from, String to) {
        FilterSpec filter = buildFilter(agentId, severity, isKev, cve, from, to, null);
        VulnSummaryDTO dto = new VulnSummaryDTO();
        dto.setSnapshotAt(Instant.now().toString());
        try {
            dto.setCritical(countBySeverity(filter, "CRITICAL"));
            dto.setHigh(countBySeverity(filter, "HIGH"));
            dto.setMedium(countBySeverity(filter, "MEDIUM"));
            dto.setLow(countBySeverity(filter, "LOW"));
            dto.setInfo(countBySeverity(filter, "INFO"));

            List<Object> kevArgs = new ArrayList<>(filter.args);
            Long kev = jdbc.queryForObject(
                "SELECT COUNT(*) FROM ha_vuln_finding" + filter.whereSql + " AND is_kev = true",
                Long.class,
                kevArgs.toArray());
            dto.setKevCount(kev != null ? kev.intValue() : 0);

            Long agents = jdbc.queryForObject(
                "SELECT COUNT(DISTINCT agent_id) FROM ha_vuln_finding" + filter.whereSql,
                Long.class,
                filter.args.toArray());
            dto.setAffectedAgents(agents != null ? agents.intValue() : 0);

            List<VulnSummaryDTO.TopCveDTO> topCves = jdbc.query(
                "SELECT cve_id, MAX(cvss_v3) as cvss, "
                    + "MAX(CASE WHEN UPPER(severity) = 'CRITICAL' THEN 5 "
                    + "WHEN UPPER(severity) = 'HIGH' THEN 4 "
                    + "WHEN UPPER(severity) = 'MEDIUM' THEN 3 "
                    + "WHEN UPPER(severity) = 'LOW' THEN 2 "
                    + "WHEN UPPER(severity) = 'INFO' THEN 1 ELSE 0 END) as sev_rank, "
                    + "MAX(CASE WHEN is_kev THEN 1 ELSE 0 END) as kev, "
                    + "COUNT(DISTINCT agent_id) as cnt "
                    + "FROM ha_vuln_finding" + filter.whereSql
                    + " GROUP BY cve_id ORDER BY cnt DESC, cvss DESC NULLS LAST LIMIT 10",
                (rs, i) -> {
                    VulnSummaryDTO.TopCveDTO t = new VulnSummaryDTO.TopCveDTO();
                    t.setCveId(rs.getString("cve_id"));
                    Object cvss = rs.getObject("cvss");
                    t.setCvssV3(cvss == null ? 0d : ((Number) cvss).doubleValue());
                    t.setSeverity(severityFromRank(rs.getInt("sev_rank")));
                    t.setKev(rs.getInt("kev") == 1);
                    t.setAffectedAgents(rs.getInt("cnt"));
                    return t;
                },
                filter.args.toArray());
            dto.setTopCves(topCves);
        } catch (DataAccessException e) {
            throw sourceUnavailable("buildSummary", e);
        }
        return dto;
    }

    private int countBySeverity(FilterSpec filter, String sev) {
        List<Object> args = new ArrayList<>(filter.args);
        Long cnt = jdbc.queryForObject(
            "SELECT COUNT(*) FROM ha_vuln_finding" + filter.whereSql + " AND UPPER(severity) = ?",
            Long.class,
            append(args, sev).toArray());
        return cnt != null ? cnt.intValue() : 0;
    }

    public VulnRemediationDTO remediationFor(long findingId) {
        findById(findingId);
        VulnRemediationDTO dto = new VulnRemediationDTO();
        dto.setState("unavailable");
        dto.setReason("No governed remediation connector is configured; HiveArmor will not invent patch or execute state");
        return dto;
    }

    private FilterSpec buildFilter(String agentId, String severity, Boolean isKev,
                                   String cve, String from, String to, String cursor) {
        StringBuilder where = new StringBuilder(" WHERE tenant_id = ?");
        List<Object> args = new ArrayList<>();
        args.add(TelemetryTenantScope.requireTenantId());

        if (agentId != null && !agentId.isBlank()) {
            if (agentId.length() > MAX_AGENT_ID_LENGTH) {
                throw new TelemetryQueryException("VULN_AGENT_INVALID", "agentId exceeds maximum length");
            }
            where.append(" AND agent_id = ?");
            args.add(agentId);
        }
        if (severity != null && !severity.isBlank()) {
            String normalized = severity.toUpperCase(Locale.ROOT);
            if (!SEVERITIES.contains(normalized)) {
                throw new TelemetryQueryException(
                    "VULN_SEVERITY_INVALID",
                    "severity must be one of CRITICAL, HIGH, MEDIUM, LOW, INFO");
            }
            where.append(" AND UPPER(severity) = ?");
            args.add(normalized);
        }
        if (isKev != null) {
            where.append(" AND is_kev = ?");
            args.add(isKev);
        }
        if (cve != null && !cve.isBlank()) {
            if (cve.length() > MAX_CVE_LENGTH) {
                throw new TelemetryQueryException("VULN_CVE_INVALID", "cve exceeds maximum length");
            }
            where.append(" AND cve_id LIKE ? ESCAPE '\\'");
            String escaped = cve.replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
            args.add("%" + escaped + "%");
        }
        if (from != null && !from.isBlank()) {
            where.append(" AND first_seen_at >= ?");
            args.add(parseInstant(from));
        }
        if (to != null && !to.isBlank()) {
            where.append(" AND first_seen_at <= ?");
            args.add(parseInstant(to));
        }
        if (cursor != null && !cursor.isBlank()) {
            String[] parts = TelemetryCursor.decode(cursor);
            if (parts.length != 3) {
                throw new TelemetryQueryException("TELEMETRY_CURSOR_INVALID", "List cursor is invalid");
            }
            where.append(" AND (COALESCE(cvss_v3, -1), CASE WHEN is_kev THEN 1 ELSE 0 END, id) < (?, ?, ?)");
            args.add(Double.parseDouble(parts[0]));
            args.add(Integer.parseInt(parts[1]));
            args.add(Long.parseLong(parts[2]));
        }
        return new FilterSpec(where.toString(), args);
    }

    private static String tenantPredicate() {
        return " AND tenant_id = ?";
    }

    private static String parseInstant(String value) {
        try {
            return Instant.parse(value).toString();
        } catch (RuntimeException e) {
            throw new TelemetryQueryException("VULN_TIME_RANGE_INVALID", "from/to must be ISO-8601 instants");
        }
    }

    private static String severityFromRank(int rank) {
        return switch (rank) {
            case 5 -> "CRITICAL";
            case 4 -> "HIGH";
            case 3 -> "MEDIUM";
            case 2 -> "LOW";
            case 1 -> "INFO";
            default -> "INFO";
        };
    }

    private static List<Object> append(List<Object> args, Object value) {
        args.add(value);
        return args;
    }

    private TelemetryQueryException sourceUnavailable(String operation, DataAccessException e) {
        log.error("{}.{}: {}", CLASSNAME, operation, e.getMessage());
        return new TelemetryQueryException(
            "TELEMETRY_SOURCE_UNAVAILABLE",
            "Vulnerability findings could not be loaded from the telemetry store");
    }

    private record FilterSpec(String whereSql, List<Object> args) {
    }

    private static class VulnFindingRowMapper implements RowMapper<VulnFindingDTO> {
        private final ObjectMapper objectMapper;

        VulnFindingRowMapper(ObjectMapper objectMapper) {
            this.objectMapper = objectMapper;
        }

        @Override
        public VulnFindingDTO mapRow(ResultSet rs, int rowNum) throws SQLException {
            VulnFindingDTO dto = new VulnFindingDTO();
            dto.setId(rs.getLong("id"));
            dto.setAgentId(rs.getString("agent_id"));
            dto.setAgentHostname(rs.getString("agent_hostname"));
            dto.setCveId(rs.getString("cve_id"));
            dto.setPurl(rs.getString("purl"));
            dto.setPackageName(rs.getString("package_name"));
            dto.setInstalledVersion(rs.getString("installed_version"));
            dto.setFixedVersion(rs.getString("fixed_version"));
            Object cvss = rs.getObject("cvss_v3");
            if (cvss != null) {
                dto.setCvssV3(((Number) cvss).doubleValue());
            }
            dto.setSeverity(rs.getString("severity"));
            dto.setKev(rs.getBoolean("is_kev"));
            dto.setDescription(rs.getString("description"));
            dto.setReferences(parseStringList(rs.getString("references_json")));
            dto.setPublishedAt(rs.getString("published_at"));
            dto.setFirstSeenAt(rs.getString("first_seen_at"));
            dto.setLastSeenAt(rs.getString("last_seen_at"));
            Object epss = rs.getObject("epss_score");
            if (epss != null) {
                dto.setEpssScore(((Number) epss).doubleValue());
            }
            Object epssPct = rs.getObject("epss_percentile");
            if (epssPct != null) {
                dto.setEpssPercentile(((Number) epssPct).doubleValue());
            }
            Object asOf = rs.getObject("epss_as_of");
            dto.setEpssAsOf(asOf == null ? null : asOf.toString());
            dto.setEpssState(epss == null ? "unavailable" : "reported");
            return dto;
        }

        private List<String> parseStringList(String json) {
            if (json == null || json.isBlank() || "null".equals(json)) {
                return new ArrayList<>();
            }
            try {
                return objectMapper.readValue(json, new TypeReference<List<String>>() {
                });
            } catch (Exception e) {
                return new ArrayList<>();
            }
        }
    }
}
