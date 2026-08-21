package com.hivearmor.service.mssp;

import com.hivearmor.domain.HaClient;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.repository.HaTenantUserRepository;
import com.hivearmor.repository.UserRepository;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.mssp.dto.MsspOverviewDTO;
import com.hivearmor.service.mssp.dto.TenantHealthDTO;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch._types.query_dsl.RangeQuery;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch._types.aggregations.Aggregate;
import org.opensearch.client.opensearch.core.CountRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;

/**
 * Aggregates MSSP tenant overview data for the {@code GET /api/ha-mssp/overview} endpoint.
 *
 * <p>Loads all MSSP-managed tenants from PostgreSQL and enriches each with
 * live OpenSearch metrics (EPS, last-event timestamp, today's alert count).
 * Every OpenSearch call is wrapped in a {@code try/catch} so that a single
 * failing tenant does not prevent the rest of the response from being built.
 * Failures are logged at {@code WARN} level with <em>only</em> the numeric
 * tenant {@code id} in the MDC — never the {@code name}, {@code clientPrefix},
 * or any raw payload content (platform "no raw customer data at any log level"
 * rule).
 *
 * <p>Sprint 23 — MSSP portal backend.
 *
 * @see MsspOverviewDTO
 * @see TenantHealthDTO
 */
@Service
public class MsspOverviewService {

    private static final Logger log = LoggerFactory.getLogger(MsspOverviewService.class);

    /** MDC key used when logging per-tenant OpenSearch failures. */
    private static final String MDC_TENANT_ID = "tenantId";

    private final HaClientRepository clients;
    private final HaTenantUserRepository memberships;
    private final UserRepository users;
    private final MsspIndexResolver indexResolver;
    private final OpensearchClientBuilder os;
    private final Clock clock;

    public MsspOverviewService(HaClientRepository clients,
                               HaTenantUserRepository memberships,
                               UserRepository users,
                               MsspIndexResolver indexResolver,
                               OpensearchClientBuilder os,
                               Clock clock) {
        this.clients       = clients;
        this.memberships   = memberships;
        this.users         = users;
        this.indexResolver = indexResolver;
        this.os            = os;
        this.clock         = clock;
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Builds and returns the complete MSSP overview payload.
     *
     * <p>Steps:
     * <ol>
     *   <li>Load all MSSP-managed tenants that have a non-null {@code clientPrefix}.</li>
     *   <li>Count active users across all tenants.</li>
     *   <li>Map each tenant to a {@link TenantHealthDTO} (with safe OpenSearch calls).</li>
     *   <li>Sort the list ascending by tenant name.</li>
     *   <li>Sum EPS across tenants.</li>
     *   <li>Sum today's alert count across tenants.</li>
     * </ol>
     *
     * @return populated {@link MsspOverviewDTO}; never {@code null}
     */
    public MsspOverviewDTO compute() {
        List<HaClient> managed = clients.findByMsspManagedTrueAndClientPrefixIsNotNull();

        int  tenantCount     = managed.size();
        long activeUserCount = memberships.countDistinctActiveUserIds();

        List<TenantHealthDTO> tenants = managed.stream()
            .map(this::toHealth)
            .sorted(Comparator.comparing(TenantHealthDTO::name,
                        Comparator.nullsLast(Comparator.naturalOrder())))
            .toList();

        long totalEps    = tenants.stream().mapToLong(TenantHealthDTO::eps).sum();
        int  alertsToday = safeAlertsToday(managed);

        return new MsspOverviewDTO(tenantCount, activeUserCount, totalEps, alertsToday, tenants);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Maps a single {@link HaClient} to a {@link TenantHealthDTO}, using safe
     * OpenSearch calls that return zero / null on failure.
     */
    private TenantHealthDTO toHealth(HaClient client) {
        long    eps       = safeEps(client);
        Instant lastEvent = safeLastEventAt(client);

        return new TenantHealthDTO(
            client.getId(),
            client.getName(),
            client.getClientPrefix(),
            (int) memberships.countByClientId(client.getId()),
            eps,
            classifyHealth(lastEvent),
            lastEvent
        );
    }

    /**
     * Maps the age of {@code lastEventAt} to a {@code HealthStatusEnum} string.
     *
     * <ul>
     *   <li>{@code null} → {@code "OFFLINE"}</li>
     *   <li>age &lt; 15&nbsp;min → {@code "HEALTHY"}</li>
     *   <li>15&nbsp;min ≤ age &lt; 60&nbsp;min → {@code "DEGRADED"}</li>
     *   <li>age ≥ 60&nbsp;min → {@code "OFFLINE"}</li>
     * </ul>
     *
     * <p>Package-private to allow direct unit testing without a full Spring context.
     *
     * @param lastEventAt the timestamp of the most recent event, or {@code null}
     * @return one of {@code "HEALTHY"}, {@code "DEGRADED"}, {@code "OFFLINE"}
     */
    String classifyHealth(Instant lastEventAt) {
        if (lastEventAt == null) return "OFFLINE";
        Duration age = Duration.between(lastEventAt, clock.instant());
        if (age.compareTo(Duration.ofMinutes(15)) < 0) return "HEALTHY";
        if (age.compareTo(Duration.ofHours(1))    < 0) return "DEGRADED";
        return "OFFLINE";
    }

    /**
     * Returns the current events-per-second rate for the given tenant, or {@code 0}
     * if the OpenSearch query fails.
     *
     * <p>EPS is approximated as the document count in the current-minute bucket of
     * the tenant's alert index, divided by 60 seconds.  The index pattern is always
     * obtained from {@link MsspIndexResolver} — never by string concatenation.
     *
     * @param client the MSSP-managed tenant
     * @return non-negative EPS value, {@code 0} on any failure
     */
    private long safeEps(HaClient client) {
        try {
            String pattern = indexResolver.resolveIndexPatternForPrefix("alert",
                    client.getClientPrefix());

            // Count documents created in the last 60 seconds to derive EPS
            Instant oneMinuteAgo = clock.instant().minusSeconds(60);
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
            return docCount / 60L; // convert 60-second count → EPS
        } catch (Exception ex) {
            MDC.put(MDC_TENANT_ID, String.valueOf(client.getId()));
            try {
                log.warn("Failed to compute EPS for tenant", ex);
            } finally {
                MDC.remove(MDC_TENANT_ID);
            }
            return 0L;
        }
    }

    /**
     * Returns the {@link Instant} of the most recent event in the tenant's alert
     * index, or {@code null} if the query fails or no documents exist.
     *
     * @param client the MSSP-managed tenant
     * @return most-recent event timestamp, or {@code null} on failure / empty index
     */
    private Instant safeLastEventAt(HaClient client) {
        try {
            String pattern = indexResolver.resolveIndexPatternForPrefix("alert",
                    client.getClientPrefix());

            SearchRequest req = SearchRequest.of(r -> r
                .index(pattern)
                .size(1)
                .sort(s -> s.field(f -> f
                    .field("@timestamp")
                    .order(org.opensearch.client.opensearch._types.SortOrder.Desc))));

            @SuppressWarnings("rawtypes")
            SearchResponse<java.util.Map> resp = os.execute(c ->
                c.search(req, java.util.Map.class));

            var hits = resp.hits().hits();
            if (hits == null || hits.isEmpty()) return null;

            @SuppressWarnings("unchecked")
            java.util.Map<String, Object> src = hits.get(0).source();
            if (src == null) return null;

            Object ts = src.get("@timestamp");
            if (ts == null) return null;

            return Instant.parse(ts.toString());
        } catch (Exception ex) {
            MDC.put(MDC_TENANT_ID, String.valueOf(client.getId()));
            try {
                log.warn("Failed to retrieve lastEventAt for tenant", ex);
            } finally {
                MDC.remove(MDC_TENANT_ID);
            }
            return null;
        }
    }

    /**
     * Returns the total number of alerts created in the current UTC calendar day
     * across all managed tenants, summing per-tenant counts individually.
     *
     * <p>If the OpenSearch call for a specific tenant fails, that tenant contributes
     * {@code 0} to the sum and a {@code WARN} log is emitted with only the tenant
     * {@code id} in the MDC.
     *
     * @param managed list of MSSP-managed tenants
     * @return total alerts today across all tenants; never negative
     */
    private int safeAlertsToday(List<HaClient> managed) {
        // Build the start-of-day boundary in UTC
        String startOfDay = clock.instant()
            .atZone(ZoneOffset.UTC)
            .toLocalDate()
            .atStartOfDay(ZoneOffset.UTC)
            .toInstant()
            .toString();

        int total = 0;
        for (HaClient client : managed) {
            try {
                String pattern = indexResolver.resolveIndexPatternForPrefix("alert",
                        client.getClientPrefix());

                Query rangeQuery = Query.of(q -> q.range(
                    RangeQuery.of(r -> r.field("@timestamp").gte(
                        org.opensearch.client.json.JsonData.of(startOfDay)))));

                SearchRequest req = SearchRequest.of(r -> r
                    .index(pattern)
                    .query(rangeQuery)
                    .size(0));

                @SuppressWarnings("rawtypes")
                SearchResponse<Void> resp = os.execute(c -> c.search(req, Void.class));

                long count = resp.hits().total() != null ? resp.hits().total().value() : 0L;
                total += (int) Math.min(count, Integer.MAX_VALUE);
            } catch (Exception ex) {
                MDC.put(MDC_TENANT_ID, String.valueOf(client.getId()));
                try {
                    log.warn("Failed to retrieve alertsToday for tenant", ex);
                } finally {
                    MDC.remove(MDC_TENANT_ID);
                }
                // this tenant contributes 0 to the total; continue
            }
        }
        return total;
    }
}
