package com.hivearmor.service.mssp;

import com.hivearmor.domain.HaClient;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.repository.HaTenantUserRepository;
import com.hivearmor.repository.UserRepository;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.mssp.dto.MsspOverviewDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link MsspOverviewService}.
 *
 * <p>Two suites:
 * <ol>
 *   <li><strong>classifyHealth</strong> — exercises the health-status decision logic
 *       with a fixed {@link Clock} so age calculations are deterministic.</li>
 *   <li><strong>OpenSearch failure resilience</strong> — when
 *       {@code OpensearchClientBuilder} throws on every OpenSearch call, the service
 *       must gracefully degrade: {@code eps=0}, {@code lastEventAt=null},
 *       {@code alertsToday=0}, while the overall {@link MsspOverviewDTO} is still
 *       populated and no exception is propagated to the caller.</li>
 * </ol>
 *
 * <p>No Spring context is loaded — all collaborators are injected via Mockito.
 *
 * <p>Validates: Requirements 6.8, 6.9
 *
 * <p>Sprint 23 — MSSP portal backend.
 */
@ExtendWith(MockitoExtension.class)
class MsspOverviewServiceTest {

    // -------------------------------------------------------------------------
    // Fixed reference point for all time-sensitive tests
    // -------------------------------------------------------------------------

    /**
     * Fixed "now" used as the clock anchor. All age calculations in
     * {@code classifyHealth} are relative to this instant.
     */
    private static final Instant NOW = Instant.parse("2026-07-15T12:00:00Z");

    // -------------------------------------------------------------------------
    // Mockito collaborators
    // -------------------------------------------------------------------------

    @Mock private HaClientRepository      clients;
    @Mock private HaTenantUserRepository  memberships;
    @Mock private UserRepository          users;
    @Mock private MsspIndexResolver       indexResolver;
    @Mock private OpensearchClientBuilder os;

    /** Service under test — constructed in {@link #setUp()} with a fixed clock. */
    private MsspOverviewService service;

    @BeforeEach
    void setUp() {
        Clock fixedClock = Clock.fixed(NOW, ZoneOffset.UTC);
        service = new MsspOverviewService(clients, memberships, users, indexResolver, os, fixedClock);
    }

    // =========================================================================
    // Suite 1 — classifyHealth: age-to-status mapping
    // =========================================================================

    /**
     * {@code null} lastEventAt → {@code "OFFLINE"}.
     *
     * <p>A tenant whose most-recent event instant is unknown (null) has never reported
     * events and must therefore be classified as OFFLINE.
     *
     * <p>Validates: Requirement 6.8
     */
    @Test
    @DisplayName("classifyHealth(null) → OFFLINE")
    void classifyHealth_null_returnsOffline() {
        assertThat(service.classifyHealth(null)).isEqualTo("OFFLINE");
    }

    /**
     * Last event 5 minutes ago → {@code "HEALTHY"}.
     *
     * <p>An event within the last 15 minutes places the tenant in the HEALTHY band.
     *
     * <p>Validates: Requirement 6.8
     */
    @Test
    @DisplayName("classifyHealth(now − 5 min) → HEALTHY")
    void classifyHealth_fiveMinutesAgo_returnsHealthy() {
        Instant fiveMinAgo = NOW.minusSeconds(5 * 60);
        assertThat(service.classifyHealth(fiveMinAgo)).isEqualTo("HEALTHY");
    }

    /**
     * Last event 20 minutes ago → {@code "DEGRADED"}.
     *
     * <p>An event between 15 minutes and 1 hour ago places the tenant in the DEGRADED
     * band (≥ 15 min and &lt; 60 min).
     *
     * <p>Validates: Requirement 6.8
     */
    @Test
    @DisplayName("classifyHealth(now − 20 min) → DEGRADED")
    void classifyHealth_twentyMinutesAgo_returnsDegraded() {
        Instant twentyMinAgo = NOW.minusSeconds(20 * 60);
        assertThat(service.classifyHealth(twentyMinAgo)).isEqualTo("DEGRADED");
    }

    /**
     * Last event 45 minutes ago → {@code "DEGRADED"}.
     *
     * <p>Still within the 15-minute to 1-hour window → DEGRADED.
     *
     * <p>Validates: Requirement 6.8
     */
    @Test
    @DisplayName("classifyHealth(now − 45 min) → DEGRADED")
    void classifyHealth_fortyFiveMinutesAgo_returnsDegraded() {
        Instant fortyFiveMinAgo = NOW.minusSeconds(45 * 60);
        assertThat(service.classifyHealth(fortyFiveMinAgo)).isEqualTo("DEGRADED");
    }

    /**
     * Last event 90 minutes ago → {@code "OFFLINE"}.
     *
     * <p>An event older than 1 hour places the tenant back in the OFFLINE band.
     *
     * <p>Validates: Requirement 6.8
     */
    @Test
    @DisplayName("classifyHealth(now − 90 min) → OFFLINE")
    void classifyHealth_ninetyMinutesAgo_returnsOffline() {
        Instant ninetyMinAgo = NOW.minusSeconds(90 * 60);
        assertThat(service.classifyHealth(ninetyMinAgo)).isEqualTo("OFFLINE");
    }

    // =========================================================================
    // Suite 2 — OpenSearch failure resilience
    // =========================================================================

    /**
     * When {@code OpensearchClientBuilder.execute()} throws for every OpenSearch call,
     * the service must:
     * <ul>
     *   <li>return {@code eps = 0} for the affected tenant</li>
     *   <li>return {@code lastEventAt = null} for the affected tenant</li>
     *   <li>return {@code alertsToday = 0} across all tenants</li>
     *   <li>still return a fully populated {@link MsspOverviewDTO} — not null, no
     *       exception propagated to the caller</li>
     * </ul>
     *
     * <p>Validates: Requirement 6.9
     */
    @Test
    @DisplayName("OpenSearch failure → eps=0, lastEventAt=null, alertsToday=0; response still populated")
    void compute_opensearchThrows_gracefullyDegradesButResponseIsStillPopulated() throws Exception {
        // Arrange — one managed tenant
        HaClient tenant = buildClient(1L, "Alpha Corp", "alpha");

        when(clients.findByMsspManagedTrueAndClientPrefixIsNotNull())
            .thenReturn(List.of(tenant));
        when(memberships.countDistinctActiveUserIds()).thenReturn(3L);
        when(memberships.countByClientId(1L)).thenReturn(3L);

        // Make the index resolver return a pattern so the OS calls proceed to failure
        when(indexResolver.resolveIndexPatternForPrefix(anyString(), anyString()))
            .thenReturn("v3-hive-alert-alpha-*");

        // Simulate OpenSearch failure for all calls
        when(os.execute(any())).thenThrow(new RuntimeException("OpenSearch unavailable"));

        // Act
        MsspOverviewDTO dto = service.compute();

        // Assert — overall DTO is populated (not null, not thrown)
        assertThat(dto).isNotNull();
        assertThat(dto.tenantCount()).isEqualTo(1);
        assertThat(dto.activeUserCount()).isEqualTo(3L);

        // alertsToday must be 0 when every OS call fails
        assertThat(dto.alertsToday()).isEqualTo(0);

        // The tenants list must still contain the one tenant
        assertThat(dto.tenants()).hasSize(1);

        // eps must fall back to 0 (safeEps returns 0L on failure)
        assertThat(dto.tenants().get(0).eps()).isEqualTo(0L);

        // lastEventAt must be null (safeLastEventAt returns null on failure)
        assertThat(dto.tenants().get(0).lastEventAt()).isNull();

        // healthStatus must be OFFLINE because lastEventAt == null
        assertThat(dto.tenants().get(0).healthStatus()).isEqualTo("OFFLINE");
    }

    /**
     * When {@code OpensearchClientBuilder.execute()} throws for all tenants in a
     * multi-tenant list, all surviving tenant metadata (name, id, userCount) is still
     * present in the response and the EPS sum is 0.
     *
     * <p>Validates: Requirement 6.9
     */
    @Test
    @DisplayName("OpenSearch failure for multiple tenants — all tenant metadata still returned")
    void compute_opensearchThrowsForAllTenants_allTenantMetadataIncluded() throws Exception {
        // Arrange — two managed tenants
        HaClient tenantA = buildClient(10L, "BranchA", "brancha");
        HaClient tenantB = buildClient(20L, "ZoneB",   "zoneb");

        when(clients.findByMsspManagedTrueAndClientPrefixIsNotNull())
            .thenReturn(List.of(tenantA, tenantB));
        when(memberships.countDistinctActiveUserIds()).thenReturn(5L);
        when(memberships.countByClientId(10L)).thenReturn(2L);
        when(memberships.countByClientId(20L)).thenReturn(3L);

        // Both tenants resolve an index pattern (failures come from OS, not resolver)
        when(indexResolver.resolveIndexPatternForPrefix(anyString(), anyString()))
            .thenReturn("v3-hive-alert-x-*");

        // All OpenSearch calls fail
        when(os.execute(any())).thenThrow(new RuntimeException("timeout"));

        // Act
        MsspOverviewDTO dto = service.compute();

        // Both tenants must appear in the tenants list (sorted ascending by name)
        assertThat(dto.tenants()).hasSize(2);
        assertThat(dto.tenants().get(0).name()).isEqualTo("BranchA");
        assertThat(dto.tenants().get(1).name()).isEqualTo("ZoneB");

        // Neither tenant contributes EPS
        assertThat(dto.totalEps()).isEqualTo(0L);

        // alertsToday is the sum of per-tenant counts — all 0 on failure
        assertThat(dto.alertsToday()).isEqualTo(0);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Builds a minimal {@link HaClient} suitable for use in mocked service calls.
     *
     * @param id           tenant primary key
     * @param name         display name
     * @param clientPrefix MSSP tenant prefix
     * @return a populated, unsaved entity
     */
    private static HaClient buildClient(Long id, String name, String clientPrefix) {
        HaClient client = new HaClient();
        client.setId(id);
        client.setName(name);
        client.setClientPrefix(clientPrefix);
        client.setMsspManaged(true);
        return client;
    }
}
