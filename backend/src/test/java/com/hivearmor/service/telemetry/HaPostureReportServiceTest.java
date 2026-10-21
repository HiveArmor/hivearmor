package com.hivearmor.service.telemetry;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.agent_manager.AgentGrpcService;
import com.hivearmor.service.dto.agent_manager.AgentDTO;
import com.hivearmor.service.dto.posture.FleetCisPostureDTO;
import com.hivearmor.service.dto.posture.FleetPostureOverviewDTO;
import com.hivearmor.service.dto.posture.PostureTrendDTO;
import com.hivearmor.service.dto.vuln.VulnSummaryDTO;
import com.hivearmor.service.elasticsearch.ElasticsearchService;
import com.hivearmor.service.grpc.Agent;
import com.hivearmor.service.grpc.Status;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * Unit tests for the pure cross-fleet aggregation, trend/drift and coverage logic of
 * {@link HaPostureReportService}. These exercise the SPEC-PT-6 honesty contract:
 * a host with no scan is "not covered" (never a pass), an unscanned fleet scores null
 * (never 100%), and drift needs two distinct scan points.
 *
 * <p>The OpenSearch / gRPC I/O seams are exercised at the resource/integration layer;
 * here we feed the aggregation its already-fetched inputs directly.
 */
class HaPostureReportServiceTest {

    private final HaPostureReportService service = new HaPostureReportService(
            mock(ElasticsearchService.class),
            mock(MsspIndexResolver.class),
            mock(HaVulnService.class),
            mock(AgentGrpcService.class));

    private static AgentDTO agent(int id, String hostname, String platform) {
        AgentDTO dto = new AgentDTO(Agent.newBuilder()
                .setId(id)
                .setHostname(hostname)
                .setPlatform(platform)
                .setStatus(Status.ONLINE)
                .build());
        return dto;
    }

    @Test
    void unscannedFleetScoresNullNeverHundred() {
        List<AgentDTO> fleet = List.of(agent(1, "web-01", "linux"), agent(2, "web-02", "linux"));

        FleetCisPostureDTO cis = service.buildFleetCis(fleet, List.of());

        // Honesty: no scans => null score (UI renders "not covered"), never 100%.
        assertThat(cis.getFleetScorePct()).isNull();
        assertThat(cis.getFleetHostCount()).isEqualTo(2);
        assertThat(cis.getHostsScanned()).isZero();
        assertThat(cis.getHostsNotScanned()).isEqualTo(2);
        assertThat(cis.getHosts()).hasSize(2);
        assertThat(cis.getHosts()).allMatch(h -> !h.isScanned());
    }

    @Test
    void partiallyScannedFleetCountsUncoveredHostsHonestly() {
        List<AgentDTO> fleet = List.of(
                agent(1, "web-01", "linux"),
                agent(2, "web-02", "linux"),
                agent(3, "db-01", "linux"));
        // Only agent 1 has a scan: 80 pass, 20 fail.
        List<HaPostureReportService.SummaryDoc> summaries = List.of(
                HaPostureReportService.SummaryDoc.of("1", "web-01", 80, 20, 0, 80.0,
                        "2026-10-20T10:00:00Z"));

        FleetCisPostureDTO cis = service.buildFleetCis(fleet, summaries);

        assertThat(cis.getHostsScanned()).isEqualTo(1);
        assertThat(cis.getHostsNotScanned()).isEqualTo(2);
        // Fleet score over decidable controls only: 80/(80+20) = 80%.
        assertThat(cis.getFleetScorePct()).isEqualTo(80.0);
        assertThat(cis.getPassCount()).isEqualTo(80);
        assertThat(cis.getFailCount()).isEqualTo(20);
        // The two unscanned hosts appear with scanned=false and no fabricated counts.
        assertThat(cis.getHosts()).filteredOn(h -> !h.isScanned()).hasSize(2);
    }

    @Test
    void latestScanPerHostWins() {
        List<AgentDTO> fleet = List.of(agent(1, "web-01", "linux"));
        // Summaries arrive newest-first (as the OpenSearch sort guarantees).
        List<HaPostureReportService.SummaryDoc> summaries = List.of(
                HaPostureReportService.SummaryDoc.of("1", "web-01", 90, 10, 0, 90.0,
                        "2026-10-20T10:00:00Z"),
                HaPostureReportService.SummaryDoc.of("1", "web-01", 50, 50, 0, 50.0,
                        "2026-10-19T10:00:00Z"));

        FleetCisPostureDTO cis = service.buildFleetCis(fleet, summaries);

        assertThat(cis.getHostsScanned()).isEqualTo(1);
        // Only the latest (90/10) scan is counted, not the older one.
        assertThat(cis.getPassCount()).isEqualTo(90);
        assertThat(cis.getFailCount()).isEqualTo(10);
        assertThat(cis.getFleetScorePct()).isEqualTo(90.0);
    }

    @Test
    void scannedHostAbsentFromRegistryIsStillCounted() {
        // Agent registry unreachable / host de-enrolled, but its scan exists.
        List<HaPostureReportService.SummaryDoc> summaries = List.of(
                HaPostureReportService.SummaryDoc.of("9", "ghost-01", 70, 30, 0, 70.0,
                        "2026-10-20T10:00:00Z"));

        FleetCisPostureDTO cis = service.buildFleetCis(List.of(), summaries);

        assertThat(cis.getHostsScanned()).isEqualTo(1);
        assertThat(cis.getFleetHostCount()).isEqualTo(1);
        assertThat(cis.getPassCount()).isEqualTo(70);
    }

    @Test
    void driftNeedsTwoDistinctScanPoints() {
        // Single scan point => no drift.
        List<HaPostureReportService.SummaryDoc> one = List.of(
                HaPostureReportService.SummaryDoc.of("1", "web-01", 80, 20, 0, 80.0,
                        recentIso(1)));

        PostureTrendDTO single = service.buildTrend(one, 90);
        assertThat(single.isDriftAvailable()).isFalse();
        assertThat(single.getCisScoreDrift()).isNull();
        assertThat(single.getCisScore()).hasSize(1);
    }

    @Test
    void driftComputedFromLatestVsPrevious() {
        // Two days: day-1 70%, day-2 90% => +20 drift, fail delta -20.
        List<HaPostureReportService.SummaryDoc> summaries = List.of(
                HaPostureReportService.SummaryDoc.of("1", "web-01", 90, 10, 0, 90.0, recentIso(1)),
                HaPostureReportService.SummaryDoc.of("1", "web-01", 70, 30, 0, 70.0, recentIso(3)));

        PostureTrendDTO trend = service.buildTrend(summaries, 90);

        assertThat(trend.isDriftAvailable()).isTrue();
        assertThat(trend.getCisScoreDrift()).isEqualTo(20.0);
        assertThat(trend.getFailCountDrift()).isEqualTo(-20);
        assertThat(trend.getCisScore()).hasSize(2);
    }

    @Test
    void trendDropsScansOutsideWindow() {
        List<HaPostureReportService.SummaryDoc> summaries = List.of(
                HaPostureReportService.SummaryDoc.of("1", "web-01", 90, 10, 0, 90.0, recentIso(1)),
                // 400 days ago — outside a 90-day window.
                HaPostureReportService.SummaryDoc.of("1", "web-01", 10, 90, 0, 10.0, recentIso(400)));

        PostureTrendDTO trend = service.buildTrend(summaries, 90);

        assertThat(trend.getCisScore()).hasSize(1);
        assertThat(trend.isDriftAvailable()).isFalse();
    }

    @Test
    void coverageReportsUncoveredHostsHonestly() {
        List<AgentDTO> fleet = List.of(
                agent(1, "web-01", "linux"),
                agent(2, "web-02", "linux"),
                agent(3, "db-01", "linux"),
                agent(4, "db-02", "linux"));
        List<HaPostureReportService.SummaryDoc> summaries = List.of(
                HaPostureReportService.SummaryDoc.of("1", "web-01", 80, 20, 0, 80.0,
                        "2026-10-20T10:00:00Z"));
        VulnSummaryDTO vuln = new VulnSummaryDTO();
        vuln.setAffectedAgents(2);

        FleetPostureOverviewDTO.Coverage coverage = service.buildCoverage(fleet, summaries, vuln);

        assertThat(coverage.getFleetHostCount()).isEqualTo(4);
        assertThat(coverage.getHostsWithCis()).isEqualTo(1);
        assertThat(coverage.getHostsWithVuln()).isEqualTo(2);
        // covered floor = max(cis=1, vuln=2) = 2 => 2 uncovered. Never understates.
        assertThat(coverage.getHostsUncovered()).isEqualTo(2);
    }

    private static String recentIso(int daysAgo) {
        return java.time.Instant.now()
                .minusSeconds((long) daysAgo * 86_400L)
                .toString();
    }
}
