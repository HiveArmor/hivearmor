package com.hivearmor.service.mssp;

import com.hivearmor.domain.HaClient;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.repository.HaTenantUserRepository;
import com.hivearmor.repository.UserRepository;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.mssp.dto.MsspOverviewDTO;
import com.hivearmor.service.mssp.dto.TenantHealthDTO;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.opensearch.client.opensearch.core.search.HitsMetadata;
import org.opensearch.client.opensearch.core.search.TotalHits;
import org.opensearch.client.opensearch.core.search.TotalHitsRelation;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Property-based tests for {@link MsspOverviewService}.
 *
 * <p><strong>Property 10: {@code MsspOverviewService} aggregation preserves sum and ordering</strong>
 * <br>
 * For any arbitrary list of MSSP-managed tenant inputs (0–20 tenants), the result of
 * {@link MsspOverviewService#compute()} must satisfy:
 * <ol>
 *   <li>{@code dto.totalEps == sum(dto.tenants[*].eps)}</li>
 *   <li>{@code dto.tenants} list is in ascending order by {@code name} (String natural order,
 *       null-last)</li>
 *   <li>{@code dto.tenantCount == dto.tenants.size()}</li>
 *   <li>Each tenant's {@code healthStatus} matches {@code classifyHealth(lastEventAt)} rules</li>
 * </ol>
 *
 * <p>Validates: Requirements 6.3, 6.4, 6.5, 6.7, 6.8
 *
 * <p>Minimum 100 iterations. jqwik re-creates all mocks before each trial via
 * {@link BeforeTry} so every trial starts from a clean state.
 *
 * <p>Sprint 23 — MSSP portal backend.
 */
@Label("Feature: sprint-23-mssp-portal")
class MsspOverviewServicePropertyTest {

    // -------------------------------------------------------------------------
    // Fixed clock: 2025-01-01T12:00:00Z
    // -------------------------------------------------------------------------

    static final Instant FIXED_NOW   = Instant.parse("2025-01-01T12:00:00Z");
    static final Clock   FIXED_CLOCK = Clock.fixed(FIXED_NOW, ZoneOffset.UTC);

    // -------------------------------------------------------------------------
    // Mocks — re-created fresh for every jqwik trial via @BeforeTry
    // -------------------------------------------------------------------------

    private HaClientRepository     clientRepo;
    private HaTenantUserRepository  membershipRepo;
    private UserRepository          userRepo;
    private MsspIndexResolver       indexResolver;
    private OpensearchClientBuilder osBuilder;

    @BeforeTry
    void setUp() {
        clientRepo     = mock(HaClientRepository.class);
        membershipRepo = mock(HaTenantUserRepository.class);
        userRepo       = mock(UserRepository.class);
        indexResolver  = mock(MsspIndexResolver.class);
        osBuilder      = mock(OpensearchClientBuilder.class);
    }

    // =========================================================================
    // Property 10: MsspOverviewService aggregation preserves sum and ordering
    // Validates: Requirements 6.3, 6.4, 6.5, 6.7, 6.8
    // =========================================================================

    /**
     * **Validates: Requirements 6.3, 6.4, 6.5, 6.7, 6.8**
     *
     * <p>For any list of 0–20 tenant inputs, after calling {@link MsspOverviewService#compute()}:
     * <ol>
     *   <li>(a) {@code dto.totalEps == sum(dto.tenants[*].eps)}</li>
     *   <li>(b) {@code dto.tenants} is ascending by {@code name} (String natural order, null-last)</li>
     *   <li>(c) {@code dto.tenantCount == dto.tenants.size()}</li>
     *   <li>(d) each tenant's {@code healthStatus} matches the {@code classifyHealth} rules</li>
     * </ol>
     *
     * <p>OpenSearch stubbing strategy: rather than executing the {@code OsAction} lambda (which
     * requires accessing the nested {@code OsAction} type), we directly stub
     * {@link OpensearchClientBuilder#execute} to return pre-built {@link SearchResponse} mocks
     * using Mockito's sequential-answer mechanism. The responses are ordered to match the exact
     * call sequence emitted by the service:
     * <pre>
     *   for each tenant: safeEps (Void search) → safeLastEventAt (Map search)
     *   then for each tenant: safeAlertsToday (Void search)
     * </pre>
     */
    @Property(tries = 100)
    @Label("Feature: sprint-23-mssp-portal, Property 10: MsspOverviewService aggregation preserves sum and ordering")
    @SuppressWarnings({"rawtypes", "unchecked"})
    void property10_aggregationPreservesSumAndOrdering(
            @ForAll("tenantInputs") List<TenantInput> inputs) throws Exception {

        int n = inputs.size();

        // ---- Arrange: repository stubs ----------------------------------------

        List<HaClient> clients = buildClients(inputs);
        when(clientRepo.findByMsspManagedTrueAndClientPrefixIsNotNull())
                .thenReturn(clients);
        when(membershipRepo.countDistinctActiveUserIds()).thenReturn(0L);

        for (int i = 0; i < clients.size(); i++) {
            when(membershipRepo.countByClientId(clients.get(i).getId()))
                    .thenReturn((long) i);
        }

        when(indexResolver.resolveIndexPatternForPrefix(any(), any()))
                .thenAnswer(inv -> "v3-hive-alert-" + inv.getArgument(1) + "-*");

        // ---- Arrange: sequential SearchResponse mocks for os.execute() ------
        //
        // MsspOverviewService calls os.execute() in this exact order:
        //   for t0..t_{N-1} (via stream().map(this::toHealth)):
        //     [0] safeEps(t0)           → SearchResponse<Void>  hits.total = eps*60
        //     [1] safeLastEventAt(t0)   → SearchResponse<Map>   hits[0].source["@timestamp"]
        //     [2] safeEps(t1)           → SearchResponse<Void>
        //     [3] safeLastEventAt(t1)   → SearchResponse<Map>
        //     ...
        //     [2N-2] safeEps(t_{N-1})
        //     [2N-1] safeLastEventAt(t_{N-1})
        //
        //   safeAlertsToday loop:
        //     [2N]   alertsToday(t0)    → SearchResponse<Void>  hits.total = 0
        //     [2N+1] alertsToday(t1)
        //     ...
        //     [3N-1] alertsToday(t_{N-1})
        //
        // We build the full sequence and use Mockito's doAnswer with an AtomicInteger
        // to return the right response at each call position.
        // We avoid referencing the nested OsAction type by working with Object directly.

        // Build the ordered response list
        List<SearchResponse<?>> responses = new ArrayList<>(3 * n);

        // Phase 1: interleaved eps + lastEventAt for each tenant
        for (TenantInput input : inputs) {
            long docCount = input.eps() * 60L;          // safeEps: docCount/60 = eps
            responses.add(buildVoidSearchResponse(docCount));    // safeEps
            responses.add(buildMapSearchResponse(input.lastEventAt())); // safeLastEventAt
        }

        // Phase 2: alertsToday for each tenant (value irrelevant for asserted properties)
        for (int i = 0; i < n; i++) {
            responses.add(buildVoidSearchResponse(0L));
        }

        // Stub os.execute() using an AtomicInteger counter — avoids referencing OsAction
        AtomicInteger callIdx = new AtomicInteger(0);
        doAnswer(inv -> responses.get(callIdx.getAndIncrement()))
                .when(osBuilder).execute(any());

        // ---- Act ----------------------------------------------------------
        MsspOverviewService service = new MsspOverviewService(
                clientRepo, membershipRepo, userRepo, indexResolver, osBuilder, FIXED_CLOCK);

        MsspOverviewDTO dto = service.compute();

        // ---- Assert: Property (c) — tenantCount == tenants.size() -----------
        assertThat(dto.tenantCount())
                .as("Property 10(c): dto.tenantCount [%d] must equal dto.tenants.size() [%d] [Req 6.3]",
                        dto.tenantCount(), dto.tenants().size())
                .isEqualTo(dto.tenants().size());

        assertThat(dto.tenantCount())
                .as("Property 10(c): dto.tenantCount [%d] must equal input size [%d] [Req 6.3]",
                        dto.tenantCount(), n)
                .isEqualTo(n);

        // ---- Assert: Property (a) — totalEps == sum of tenants[*].eps ------
        long sumOfTenantEps = dto.tenants().stream().mapToLong(TenantHealthDTO::eps).sum();
        assertThat(dto.totalEps())
                .as("Property 10(a): dto.totalEps [%d] must equal sum of TenantHealthDTO.eps [%d] [Req 6.5]",
                        dto.totalEps(), sumOfTenantEps)
                .isEqualTo(sumOfTenantEps);

        // ---- Assert: Property (b) — tenants sorted ascending by name -------
        // The service sorts using Comparator.nullsLast(naturalOrder())
        List<TenantHealthDTO> tenants = dto.tenants();
        for (int i = 0; i < tenants.size() - 1; i++) {
            String nameA = tenants.get(i).name();
            String nameB = tenants.get(i + 1).name();
            if (nameA != null && nameB != null) {
                assertThat(nameA.compareTo(nameB))
                        .as("Property 10(b): tenant[%d].name '%s' must be <= tenant[%d].name '%s' [Req 6.7]",
                                i, nameA, i + 1, nameB)
                        .isLessThanOrEqualTo(0);
            } else if (nameA != null) {
                // nameB is null → nameA should appear before null (nullsLast),
                // so nameA comes before nameB — no violation
            }
            // nameA null → nameA is last, nameB should also be null or this is a bug
            // (we don't generate null names in this test, but defensive check)
        }

        // ---- Assert: Property (d) — healthStatus matches classifyHealth ----
        // Build a lookup map: clientPrefix → expected health status
        Map<String, String> expectedHealthByPrefix = new HashMap<>();
        for (TenantInput input : inputs) {
            expectedHealthByPrefix.put(input.prefix(),
                    expectedClassifyHealth(input.lastEventAt(), FIXED_NOW));
        }

        for (TenantHealthDTO tenant : tenants) {
            String expected = expectedHealthByPrefix.get(tenant.clientPrefix());
            assertThat(tenant.healthStatus())
                    .as("Property 10(d): tenant '%s' healthStatus must match classifyHealth [Req 6.8]. "
                            + "lastEventAt not known at assertion time — verify via prefix '%s'",
                            tenant.clientPrefix(), tenant.clientPrefix())
                    .isEqualTo(expected);
        }
    }

    // =========================================================================
    // Arbitraries (jqwik generators)
    // =========================================================================

    /**
     * Generates lists of 0–20 {@link TenantInput} records.
     *
     * <p>Generation constraints:
     * <ul>
     *   <li>{@code name} — arbitrary non-empty alphabetic string (may duplicate across tenants)</li>
     *   <li>{@code prefix} — characters from {@code [a-z0-9-]}, length 2–20,
     *       no leading/trailing hyphen; unique across the generated list</li>
     *   <li>{@code eps} — long in [0, 100_000]</li>
     *   <li>{@code lastEventAt} — {@code null} (offline) or a random instant in
     *       {@code [FIXED_NOW − 3h, FIXED_NOW]}</li>
     * </ul>
     */
    @Provide
    Arbitrary<List<TenantInput>> tenantInputs() {
        Arbitrary<String> names = Arbitraries.strings()
                .alpha()
                .ofMinLength(1)
                .ofMaxLength(30);

        Arbitrary<String> prefixes = Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz0123456789-")
                .ofMinLength(2)
                .ofMaxLength(20)
                .filter(s -> !s.startsWith("-") && !s.endsWith("-"));

        Arbitrary<Long> epsValues = Arbitraries.longs().between(0L, 100_000L);

        Arbitrary<Instant> instantValues = Arbitraries.longs()
                .between(0L, Duration.ofHours(3).toSeconds())
                .map(offset -> FIXED_NOW.minusSeconds(offset));

        Arbitrary<Instant> maybeInstant = Arbitraries.oneOf(
                Arbitraries.just(null),
                instantValues
        );

        Arbitrary<TenantInput> single =
                Combinators.combine(names, prefixes, epsValues, maybeInstant)
                        .as(TenantInput::new);

        return single.list()
                .ofMinSize(0)
                .ofMaxSize(20)
                .filter(list -> {
                    // Enforce prefix uniqueness within each generated list
                    long distinctPrefixes = list.stream()
                            .map(TenantInput::prefix)
                            .distinct()
                            .count();
                    return distinctPrefixes == list.size();
                });
    }

    // =========================================================================
    // Record: TenantInput
    // =========================================================================

    /**
     * Carries all per-tenant parameters generated by jqwik for a single trial.
     *
     * @param name        tenant display name
     * @param prefix      client prefix (unique within a generated list)
     * @param eps         expected EPS (0–100_000)
     * @param lastEventAt timestamp for health classification, or {@code null}
     */
    record TenantInput(String name, String prefix, long eps, Instant lastEventAt) {}

    // =========================================================================
    // Private helpers — SearchResponse constructors
    // =========================================================================

    /**
     * Builds a client list mirroring the generated inputs (sequential IDs starting at 1).
     */
    private static List<HaClient> buildClients(List<TenantInput> inputs) {
        List<HaClient> clients = new ArrayList<>(inputs.size());
        for (int i = 0; i < inputs.size(); i++) {
            TenantInput in = inputs.get(i);
            HaClient c = new HaClient();
            c.setId((long) (i + 1));
            c.setName(in.name());
            c.setClientPrefix(in.prefix());
            c.setMsspManaged(true);
            clients.add(c);
        }
        return clients;
    }

    /**
     * Mocked {@link SearchResponse}{@code <Void>} reporting {@code docCount} total hits.
     * Used to stub {@code safeEps} (returns {@code docCount/60} as EPS) and
     * {@code safeAlertsToday}.
     */
    @SuppressWarnings({"rawtypes", "unchecked"})
    private static SearchResponse<Void> buildVoidSearchResponse(long docCount) {
        TotalHits total = mock(TotalHits.class);
        when(total.value()).thenReturn(docCount);
        when(total.relation()).thenReturn(TotalHitsRelation.Eq);

        HitsMetadata<Void> hits = mock(HitsMetadata.class);
        when(hits.total()).thenReturn(total);
        when(hits.hits()).thenReturn(List.of());

        SearchResponse<Void> resp = mock(SearchResponse.class);
        when(resp.hits()).thenReturn(hits);
        return resp;
    }

    /**
     * Mocked {@link SearchResponse}{@code <Map>} for {@code safeLastEventAt}.
     *
     * <p>When {@code lastEventAt != null}, the first hit carries
     * {@code source["@timestamp"] = lastEventAt.toString()}.
     * When {@code null}, the hits list is empty so the service returns {@code null}.
     */
    @SuppressWarnings({"rawtypes", "unchecked"})
    private static SearchResponse<Map> buildMapSearchResponse(Instant lastEventAt) {
        HitsMetadata<Map> hits = mock(HitsMetadata.class);

        if (lastEventAt == null) {
            when(hits.hits()).thenReturn(List.of());
        } else {
            Map<String, Object> source = Map.of("@timestamp", lastEventAt.toString());
            Hit<Map> hit = mock(Hit.class);
            when(hit.source()).thenReturn(source);
            when(hits.hits()).thenReturn(List.of(hit));
        }

        TotalHits total = mock(TotalHits.class);
        when(total.value()).thenReturn(lastEventAt != null ? 1L : 0L);
        when(hits.total()).thenReturn(total);

        SearchResponse<Map> resp = mock(SearchResponse.class);
        when(resp.hits()).thenReturn(hits);
        return resp;
    }

    // =========================================================================
    // Helper: independent classifyHealth re-implementation
    // =========================================================================

    /**
     * Standalone re-implementation of {@link MsspOverviewService#classifyHealth} used
     * to compute expected health status values for property assertions (d).
     *
     * <ul>
     *   <li>{@code null} → {@code "OFFLINE"}</li>
     *   <li>age &lt; 15&nbsp;min → {@code "HEALTHY"}</li>
     *   <li>15&nbsp;min ≤ age &lt; 60&nbsp;min → {@code "DEGRADED"}</li>
     *   <li>age ≥ 60&nbsp;min → {@code "OFFLINE"}</li>
     * </ul>
     *
     * @param lastEventAt event timestamp (may be {@code null})
     * @param now         reference "now" instant
     * @return one of {@code "HEALTHY"}, {@code "DEGRADED"}, {@code "OFFLINE"}
     */
    static String expectedClassifyHealth(Instant lastEventAt, Instant now) {
        if (lastEventAt == null) return "OFFLINE";
        Duration age = Duration.between(lastEventAt, now);
        if (age.compareTo(Duration.ofMinutes(15)) < 0) return "HEALTHY";
        if (age.compareTo(Duration.ofHours(1))    < 0) return "DEGRADED";
        return "OFFLINE";
    }
}
