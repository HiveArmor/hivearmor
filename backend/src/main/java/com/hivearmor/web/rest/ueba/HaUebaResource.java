package com.hivearmor.web.rest.ueba;

import com.hivearmor.domain.ueba.HaUebaBaseline;
import com.hivearmor.domain.ueba.HaUebaDeviation;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.ueba.AnomalyCountsDTO;
import com.hivearmor.repository.ueba.HaUebaBaselineRepository;
import com.hivearmor.repository.ueba.HaUebaDeviationRepository;
import com.hivearmor.repository.ueba.HaUebaPeerGroupRepository;
import com.hivearmor.repository.ueba.RiskTrendPointDTO;
import com.hivearmor.repository.ueba.UserRiskDTO;
import jakarta.validation.constraints.NotBlank;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;

/**
 * REST controller for the UEBA baseline and deviation endpoints.
 *
 * <p>Exposes six tenant-scoped GET endpoints under {@code /api/ha-ueba/} for the
 * risk dashboard and entity timeline chart in the frontend. All endpoints require
 * {@code ROLE_ANALYST}, {@code ROLE_SOC_MANAGER}, or {@code ROLE_ADMIN} authority.
 *
 * <p>Tenant resolution is handled by {@link com.hivearmor.multitenancy.TenantContextFilter}
 * which sets {@link TenantContext} from the authenticated user's JWT. The tenant prefix
 * (stored in the {@code tenant_id} column) is read via {@link TenantContext#get()}.
 *
 * <p>Every OpenSearch lookup (when applicable) obtains its index pattern from
 * {@link MsspIndexResolver} — no raw {@code v3-hive-*} string is constructed in this class.
 */
@RestController
@RequestMapping("/api/ha-ueba")
public class HaUebaResource {

    private static final Logger log = LoggerFactory.getLogger(HaUebaResource.class);

    private final HaUebaDeviationRepository deviationRepository;
    private final HaUebaPeerGroupRepository peerGroupRepository;
    private final HaUebaBaselineRepository baselineRepository;
    private final MsspIndexResolver indexResolver;

    public HaUebaResource(HaUebaDeviationRepository deviationRepository,
                          HaUebaPeerGroupRepository peerGroupRepository,
                          HaUebaBaselineRepository baselineRepository,
                          MsspIndexResolver indexResolver) {
        this.deviationRepository = deviationRepository;
        this.peerGroupRepository = peerGroupRepository;
        this.baselineRepository = baselineRepository;
        this.indexResolver = indexResolver;
    }

    /**
     * Returns tenant-scoped deviations, optionally filtered to rows since a given timestamp.
     *
     * <p>Used by the risk dashboard and deviation list views.
     *
     * @param since optional lower bound (inclusive) on {@code run_ts}; if null, returns all
     * @return list of deviation DTOs ordered by run timestamp descending
     */
    @GetMapping("/deviations")
    @PreAuthorize("hasAnyAuthority('ROLE_ANALYST','ROLE_SOC_MANAGER','ROLE_ADMIN')")
    public List<DeviationDTO> deviations(@RequestParam(required = false) Instant since) {
        String tenantId = TenantContext.get();
        log.debug("GET /deviations tenantId={} since={}", tenantId, since);
        return deviationRepository.findAllByTenantIdSince(tenantId, since).stream()
            .map(DeviationDTO::from)
            .toList();
    }

    /**
     * Returns per-user aggregate risk scores for the current tenant.
     *
     * <p>Each entry sums all deviation points for a user and counts their anomalies.
     * Results are ordered by total score descending.
     *
     * @return list of per-user risk score DTOs
     */
    @GetMapping("/risk-scores")
    @PreAuthorize("hasAnyAuthority('ROLE_ANALYST','ROLE_SOC_MANAGER','ROLE_ADMIN')")
    public List<UserRiskDTO> riskScores() {
        String tenantId = TenantContext.get();
        log.debug("GET /risk-scores tenantId={}", tenantId);
        return deviationRepository.aggregateRiskByUser(tenantId);
    }

    /**
     * Returns the entity timeline for a specific user — deviation data points
     * and baseline bands for the scatter chart.
     *
     * @param userId the user identifier to query (required, must not be blank)
     * @return timeline DTO containing deviation points and baseline bands
     */
    @GetMapping("/entity-timeline")
    @PreAuthorize("hasAnyAuthority('ROLE_ANALYST','ROLE_SOC_MANAGER','ROLE_ADMIN')")
    public EntityTimelineDTO entityTimeline(@RequestParam("userId") @NotBlank String userId) {
        String tenantId = TenantContext.get();
        log.debug("GET /entity-timeline tenantId={} userId={}", tenantId, userId);

        List<HaUebaDeviation> deviations = deviationRepository
            .findAllByTenantIdAndUserIdOrderByRunTsAsc(tenantId, userId);

        List<HaUebaBaseline> baselines = baselineRepository.findLatestForUser(userId);

        return EntityTimelineDTO.of(deviations, baselines);
    }

    /**
     * Returns tenant-scoped peer-group assignments.
     *
     * @return list of peer-group DTOs
     */
    @GetMapping("/peer-groups")
    @PreAuthorize("hasAnyAuthority('ROLE_ANALYST','ROLE_SOC_MANAGER','ROLE_ADMIN')")
    public List<PeerGroupDTO> peerGroups() {
        String tenantId = TenantContext.get();
        log.debug("GET /peer-groups tenantId={}", tenantId);
        return peerGroupRepository.findAllByTenantId(tenantId).stream()
            .map(PeerGroupDTO::from)
            .toList();
    }

    /**
     * Returns the 30-day per-day aggregate risk trend for the current tenant.
     *
     * <p>One data point per day with the total deviation points awarded that day.
     *
     * @return list of daily risk trend points ordered by date ascending
     */
    @GetMapping("/risk-trend")
    @PreAuthorize("hasAnyAuthority('ROLE_ANALYST','ROLE_SOC_MANAGER','ROLE_ADMIN')")
    public List<RiskTrendPointDTO> riskTrend() {
        String tenantId = TenantContext.get();
        log.debug("GET /risk-trend tenantId={}", tenantId);
        return deviationRepository.aggregateRiskDailyForLast30Days(tenantId);
    }

    /**
     * Returns per-tier anomaly counts for the current tenant.
     *
     * <p>Counts deviation rows falling into each scoring tier (10, 25, 50 points).
     *
     * @return anomaly counts DTO with tier10, tier25, tier50 fields
     */
    @GetMapping("/anomaly-counts")
    @PreAuthorize("hasAnyAuthority('ROLE_ANALYST','ROLE_SOC_MANAGER','ROLE_ADMIN')")
    public AnomalyCountsDTO anomalyCounts() {
        String tenantId = TenantContext.get();
        log.debug("GET /anomaly-counts tenantId={}", tenantId);
        return deviationRepository.countByTier(tenantId);
    }
}
