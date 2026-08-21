package com.hivearmor.service.telemetry;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.service.dto.sca.CisPackCatalogDTO;
import com.hivearmor.service.dto.sca.ScaResultDTO;
import com.hivearmor.service.dto.sca.ScaSummaryDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Queries SCA / CIS Benchmark results.
 *
 * <p>Constructor injection only; no Lombok; no {@code List#getFirst()}.
 */
@Service
public class HaCisService {

    private static final Logger log = LoggerFactory.getLogger(HaCisService.class);
    private static final String CLASSNAME = "HaCisService";
    private static final Set<String> STATUSES = Set.of("PASS", "FAIL", "NOT_APPLICABLE", "ERROR");
    private static final Set<String> LEVELS = Set.of("L1", "L2");
    private static final int MAX_CHECK_ID_LENGTH = 100;
    private static final int MAX_AGENT_ID_LENGTH = 255;

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public HaCisService(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public TelemetrySlice<ScaResultDTO> findResults(String agentId, String checkId,
                                                    String status, String level,
                                                    int page, int size, String cursor) {
        TelemetryQueryLimits.requireSize(size);
        if (cursor == null || cursor.isBlank()) {
            TelemetryQueryLimits.requirePage(page);
        }
        FilterSpec filter = buildFilter(agentId, checkId, status, level, cursor);

        long total;
        try {
            Long cnt = jdbc.queryForObject(
                "SELECT COUNT(*) FROM ha_sca_result" + filter.whereSql, Long.class, filter.args.toArray());
            total = cnt == null ? 0L : cnt;
        } catch (DataAccessException e) {
            throw sourceUnavailable("findResults count", e);
        }

        List<Object> dataArgs = new ArrayList<>(filter.args);
        dataArgs.add(size + 1);
        if (cursor == null || cursor.isBlank()) {
            dataArgs.add((long) page * size);
        }

        List<ScaResultDTO> rows;
        try {
            String limitSql = (cursor == null || cursor.isBlank()) ? " LIMIT ? OFFSET ?" : " LIMIT ?";
            rows = jdbc.query(
                "SELECT * FROM ha_sca_result" + filter.whereSql
                    + " ORDER BY scanned_at DESC, id DESC" + limitSql,
                new ScaResultRowMapper(objectMapper),
                dataArgs.toArray());
        } catch (DataAccessException e) {
            throw sourceUnavailable("findResults data", e);
        }

        boolean hasMore = rows.size() > size;
        if (hasMore) {
            rows = new ArrayList<>(rows.subList(0, size));
        }
        String nextCursor = null;
        if (hasMore && !rows.isEmpty()) {
            ScaResultDTO last = rows.get(rows.size() - 1);
            nextCursor = TelemetryCursor.encode(List.of(
                last.getScannedAt() == null ? "" : last.getScannedAt(),
                String.valueOf(last.getId())));
        }
        return new TelemetrySlice<>(rows, total, nextCursor, hasMore);
    }

    public ScaResultDTO findById(long resultId) {
        if (resultId <= 0) {
            throw new TelemetryQueryException("CIS_RESULT_NOT_FOUND", "Assessment result was not found");
        }
        List<ScaResultDTO> rows;
        try {
            rows = jdbc.query(
                "SELECT * FROM ha_sca_result WHERE id = ? AND tenant_id = ?",
                new ScaResultRowMapper(objectMapper),
                resultId, TelemetryTenantScope.requireTenantId());
        } catch (DataAccessException e) {
            throw sourceUnavailable("findById", e);
        }
        if (rows.isEmpty()) {
            throw new TelemetryQueryException("CIS_RESULT_NOT_FOUND", "Assessment result was not found");
        }
        return rows.get(0);
    }

    public List<ScaSummaryDTO> buildSummary(String agentId) {
        FilterSpec filter = buildFilter(agentId, null, null, null, null);
        try {
            return jdbc.query(
                "SELECT * FROM ha_sca_summary" + filter.whereSql + " ORDER BY score_pct ASC, id ASC",
                new ScaSummaryRowMapper(),
                filter.args.toArray());
        } catch (DataAccessException e) {
            throw sourceUnavailable("buildSummary", e);
        }
    }

    public List<CisPackCatalogDTO> listObservedCatalog() {
        long tenantId = TelemetryTenantScope.requireTenantId();
        try {
            java.util.Map<String, ObservedPack> observed = new java.util.LinkedHashMap<>();
            jdbc.query(
                "SELECT pack_id, COALESCE(pack_version, '1') as pack_version, "
                    + "COUNT(DISTINCT agent_id) as agents, MAX(scanned_at) as last_scanned "
                    + "FROM ha_sca_summary WHERE tenant_id = ? AND pack_id IS NOT NULL "
                    + "GROUP BY pack_id, COALESCE(pack_version, '1') ORDER BY pack_id ASC, pack_version ASC",
                new Object[]{tenantId},
                (java.sql.ResultSet rs) -> {
                    while (rs.next()) {
                        ObservedPack pack = new ObservedPack(
                            rs.getString("pack_id"),
                            rs.getString("pack_version"),
                            rs.getInt("agents"),
                            rs.getString("last_scanned"));
                        observed.put(pack.packId() + "\0" + pack.packVersion(), pack);
                    }
                    return null;
                });

            List<CisPackCatalogDTO> catalog = jdbc.query(
                "SELECT pack_id, pack_version, authority, license_state, official_benchmark, platform, title, note "
                    + "FROM ha_cis_pack_catalog ORDER BY official_benchmark ASC, pack_id ASC",
                (rs, i) -> {
                    CisPackCatalogDTO dto = new CisPackCatalogDTO();
                    dto.setPackId(rs.getString("pack_id"));
                    dto.setPackVersion(rs.getString("pack_version"));
                    dto.setAuthority(rs.getString("authority"));
                    dto.setLicenseState(rs.getString("license_state"));
                    dto.setOfficialBenchmark(rs.getBoolean("official_benchmark"));
                    dto.setPlatform(rs.getString("platform"));
                    dto.setTitle(rs.getString("title"));
                    dto.setNote(rs.getString("note"));
                    ObservedPack overlay = observed.remove(dto.getPackId() + "\0" + dto.getPackVersion());
                    if (overlay != null) {
                        dto.setReportingAgents(overlay.agents());
                        dto.setLastScannedAt(overlay.lastScanned());
                        dto.setSource("observed-results");
                    } else if (Boolean.TRUE.equals(dto.getOfficialBenchmark())) {
                        dto.setReportingAgents(0);
                        dto.setSource("license-required");
                    } else {
                        dto.setReportingAgents(0);
                        dto.setSource("catalog");
                    }
                    return dto;
                });

            for (ObservedPack leftover : observed.values()) {
                CisPackCatalogDTO dto = new CisPackCatalogDTO();
                dto.setPackId(leftover.packId());
                dto.setPackVersion(leftover.packVersion());
                dto.setAuthority("HIVEARMOR");
                dto.setLicenseState("SHIPPED_OBSERVED");
                dto.setOfficialBenchmark(false);
                dto.setReportingAgents(leftover.agents());
                dto.setLastScannedAt(leftover.lastScanned());
                dto.setSource("observed-results");
                dto.setTitle(leftover.packId());
                dto.setNote("Observed pack not present in the licensed CIS catalog.");
                catalog.add(dto);
            }
            return catalog;
        } catch (DataAccessException e) {
            throw sourceUnavailable("listObservedCatalog", e);
        }
    }

    private record ObservedPack(String packId, String packVersion, int agents, String lastScanned) {
    }

    private FilterSpec buildFilter(String agentId, String checkId, String status, String level, String cursor) {
        StringBuilder where = new StringBuilder(" WHERE tenant_id = ?");
        List<Object> args = new ArrayList<>();
        args.add(TelemetryTenantScope.requireTenantId());
        appendAgent(where, args, agentId);
        if (checkId != null && !checkId.isBlank()) {
            if (checkId.length() > MAX_CHECK_ID_LENGTH) {
                throw new TelemetryQueryException("CIS_CHECK_INVALID", "checkId exceeds maximum length");
            }
            where.append(" AND check_id = ?");
            args.add(checkId);
        }
        appendStatus(where, args, status);
        appendLevel(where, args, level);
        if (cursor != null && !cursor.isBlank()) {
            String[] parts = TelemetryCursor.decode(cursor);
            if (parts.length != 2) {
                throw new TelemetryQueryException("TELEMETRY_CURSOR_INVALID", "List cursor is invalid");
            }
            where.append(" AND (scanned_at, id) < (?, ?)");
            args.add(parts[0]);
            args.add(Long.parseLong(parts[1]));
        }
        return new FilterSpec(where.toString(), args);
    }

    private void appendAgent(StringBuilder where, List<Object> args, String agentId) {
        if (agentId == null || agentId.isBlank()) {
            return;
        }
        if (agentId.length() > MAX_AGENT_ID_LENGTH) {
            throw new TelemetryQueryException("CIS_AGENT_INVALID", "agentId exceeds maximum length");
        }
        where.append(" AND agent_id = ?");
        args.add(agentId);
    }

    private void appendStatus(StringBuilder where, List<Object> args, String status) {
        if (status == null || status.isBlank()) {
            return;
        }
        String normalized = status.toUpperCase(Locale.ROOT);
        if (!STATUSES.contains(normalized)) {
            throw new TelemetryQueryException(
                "CIS_STATUS_INVALID",
                "status must be one of PASS, FAIL, NOT_APPLICABLE, ERROR");
        }
        where.append(" AND UPPER(status) = ?");
        args.add(normalized);
    }

    private void appendLevel(StringBuilder where, List<Object> args, String level) {
        if (level == null || level.isBlank()) {
            return;
        }
        String normalized = level.toUpperCase(Locale.ROOT);
        if (!LEVELS.contains(normalized)) {
            throw new TelemetryQueryException("CIS_LEVEL_INVALID", "level must be L1 or L2");
        }
        where.append(" AND UPPER(level) = ?");
        args.add(normalized);
    }

    private TelemetryQueryException sourceUnavailable(String operation, DataAccessException e) {
        log.error("{}.{}: {}", CLASSNAME, operation, e.getMessage());
        return new TelemetryQueryException(
            "TELEMETRY_SOURCE_UNAVAILABLE",
            "CIS assessment results could not be loaded from the telemetry store");
    }

    private record FilterSpec(String whereSql, List<Object> args) {
    }

    private static class ScaResultRowMapper implements RowMapper<ScaResultDTO> {
        private final ObjectMapper objectMapper;

        ScaResultRowMapper(ObjectMapper om) {
            this.objectMapper = om;
        }

        @Override
        public ScaResultDTO mapRow(ResultSet rs, int rowNum) throws SQLException {
            ScaResultDTO dto = new ScaResultDTO();
            dto.setId(rs.getLong("id"));
            dto.setAgentId(rs.getString("agent_id"));
            dto.setAgentHostname(rs.getString("agent_hostname"));
            dto.setCheckId(rs.getString("check_id"));
            dto.setCheckTitle(rs.getString("check_title"));
            dto.setPackId(rs.getString("pack_id"));
            dto.setLevel(rs.getString("level"));
            dto.setStatus(rs.getString("status"));
            dto.setObservedValue(rs.getString("observed_value"));
            dto.setExpectedValue(rs.getString("expected_value"));
            dto.setRemediation(rs.getString("remediation"));
            dto.setScannedAt(rs.getString("scanned_at"));
            dto.setMitre(parseStringList(rs.getString("mitre_json")));
            dto.setComplianceTags(parseStringList(rs.getString("compliance_tags_json")));
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

    private static class ScaSummaryRowMapper implements RowMapper<ScaSummaryDTO> {
        @Override
        public ScaSummaryDTO mapRow(ResultSet rs, int rowNum) throws SQLException {
            ScaSummaryDTO dto = new ScaSummaryDTO();
            dto.setId(rs.getLong("id"));
            dto.setAgentId(rs.getString("agent_id"));
            dto.setAgentHostname(rs.getString("agent_hostname"));
            dto.setPackId(rs.getString("pack_id"));
            dto.setTotal(rs.getInt("total"));
            dto.setPassCount(rs.getInt("pass_count"));
            dto.setFailCount(rs.getInt("fail_count"));
            dto.setNaCount(rs.getInt("na_count"));
            dto.setErrorCount(rs.getInt("error_count"));
            dto.setScorePct(rs.getDouble("score_pct"));
            dto.setScannedAt(rs.getString("scanned_at"));
            return dto;
        }
    }
}
