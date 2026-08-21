package com.hivearmor.service.mssp;

import com.hivearmor.domain.HaClient;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.repository.HaTenantUserRepository;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.mssp.dto.TenantDetailDTO;
import com.hivearmor.service.mssp.dto.TenantHealthDTO;
import com.hivearmor.service.mssp.dto.UpdateTenantRequest;
import org.opensearch.client.opensearch._types.aggregations.Aggregate;
import org.opensearch.client.opensearch._types.aggregations.DateHistogramBucket;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch._types.query_dsl.RangeQuery;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Service for MSSP tenant read and update operations.
 *
 * <p>Sprint 23 — T03 introduced the {@code list} method.
 * T04 adds {@code getById} and {@code update} methods, along with a private
 * {@code toDetail} helper that queries OpenSearch for per-tenant EPS sparkline
 * and seven-day alert trend data.
 *
 * <p>Every OpenSearch call is wrapped in a {@code try/catch} that logs at
 * {@code WARN} level with only the numeric tenant {@code id} in the MDC —
 * never {@code name}, {@code clientPrefix}, or raw payload content.
 */
@Service
@Transactional(readOnly = true)
public class MsspTenantService {

    private static final Logger log = LoggerFactory.getLogger(MsspTenantService.class);

    /** MDC key used when logging per-tenant OpenSearch failures. */
    private static final String MDC_TENANT_ID = "tenantId";

    /** Number of one-minute EPS sparkline buckets. */
    private static final int EPS_SPARKLINE_BUCKETS = 60;

    /** Number of daily alert-trend buckets. */
    private static final int ALERT_TREND_DAYS = 7;

    private final HaClientRepository clients;
    private final HaTenantUserRepository memberships;
    private final MsspIndexResolver indexResolver;
    private final OpensearchClientBuilder os;
    private final Clock clock;

    public MsspTenantService(HaClientRepository clients,
                              HaTenantUserRepository memberships,
                              MsspIndexResolver indexResolver,
                              OpensearchClientBuilder os,
                              Clock clock) {
        this.clients       = clients;
        this.memberships   = memberships;
        this.indexResolver = indexResolver;
        this.os            = os;
        this.clock         = clock;
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Returns a page of {@link TenantHealthDTO} stubs for MSSP-managed tenants.
     *
     * <p>Loads all MSSP-managed clients with a non-null {@code clientPrefix},
     * optionally filters by {@code q} (case-insensitive substring match on
     * {@code name} or {@code clientPrefix}), maps each client to a stub DTO
     * (eps=0, healthStatus="OFFLINE", lastEventAt=null, userCount from repository),
     * and returns the requested page slice.
     *
     * @param q        optional search string; when non-blank, only clients whose
     *                 {@code name} or {@code clientPrefix} contains {@code q}
     *                 (case-insensitive) are included
     * @param pageable pagination parameters
     * @return page of TenantHealthDTO stubs
     */
    public Page<TenantHealthDTO> list(String q, Pageable pageable) {
        // Load all MSSP-managed clients with a non-null clientPrefix
        List<HaClient> all = clients.findByMsspManagedTrueAndClientPrefixIsNotNull();

        // Filter by q when non-blank (case-insensitive substring match on name or clientPrefix)
        List<HaClient> filtered;
        if (q != null && !q.isBlank()) {
            String lower = q.toLowerCase();
            filtered = all.stream()
                .filter(c -> (c.getName() != null && c.getName().toLowerCase().contains(lower))
                          || (c.getClientPrefix() != null && c.getClientPrefix().toLowerCase().contains(lower)))
                .toList();
        } else {
            filtered = all;
        }

        long totalCount = filtered.size();

        // Apply manual pagination over the in-memory list
        int start = (int) pageable.getOffset();
        int end = Math.min(start + pageable.getPageSize(), (int) totalCount);
        List<HaClient> pageSlice = (start >= filtered.size())
            ? List.of()
            : filtered.subList(start, end);

        // Map to TenantHealthDTO stubs
        List<TenantHealthDTO> content = pageSlice.stream()
            .map(c -> new TenantHealthDTO(
                c.getId(),
                c.getName(),
                c.getClientPrefix(),
                (int) memberships.countByClientId(c.getId()),
                /* eps */          0L,
                /* healthStatus */ "OFFLINE",
                /* lastEventAt */  null
            ))
            .toList();

        return new PageImpl<>(content, pageable, totalCount);
    }

    /**
     * Returns the detailed view of an MSSP-managed tenant by its primary key.
     *
     * <p>Returns {@link Optional#empty()} when the id does not exist, or when the
     * row exists but {@code mssp_managed = false} or {@code client_prefix IS NULL}.
     *
     * @param id the {@code ha_client.id} to look up
     * @return an {@link Optional} containing the {@link TenantDetailDTO}, or empty
     */
    @Transactional(readOnly = true)
    public Optional<TenantDetailDTO> getById(Long id) {
        return clients.findById(id)
            .filter(c -> c.isMsspManaged() && c.getClientPrefix() != null)
            .map(this::toDetail);
    }

    /**
     * Updates the four mutable fields of a tenant and returns the refreshed detail.
     *
     * <p>The {@code clientPrefix} field is intentionally absent from
     * {@link UpdateTenantRequest} — it is never written here. Spring's default
     * {@code FAIL_ON_UNKNOWN_PROPERTIES = false} behaviour already silences any
     * stray {@code clientPrefix} key in the request body before it reaches this
     * method.
     *
     * @param id  the {@code ha_client.id} of the tenant to update
     * @param req the validated update payload
     * @return refreshed {@link TenantDetailDTO} after the save
     * @throws NotFoundException if the id does not exist or the row is not MSSP-managed
     */
    @Transactional
    public TenantDetailDTO update(Long id, UpdateTenantRequest req) {
        HaClient client = clients.findById(id)
            .filter(c -> c.isMsspManaged() && c.getClientPrefix() != null)
            .orElseThrow(() -> new NotFoundException("tenant", id));

        // Write ONLY these four fields — NEVER clientPrefix
        client.setName(req.name());
        client.setMaxUsers(req.maxUsers());
        client.setLicenceType(req.licenceType());
        client.setContactEmail(req.contactEmail());
        clients.save(client);
        return toDetail(client);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Maps a single {@link HaClient} to a {@link TenantDetailDTO}, including live
     * OpenSearch data for EPS, the 60-element sparkline, and the 7-element daily
     * alert trend.
     *
     * <p>All OpenSearch calls use {@link MsspIndexResolver#resolveIndexPatternForPrefix}
     * — never string concatenation.
     *
     * <p>On any OpenSearch failure, arrays are filled with zeros, a {@code WARN} log
     * is emitted containing <em>only</em> the numeric tenant {@code id} in the MDC.
     *
     * @param client MSSP-managed tenant with a non-null {@code clientPrefix}
     * @return populated {@link TenantDetailDTO}
     */
    private TenantDetailDTO toDetail(HaClient client) {
        int userCount = (int) memberships.countByClientId(client.getId());

        long   eps           = safeEps(client);
        long[] epsSparkline  = safeEpsSparkline(client);
        long[] alertsTrend7d = safeAlertsTrend7d(client);

        return new TenantDetailDTO(
            client.getId(),
            client.getName(),
            client.getClientPrefix(),
            client.getMaxUsers() != null ? client.getMaxUsers() : 0,
            client.getLicenceType(),
            client.getContactEmail(),
            userCount,
            eps,
            epsSparkline,
            alertsTrend7d
        );
    }

    /**
     * Returns the current EPS for the tenant by counting documents in the last
     * 60 seconds and dividing by 60. Returns {@code 0} on any failure.
     */
    private long safeEps(HaClient client) {
        try {
            String pattern = indexResolver.resolveIndexPatternForPrefix("alert",
                    client.getClientPrefix());

            Instant now          = clock.instant();
            Instant oneMinuteAgo = now.minusSeconds(60);
            String  since        = oneMinuteAgo.toString();

            Query rangeQuery = Query.of(q -> q.range(
                RangeQuery.of(r -> r.field("@timestamp").gte(
                    org.opensearch.client.json.JsonData.of(since)))));

            SearchRequest req = SearchRequest.of(r -> r
                .index(pattern)
                .query(rangeQuery)
                .size(0));

            @SuppressWarnings("rawtypes")
            SearchResponse<Void> resp = os.execute(c -> c.search(req, Void.class));

            long docCount = resp.hits().total() != null ? resp.hits().total().value() : 0L;
            return docCount / 60L;
        } catch (Exception ex) {
            logWarnTenantId(client.getId(), "Failed to compute EPS", ex);
            return 0L;
        }
    }

    /**
     * Returns the 60-element EPS sparkline by issuing a date-histogram aggregation
     * over the last 60 one-minute buckets ending at {@code clock.instant()}.
     * Returns an all-zeros array on any failure.
     */
    private long[] safeEpsSparkline(HaClient client) {
        long[] result = new long[EPS_SPARKLINE_BUCKETS];
        try {
            String  pattern = indexResolver.resolveIndexPatternForPrefix("alert",
                    client.getClientPrefix());
            Instant now     = clock.instant();
            // Start of the window: 60 minutes ago, truncated to minute boundary
            Instant windowStart = now.minus(EPS_SPARKLINE_BUCKETS, ChronoUnit.MINUTES)
                                     .truncatedTo(ChronoUnit.MINUTES);
            String from = windowStart.toString();
            String to   = now.toString();

            Query rangeQuery = Query.of(q -> q.range(
                RangeQuery.of(r -> r.field("@timestamp")
                    .gte(org.opensearch.client.json.JsonData.of(from))
                    .lt(org.opensearch.client.json.JsonData.of(to)))));

            SearchRequest req = SearchRequest.of(r -> r
                .index(pattern)
                .query(rangeQuery)
                .size(0)
                .aggregations("eps_buckets", a -> a.dateHistogram(dh -> dh
                    .field("@timestamp")
                    .fixedInterval(fi -> fi.time("1m"))
                    .minDocCount(0)
                    .extendedBounds(eb -> eb
                        .min(org.opensearch.client.opensearch._types.aggregations.FieldDateMath.of(
                            m -> m.value((double) windowStart.toEpochMilli())))
                        .max(org.opensearch.client.opensearch._types.aggregations.FieldDateMath.of(
                            m -> m.value((double) now.truncatedTo(ChronoUnit.MINUTES).toEpochMilli())))))));

            @SuppressWarnings("rawtypes")
            SearchResponse<Void> resp = os.execute(c -> c.search(req, Void.class));

            Aggregate agg = resp.aggregations().get("eps_buckets");
            if (agg != null && agg.isDateHistogram()) {
                List<DateHistogramBucket> buckets = agg.dateHistogram().buckets().array();
                int offset = Math.max(0, buckets.size() - EPS_SPARKLINE_BUCKETS);
                for (int i = 0; i < EPS_SPARKLINE_BUCKETS && (offset + i) < buckets.size(); i++) {
                    // Each bucket is a 1-minute window; divide doc count by 60 to get EPS
                    result[i] = buckets.get(offset + i).docCount() / 60L;
                }
            }
        } catch (Exception ex) {
            logWarnTenantId(client.getId(), "Failed to compute epsSparkline", ex);
            Arrays.fill(result, 0L);
        }
        return result;
    }

    /**
     * Returns the 7-element daily alert trend covering the 7 UTC calendar days
     * ending yesterday (i.e. day-6 ago through yesterday, inclusive).
     * Returns an all-zeros array on any failure.
     */
    private long[] safeAlertsTrend7d(HaClient client) {
        long[] result = new long[ALERT_TREND_DAYS];
        try {
            String pattern = indexResolver.resolveIndexPatternForPrefix("alert",
                    client.getClientPrefix());

            // Yesterday end-of-day is the upper bound (exclusive = start of today UTC)
            Instant startOfToday = clock.instant()
                .atZone(ZoneOffset.UTC)
                .toLocalDate()
                .atStartOfDay(ZoneOffset.UTC)
                .toInstant();
            // 7 days before start-of-today
            Instant windowStart = startOfToday.minus(ALERT_TREND_DAYS, ChronoUnit.DAYS);

            String from = windowStart.toString();
            String to   = startOfToday.toString();

            Query rangeQuery = Query.of(q -> q.range(
                RangeQuery.of(r -> r.field("@timestamp")
                    .gte(org.opensearch.client.json.JsonData.of(from))
                    .lt(org.opensearch.client.json.JsonData.of(to)))));

            SearchRequest req = SearchRequest.of(r -> r
                .index(pattern)
                .query(rangeQuery)
                .size(0)
                .aggregations("daily_buckets", a -> a.dateHistogram(dh -> dh
                    .field("@timestamp")
                    .calendarInterval(org.opensearch.client.opensearch._types.aggregations.CalendarInterval.Day)
                    .timeZone("UTC")
                    .minDocCount(0)
                    .extendedBounds(eb -> eb
                        .min(org.opensearch.client.opensearch._types.aggregations.FieldDateMath.of(
                            m -> m.value((double) windowStart.toEpochMilli())))
                        .max(org.opensearch.client.opensearch._types.aggregations.FieldDateMath.of(
                            m -> m.value((double) startOfToday.minus(1, ChronoUnit.MILLIS).toEpochMilli())))))));

            @SuppressWarnings("rawtypes")
            SearchResponse<Void> resp = os.execute(c -> c.search(req, Void.class));

            Aggregate agg = resp.aggregations().get("daily_buckets");
            if (agg != null && agg.isDateHistogram()) {
                List<DateHistogramBucket> buckets = agg.dateHistogram().buckets().array();
                int offset = Math.max(0, buckets.size() - ALERT_TREND_DAYS);
                for (int i = 0; i < ALERT_TREND_DAYS && (offset + i) < buckets.size(); i++) {
                    result[i] = buckets.get(offset + i).docCount();
                }
            }
        } catch (Exception ex) {
            logWarnTenantId(client.getId(), "Failed to compute alertsTrend7d", ex);
            Arrays.fill(result, 0L);
        }
        return result;
    }

    /**
     * Logs a WARN message with only the numeric tenant {@code id} in the MDC.
     * Never includes {@code name} or {@code clientPrefix}.
     */
    private void logWarnTenantId(Long id, String message, Exception ex) {
        MDC.put(MDC_TENANT_ID, String.valueOf(id));
        try {
            log.warn(message, ex);
        } finally {
            MDC.remove(MDC_TENANT_ID);
        }
    }
}
