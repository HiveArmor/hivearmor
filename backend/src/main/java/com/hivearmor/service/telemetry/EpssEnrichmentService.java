package com.hivearmor.service.telemetry;

import com.hivearmor.config.HaAirGapConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

/**
 * Stores FIRST EPSS values onto existing finding columns. Never invents scores.
 */
@Service
public class EpssEnrichmentService {

    private static final Logger log = LoggerFactory.getLogger(EpssEnrichmentService.class);
    private static final String CLASSNAME = "EpssEnrichmentService";
    private static final int MAX_CVES = 40;

    private final JdbcTemplate jdbc;
    private final EpssClient epssClient;
    private final HaAirGapConfig.AirGapGuard airGapGuard;

    public EpssEnrichmentService(JdbcTemplate jdbc, EpssClient epssClient,
                                 HaAirGapConfig.AirGapGuard airGapGuard) {
        this.jdbc = jdbc;
        this.epssClient = epssClient;
        this.airGapGuard = airGapGuard;
    }

    @Scheduled(fixedDelayString = "PT6H", initialDelayString = "PT15M")
    public void scheduledRefresh() {
        refreshMissing();
    }

    public int refreshMissing() {
        final String ctx = CLASSNAME + ".refreshMissing";
        if (airGapGuard.isAirGap()) {
            log.debug("{}: air-gap active — skipping FIRST EPSS", ctx);
            return 0;
        }
        List<String> cves;
        try {
            cves = jdbc.queryForList(
                    "SELECT DISTINCT cve_id FROM ha_vuln_finding "
                            + "WHERE cve_id LIKE 'CVE-%' AND epss_score IS NULL "
                            + "ORDER BY cve_id ASC LIMIT ?",
                    String.class,
                    MAX_CVES);
        } catch (Exception e) {
            log.warn("{}: could not list CVEs for EPSS: {}", ctx, e.getMessage());
            return 0;
        }
        if (cves.isEmpty()) {
            return 0;
        }
        try {
            String body = epssClient.queryCves(cves);
            List<EpssFeedParser.EpssRow> rows = EpssFeedParser.parse(body);
            int written = 0;
            for (EpssFeedParser.EpssRow row : rows) {
                Timestamp asOf = parseAsOf(row.asOf());
                int updated = jdbc.update(
                        "UPDATE ha_vuln_finding SET epss_score = ?, epss_percentile = ?, epss_as_of = ?, updated_at = NOW() "
                                + "WHERE cve_id = ? AND epss_score IS NULL",
                        row.score(), row.percentile(), asOf, row.cve());
                written += updated;
            }
            if (written > 0) {
                log.info("{}: stored FIRST EPSS on {} finding rows", ctx, written);
            }
            return written;
        } catch (Exception e) {
            log.warn("{}: FIRST EPSS enrichment failed: {}", ctx, e.getMessage());
            return 0;
        }
    }

    private static Timestamp parseAsOf(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return Timestamp.valueOf(LocalDateTime.of(LocalDate.parse(raw), LocalTime.MIDNIGHT));
        } catch (Exception e) {
            return null;
        }
    }
}
