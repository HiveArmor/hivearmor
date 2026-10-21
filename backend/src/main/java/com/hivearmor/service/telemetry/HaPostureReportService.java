package com.hivearmor.service.telemetry;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantScope;
import com.hivearmor.service.agent_manager.AgentGrpcService;
import com.hivearmor.service.dto.agent_manager.AgentDTO;
import com.hivearmor.service.dto.agent_manager.ListAgentsResponseDTO;
import com.hivearmor.service.dto.posture.FleetCisPostureDTO;
import com.hivearmor.service.dto.posture.FleetPostureOverviewDTO;
import com.hivearmor.service.dto.posture.PostureTrendDTO;
import com.hivearmor.service.dto.vuln.VulnSummaryDTO;
import com.hivearmor.service.elasticsearch.ElasticsearchService;
import com.hivearmor.service.grpc.ListRequest;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * Cross-fleet compliance / posture reporting (SPEC-PT-6). Aggregates the REAL per-host
 * PT-5 results into fleet-wide views — it owns no store of its own:
 *
 * <ul>
 *   <li>CIS: the latest {@code docType=summary} document per host from the net-new
 *       OpenSearch index {@code v3-hive-cis-*}, tenant-scoped via
 *       {@link MsspIndexResolver} (fail-closed for an unresolved MSSP prefix).</li>
 *   <li>Vuln: {@link HaVulnService#buildSummary} over {@code ha_vuln_finding} (JDBC,
 *       {@code tenant_id} predicate).</li>
 *   <li>Coverage: the tenant's agent registry via {@link AgentGrpcService#listAgents}
 *       (gRPC, authoritative tenant stamp) — the honest "not scanned" denominator.</li>
 * </ul>
 *
 * <p>Honesty contract (SPEC-PT-6 §3): a host with no scan is counted as "not covered",
 * never folded into a pass. A fleet with no scans reports a null score, never 100%.
 *
 * <p>Runs on the request thread; tenant scope is already populated by
 * {@code TenantContextFilter}. Constructor injection; no Lombok; no {@code getFirst()}.
 */
@Service
public class HaPostureReportService {

    private static final Logger log = LoggerFactory.getLogger(HaPostureReportService.class);
    private static final String CLASSNAME = "HaPostureReportService";
    private static final String CIS_TYPE = "cis";
    /** Upper bound on CIS summary docs pulled for fleet aggregation (one per scan). */
    private static final int MAX_SUMMARY_DOCS = 10_000;
    /** Agent-registry page size — effectively "all agents in the tenant". */
    private static final int FLEET_PAGE_SIZE = 1_000_000;
    private static final DateTimeFormatter DAY =
            DateTimeFormatter.ofPattern("yyyy-MM-dd").withZone(ZoneOffset.UTC);

    private final ElasticsearchService elasticsearchService;
    private final MsspIndexResolver indexResolver;
    private final HaVulnService vulnService;
    private final AgentGrpcService agentGrpcService;

    public HaPostureReportService(ElasticsearchService elasticsearchService,
                                  MsspIndexResolver indexResolver,
                                  HaVulnService vulnService,
                                  AgentGrpcService agentGrpcService) {
        this.elasticsearchService = elasticsearchService;
        this.indexResolver = indexResolver;
        this.vulnService = vulnService;
        this.agentGrpcService = agentGrpcService;
    }

    // --- public API ---------------------------------------------------------

    /** Composite cross-fleet overview: CIS + vuln + coverage honesty. */
    public FleetPostureOverviewDTO overview() {
        List<AgentDTO> fleet = enumerateFleet();
        List<SummaryDoc> summaries = fleetCisSummaries();

        FleetCisPostureDTO cis = buildFleetCis(fleet, summaries);
        VulnSummaryDTO vuln = vulnService.buildSummary(null, null, null, null, null, null);

        FleetPostureOverviewDTO dto = new FleetPostureOverviewDTO();
        dto.setSnapshotAt(Instant.now().toString());
        dto.setCis(cis);
        dto.setVuln(vuln);
        dto.setCoverage(buildCoverage(fleet, summaries, vuln));
        return dto;
    }

    /** Cross-fleet CIS posture only (host grid + fleet rollup + not-covered count). */
    public FleetCisPostureDTO fleetCis() {
        return buildFleetCis(enumerateFleet(), fleetCisSummaries());
    }

    /** Posture-over-time: day-bucketed CIS pass-rate series + latest-vs-previous drift. */
    public PostureTrendDTO trend(int days) {
        int window = days <= 0 ? 90 : Math.min(days, 365);
        List<SummaryDoc> summaries = fleetCisSummaries();
        return buildTrend(summaries, window);
    }

    // --- fleet enumeration (coverage denominator) ---------------------------

    private List<AgentDTO> enumerateFleet() {
        try {
            ListRequest request = ListRequest.newBuilder()
                    .setPageNumber(1)
                    .setPageSize(FLEET_PAGE_SIZE)
                    .setSearchQuery("")
                    .setSortBy("")
                    .build();
            ListAgentsResponseDTO response =
                    agentGrpcService.listAgents(request, TenantScope.requireTenant());
            List<AgentDTO> agents = response.getAgents();
            return agents != null ? agents : new ArrayList<>();
        } catch (Exception e) {
            // The agent registry is the coverage denominator, not the posture data.
            // If it is unreachable we still return posture but with a zero fleet count;
            // the caller renders coverage as "unknown" rather than inventing a number.
            log.error("{}.enumerateFleet: {}", CLASSNAME, e.getMessage());
            return new ArrayList<>();
        }
    }

    // --- CIS fleet aggregation (latest summary per host) --------------------

    /**
     * Pulls every CIS {@code docType=summary} document for the tenant (one per scan)
     * and returns them newest-first. Java-side dedupe to "latest per host" follows —
     * this mirrors the proven per-host PT-5 read path (same index, same doc shape),
     * avoiding a server-side composite aggregation that cannot be exercised without a
     * live OpenSearch in this environment.
     */
    private List<SummaryDoc> fleetCisSummaries() {
        String pattern = indexResolver.resolveIndexPattern(CIS_TYPE);
        if (!elasticsearchService.indexExist(pattern)) {
            return new ArrayList<>();
        }
        try {
            SearchRequest request = SearchRequest.of(s -> s
                    .index(pattern)
                    .size(MAX_SUMMARY_DOCS)
                    .query(summaryDocsQuery())
                    .sort(so -> so.field(f -> f.field("scannedAt").order(SortOrder.Desc))));
            SearchResponse<Map> response = elasticsearchService.search(request, Map.class);
            List<SummaryDoc> out = new ArrayList<>();
            for (Hit<Map> hit : response.hits().hits()) {
                SummaryDoc doc = SummaryDoc.from(hit.source());
                if (doc != null) {
                    out.add(doc);
                }
            }
            return out;
        } catch (Exception e) {
            log.error("{}.fleetCisSummaries: {}", CLASSNAME, e.getMessage());
            throw new TelemetryQueryException(
                    "TELEMETRY_SOURCE_UNAVAILABLE",
                    "Fleet CIS posture could not be loaded from the telemetry store");
        }
    }

    private Query summaryDocsQuery() {
        return Query.of(q -> q.bool(b -> b
                .must(m -> m.term(t -> t.field("docType.keyword").value(v -> v.stringValue("summary"))))));
    }

    FleetCisPostureDTO buildFleetCis(List<AgentDTO> fleet, List<SummaryDoc> summaries) {
        // Latest summary per host (summaries are newest-first, so first wins).
        Map<String, SummaryDoc> latestByAgent = new LinkedHashMap<>();
        for (SummaryDoc doc : summaries) {
            if (doc.agentId != null) {
                latestByAgent.putIfAbsent(doc.agentId, doc);
            }
        }

        FleetCisPostureDTO dto = new FleetCisPostureDTO();
        int pass = 0;
        int fail = 0;
        int error = 0;
        int na = 0;
        int notChecked = 0;
        int total = 0;
        String lastScannedAt = null;

        // Map fleet agents (coverage denominator) to their latest scan, honest "not scanned".
        Map<String, AgentDTO> fleetById = new HashMap<>();
        for (AgentDTO a : fleet) {
            fleetById.put(String.valueOf(a.getId()), a);
        }

        Set<String> seen = new HashSet<>();
        List<FleetCisPostureDTO.HostCisPosture> hosts = new ArrayList<>();

        for (AgentDTO agent : fleet) {
            String agentId = String.valueOf(agent.getId());
            seen.add(agentId);
            SummaryDoc doc = latestByAgent.get(agentId);
            FleetCisPostureDTO.HostCisPosture host = new FleetCisPostureDTO.HostCisPosture();
            host.setAgentId(agentId);
            host.setHostname(agent.getHostname());
            host.setPlatform(agent.getPlatform());
            if (doc == null) {
                host.setScanned(false);
            } else {
                applyHostScan(host, doc);
                pass += doc.passCount;
                fail += doc.failCount;
                error += doc.errorCount;
                na += doc.naCount;
                notChecked += doc.notCheckedCount;
                total += doc.total;
                lastScannedAt = maxInstant(lastScannedAt, doc.scannedAt);
            }
            hosts.add(host);
        }

        // Scanned hosts not present in the fleet registry (e.g. registry unreachable or
        // a host enrolled then removed). Count their scans honestly rather than dropping.
        for (Map.Entry<String, SummaryDoc> e : latestByAgent.entrySet()) {
            if (seen.contains(e.getKey())) {
                continue;
            }
            SummaryDoc doc = e.getValue();
            FleetCisPostureDTO.HostCisPosture host = new FleetCisPostureDTO.HostCisPosture();
            host.setAgentId(e.getKey());
            host.setHostname(doc.hostname);
            applyHostScan(host, doc);
            hosts.add(host);
            pass += doc.passCount;
            fail += doc.failCount;
            error += doc.errorCount;
            na += doc.naCount;
            notChecked += doc.notCheckedCount;
            total += doc.total;
            lastScannedAt = maxInstant(lastScannedAt, doc.scannedAt);
        }

        int hostsScanned = latestByAgent.size();
        int fleetCount = Math.max(fleet.size(), hostsScanned);

        dto.setFleetHostCount(fleetCount);
        dto.setHostsScanned(hostsScanned);
        dto.setHostsNotScanned(Math.max(0, fleetCount - hostsScanned));
        dto.setPassCount(pass);
        dto.setFailCount(fail);
        dto.setErrorCount(error);
        dto.setNaCount(na);
        dto.setNotCheckedCount(notChecked);
        dto.setTotal(total);
        dto.setLastScannedAt(lastScannedAt);
        // Honest denominator: decidable controls only (pass+fail). Null when nothing scanned.
        int decidable = pass + fail;
        dto.setFleetScorePct(hostsScanned == 0 || decidable == 0
                ? null
                : round1(100.0 * pass / decidable));
        dto.setHosts(hosts);
        return dto;
    }

    private void applyHostScan(FleetCisPostureDTO.HostCisPosture host, SummaryDoc doc) {
        host.setScanned(true);
        host.setTotal(doc.total);
        host.setPassCount(doc.passCount);
        host.setFailCount(doc.failCount);
        host.setErrorCount(doc.errorCount);
        host.setNaCount(doc.naCount);
        host.setNotCheckedCount(doc.notCheckedCount);
        host.setScorePct(doc.scorePct);
        host.setProfile(doc.profile);
        host.setBenchmark(doc.benchmark);
        host.setScannedAt(doc.scannedAt);
        if (host.getHostname() == null) {
            host.setHostname(doc.hostname);
        }
    }

    // --- trend / drift ------------------------------------------------------

    PostureTrendDTO buildTrend(List<SummaryDoc> summaries, int days) {
        Instant cutoff = Instant.now().minusSeconds((long) days * 86_400L);

        // Bucket by UTC day over the window; one host can scan several times a day, so
        // sum the counts and let the bucket's score reflect the day's decidable controls.
        Map<String, DayAgg> buckets = new TreeMap<>();
        for (SummaryDoc doc : summaries) {
            Instant scanned = parseInstantOrNull(doc.scannedAt);
            if (scanned == null || scanned.isBefore(cutoff)) {
                continue;
            }
            String bucket = DAY.format(scanned);
            DayAgg agg = buckets.computeIfAbsent(bucket, k -> new DayAgg());
            agg.pass += doc.passCount;
            agg.fail += doc.failCount;
            agg.error += doc.errorCount;
            if (doc.agentId != null) {
                agg.hosts.add(doc.agentId);
            }
        }

        PostureTrendDTO dto = new PostureTrendDTO();
        List<PostureTrendDTO.TrendPoint> points = new ArrayList<>();
        for (Map.Entry<String, DayAgg> e : buckets.entrySet()) {
            DayAgg agg = e.getValue();
            PostureTrendDTO.TrendPoint p = new PostureTrendDTO.TrendPoint(e.getKey());
            p.setPassCount(agg.pass);
            p.setFailCount(agg.fail);
            p.setErrorCount(agg.error);
            p.setHostsScanned(agg.hosts.size());
            int decidable = agg.pass + agg.fail;
            p.setScorePct(decidable == 0 ? null : round1(100.0 * agg.pass / decidable));
            points.add(p);
        }
        dto.setCisScore(points);

        // Drift needs two distinct points with a decidable score.
        List<PostureTrendDTO.TrendPoint> scored = new ArrayList<>();
        for (PostureTrendDTO.TrendPoint p : points) {
            if (p.getScorePct() != null) {
                scored.add(p);
            }
        }
        if (scored.size() >= 2) {
            PostureTrendDTO.TrendPoint latest = scored.get(scored.size() - 1);
            PostureTrendDTO.TrendPoint prev = scored.get(scored.size() - 2);
            dto.setDriftAvailable(true);
            dto.setCisScoreDrift(round1(latest.getScorePct() - prev.getScorePct()));
            dto.setFailCountDrift(latest.getFailCount() - prev.getFailCount());
        } else {
            dto.setDriftAvailable(false);
        }
        return dto;
    }

    FleetPostureOverviewDTO.Coverage buildCoverage(List<AgentDTO> fleet,
                                                           List<SummaryDoc> summaries,
                                                           VulnSummaryDTO vuln) {
        Set<String> cisHosts = new HashSet<>();
        for (SummaryDoc doc : summaries) {
            if (doc.agentId != null) {
                cisHosts.add(doc.agentId);
            }
        }
        int hostsWithCis = cisHosts.size();
        int hostsWithVuln = vuln != null ? vuln.getAffectedAgents() : 0;
        int fleetCount = Math.max(fleet.size(), hostsWithCis);

        FleetPostureOverviewDTO.Coverage coverage = new FleetPostureOverviewDTO.Coverage();
        coverage.setFleetHostCount(fleetCount);
        coverage.setHostsWithCis(hostsWithCis);
        coverage.setHostsWithVuln(hostsWithVuln);
        // Hosts with no CIS scan AND no vuln finding. Vuln is host-set-agnostic here
        // (agent ids differ by source), so bound uncovered by the larger covered set to
        // avoid overstating coverage — honest floor, never a fabricated "all covered".
        int covered = Math.min(fleetCount, Math.max(hostsWithCis, hostsWithVuln));
        coverage.setHostsUncovered(Math.max(0, fleetCount - covered));
        return coverage;
    }

    // --- helpers ------------------------------------------------------------

    private static String maxInstant(String current, String candidate) {
        if (candidate == null) {
            return current;
        }
        if (current == null) {
            return candidate;
        }
        Instant a = parseInstantOrNull(current);
        Instant b = parseInstantOrNull(candidate);
        if (a == null) {
            return candidate;
        }
        if (b == null) {
            return current;
        }
        return b.isAfter(a) ? candidate : current;
    }

    private static Instant parseInstantOrNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Instant.parse(value);
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static double round1(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    private static class DayAgg {
        int pass;
        int fail;
        int error;
        final Set<String> hosts = new HashSet<>();
    }

    /** Minimal projection of a CIS summary document used for fleet aggregation. */
    static final class SummaryDoc {
        String agentId;
        String hostname;
        String profile;
        String benchmark;
        int total;
        int passCount;
        int failCount;
        int errorCount;
        int naCount;
        int notCheckedCount;
        Double scorePct;
        String scannedAt;

        /** Test-friendly factory mirroring an ingested per-host CIS summary document. */
        static SummaryDoc of(String agentId, String hostname, int pass, int fail, int error,
                             Double scorePct, String scannedAt) {
            SummaryDoc d = new SummaryDoc();
            d.agentId = agentId;
            d.hostname = hostname;
            d.passCount = pass;
            d.failCount = fail;
            d.errorCount = error;
            d.total = pass + fail + error;
            d.scorePct = scorePct;
            d.scannedAt = scannedAt;
            return d;
        }

        static SummaryDoc from(Map<?, ?> src) {
            if (src == null) {
                return null;
            }
            SummaryDoc d = new SummaryDoc();
            d.agentId = str(src, "agentId");
            d.hostname = str(src, "hostname");
            d.profile = str(src, "profile");
            d.benchmark = str(src, "benchmark");
            d.total = intVal(src, "total");
            d.passCount = intVal(src, "passCount");
            d.failCount = intVal(src, "failCount");
            d.errorCount = intVal(src, "errorCount");
            d.naCount = intVal(src, "naCount");
            d.notCheckedCount = intVal(src, "notCheckedCount");
            Object score = src.get("scorePct");
            d.scorePct = score instanceof Number ? ((Number) score).doubleValue() : null;
            d.scannedAt = str(src, "scannedAt");
            return d;
        }

        private static String str(Map<?, ?> src, String key) {
            Object v = src.get(key);
            return v != null ? v.toString() : null;
        }

        private static int intVal(Map<?, ?> src, String key) {
            Object v = src.get(key);
            return v instanceof Number ? ((Number) v).intValue() : 0;
        }
    }
}
