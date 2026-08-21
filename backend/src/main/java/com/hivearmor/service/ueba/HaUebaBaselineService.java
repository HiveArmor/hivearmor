package com.hivearmor.service.ueba;

import com.hivearmor.domain.UtmClient;
import com.hivearmor.domain.ueba.GroupSource;
import com.hivearmor.domain.ueba.HaUebaBaseline;
import com.hivearmor.domain.ueba.HaUebaPeerGroup;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.repository.UtmClientRepository;
import com.hivearmor.repository.ueba.HaUebaBaselineRepository;
import com.hivearmor.repository.ueba.HaUebaPeerGroupRepository;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.ueba.metrics.MetricObservationReader;
import com.hivearmor.service.ueba.metrics.UebaMetrics;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.stream.DoubleStream;

/**
 * UEBA Baseline Service — clusters users into peer groups and computes daily baselines.
 *
 * <p>This service performs two main operations:
 * <ol>
 *   <li><strong>Peer-group clustering</strong> ({@link #clusterUsers(String, LocalDate)}):
 *       For each active user, assigns a peer group based on their Active Directory department
 *       (if non-empty) or the IPv4 /24 subnet of their most recent source IP (fallback).
 *       Upserts one {@link HaUebaPeerGroup} row per user.</li>
 *   <li><strong>Baseline computation</strong> ({@link #computeBaselines(LocalDate)}):
 *       For each peer group and each metric in {@link UebaMetrics#METRIC_SET}, aggregates
 *       observations over a 30-day window and stores the arithmetic mean and sample standard
 *       deviation.</li>
 * </ol>
 *
 * <p><strong>OpenSearch invariants:</strong> Every OpenSearch index pattern is obtained
 * from {@link MsspIndexResolver} and every query is expressed through {@code SearchUtil} DSL.
 * No raw {@code v3-hive-*} strings or raw JSON bodies are used in this class or its
 * dependencies.
 *
 * <p>The daily baseline pass is triggered by {@link #runDailyBaseline()} at 03:00
 * local server time via {@code @Scheduled}. It clusters users for every active
 * tenant and then computes baselines across all peer groups in a single invocation.
 *
 * @see ActiveUserDirectory
 * @see MetricObservationReader
 */
@Service
public class HaUebaBaselineService {

    private static final Logger log = LoggerFactory.getLogger(HaUebaBaselineService.class);

    private final MsspIndexResolver indexResolver;
    private final OpensearchClientBuilder openSearchClient;
    private final HaUebaPeerGroupRepository peerGroupRepository;
    private final HaUebaBaselineRepository baselineRepository;
    private final ActiveUserDirectory activeUsers;
    private final MetricObservationReader observationReader;
    private final UtmClientRepository clientRepository;

    public HaUebaBaselineService(
            MsspIndexResolver indexResolver,
            OpensearchClientBuilder openSearchClient,
            HaUebaPeerGroupRepository peerGroupRepository,
            HaUebaBaselineRepository baselineRepository,
            ActiveUserDirectory activeUsers,
            MetricObservationReader observationReader,
            UtmClientRepository clientRepository) {
        this.indexResolver = indexResolver;
        this.openSearchClient = openSearchClient;
        this.peerGroupRepository = peerGroupRepository;
        this.baselineRepository = baselineRepository;
        this.activeUsers = activeUsers;
        this.observationReader = observationReader;
        this.clientRepository = clientRepository;
    }

    /**
     * Scheduled daily baseline pass — runs at 03:00 local server time.
     *
     * <p>For every active tenant (verified licence), clusters users into peer groups
     * via {@link #clusterUsers(String, LocalDate)}, then computes baselines for all
     * peer groups via {@link #computeBaselines(LocalDate)}.
     *
     * <p>This method is the single entry point for the daily UEBA baseline pass.
     * It must complete within a reasonable time frame; long-running tenants do not
     * block other tenants since clustering is sequential but lightweight.
     */
    @Scheduled(cron = "0 0 3 * * ?")
    public void runDailyBaseline() {
        LocalDate today = LocalDate.now();
        log.info("UEBA baseline pass started for {}", today);

        List<UtmClient> activeTenants = clientRepository.findAll().stream()
            .filter(c -> Boolean.TRUE.equals(c.isClientLicenceVerified()))
            .toList();

        log.info("UEBA baseline pass: processing {} active tenant(s)", activeTenants.size());

        for (UtmClient tenant : activeTenants) {
            String tenantId = tenant.getClientPrefix();
            try {
                clusterUsers(tenantId, today);
            } catch (Exception e) {
                log.warn("UEBA peer-group clustering failed for tenantId={}: {}", tenantId, e.getMessage());
            }
        }

        computeBaselines(today);

        log.info("UEBA baseline pass finished for {}", today);
    }

    /**
     * Clusters all active users for a given tenant into peer groups.
     *
     * <p>For each active user:
     * <ul>
     *   <li>If the user's AD department is non-null and non-blank → assigns
     *       {@code group_kind = AD_DEPARTMENT}, {@code group_key = department}</li>
     *   <li>Otherwise → derives the IPv4 /24 subnet from the user's most recent source IP
     *       and assigns {@code group_kind = IPV4_SLASH24},
     *       {@code group_key = &lt;a&gt;.&lt;b&gt;.&lt;c&gt;.0/24}</li>
     * </ul>
     *
     * <p>Upserts one {@link HaUebaPeerGroup} row per user via the repository.
     *
     * @param tenantId the tenant to cluster
     * @param today    the computation date for the peer-group assignment
     */
    public void clusterUsers(String tenantId, LocalDate today) {
        List<ActiveUser> users = activeUsers.listByTenant(tenantId);
        log.info("UEBA peer-group clustering: tenantId={}, activeUsers={}", tenantId, users.size());

        for (ActiveUser u : users) {
            String groupKey;
            GroupSource groupSource;

            if (u.getAdDepartment() != null && !u.getAdDepartment().isBlank()) {
                groupKey = u.getAdDepartment();
                groupSource = GroupSource.AD_DEPT;
            } else {
                groupKey = subnet24(u.getMostRecentSrcIp());
                groupSource = GroupSource.SUBNET24;
            }

            // Upsert: find existing row for this (userId, computedOn) or create new
            HaUebaPeerGroup row = peerGroupRepository
                .findByUserIdAndComputedOn(u.getUserId(), today)
                .orElseGet(HaUebaPeerGroup::new);
            row.setUserId(u.getUserId());
            row.setGroupKey(groupKey);
            row.setGroupSource(groupSource);
            row.setTenantId(u.getTenantId());
            row.setComputedOn(today);
            peerGroupRepository.save(row);
        }

        log.info("UEBA peer-group clustering complete: tenantId={}", tenantId);
    }

    /**
     * Computes baselines for all peer groups on the given date.
     *
     * <p>For each distinct group key and each metric in {@link UebaMetrics#METRIC_SET},
     * aggregates observations over the preceding 30-day window and persists the
     * arithmetic mean and sample standard deviation as a {@link HaUebaBaseline} row.
     *
     * <p>Skips a (groupKey, metric) combination when the peer group has fewer than
     * two members (avoids stddev of a single sample).
     *
     * @param today the computation date
     */
    public void computeBaselines(LocalDate today) {
        List<String> groupKeys = peerGroupRepository.distinctGroupKeysForDay(today);
        log.info("UEBA baseline computation: {} distinct peer groups for {}", groupKeys.size(), today);

        for (String groupKey : groupKeys) {
            List<String> members = peerGroupRepository.userIdsForGroupOnDay(groupKey, today);

            if (members.size() < 2) {
                log.debug("Skipping baseline for groupKey={}: only {} member(s)", groupKey, members.size());
                continue;
            }

            // Resolve tenantId from the peer group's first member
            String tenantId = peerGroupRepository
                .findByUserIdAndComputedOn(members.get(0), today)
                .map(HaUebaPeerGroup::getTenantId)
                .orElse(null);

            for (String metric : UebaMetrics.METRIC_SET) {
                try {
                    DoubleStream observations = observationReader.readDailyObservations(
                        metric, members, today.minusDays(30), today);
                    double[] values = observations.toArray();

                    if (values.length == 0) {
                        continue;
                    }

                    double mean = mean(values);
                    double stddev = sampleStddev(values, mean);

                    HaUebaBaseline row = baselineRepository
                        .findByGroupKeyAndMetricNameAndComputedOn(groupKey, metric, today)
                        .orElseGet(HaUebaBaseline::new);
                    row.setGroupKey(groupKey);
                    row.setMetricName(metric);
                    row.setComputedOn(today);
                    row.setBaselineMean(mean);
                    row.setBaselineStddev(stddev);
                    row.setSampleSize(values.length);
                    row.setTenantId(tenantId);
                    baselineRepository.save(row);
                } catch (Exception e) {
                    log.warn("Baseline computation failed for groupKey={}, metric={}: {}",
                        groupKey, metric, e.getMessage());
                }
            }
        }
    }

    /**
     * Derives the IPv4 /24 subnet notation from a full IPv4 address.
     *
     * <p>Example: {@code "10.20.30.40"} → {@code "10.20.30.0/24"}
     *
     * @param ipv4 an IPv4 address in dotted-quad notation
     * @return the /24 subnet string
     */
    static String subnet24(String ipv4) {
        if (ipv4 == null || ipv4.isEmpty()) {
            return "0.0.0.0/24";
        }
        int lastDot = ipv4.lastIndexOf('.');
        if (lastDot < 0) {
            return ipv4 + ".0/24";
        }
        return ipv4.substring(0, lastDot) + ".0/24";
    }

    /**
     * Computes the arithmetic mean of an array of values.
     */
    static double mean(double[] values) {
        if (values.length == 0) return 0.0;
        double sum = 0.0;
        for (double v : values) {
            sum += v;
        }
        return sum / values.length;
    }

    /**
     * Computes the sample standard deviation given a pre-computed mean.
     * Uses Bessel's correction (divides by n-1 for unbiased estimate).
     */
    static double sampleStddev(double[] values, double mean) {
        if (values.length < 2) return 0.0;
        double sumSquaredDiff = 0.0;
        for (double v : values) {
            double diff = v - mean;
            sumSquaredDiff += diff * diff;
        }
        return Math.sqrt(sumSquaredDiff / (values.length - 1));
    }

    // --- Accessor for testing ---

    MsspIndexResolver getIndexResolver() {
        return indexResolver;
    }
}
