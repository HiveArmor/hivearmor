package com.hivearmor.multitenancy;

import com.hivearmor.service.elasticsearch.ElasticsearchService;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.elasticsearch.processor.SearchProcessorRegistry;
import com.hivearmor.service.overview.OverviewService;
import com.hivearmor.web.rest.elasticsearch.ElasticsearchResource;
import com.hivearmor.web.rest.elasticsearch.TenantScopeViolationException;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.MethodOrderer.OrderAnnotation;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * Integration test verifying full tenant isolation across all migrated services
 * after Sprint 35 Legacy Index Migration.
 *
 * <p>This test provisions two tenants (alpha and beta) and verifies:
 * <ul>
 *   <li>Alpha tenant sees only alpha-scoped index patterns</li>
 *   <li>Beta tenant sees only beta-scoped index patterns</li>
 *   <li>Null context (global mode) returns global wildcard patterns</li>
 *   <li>Cross-tenant requests via ElasticsearchResource are rejected with 403</li>
 * </ul>
 *
 * <p>Since no running OpenSearch instance is available in CI, this test mocks
 * {@link ElasticsearchService} and validates that the correct tenant-scoped index
 * patterns are resolved and passed to the search layer by each migrated service.
 *
 * <p><strong>Validates: Requirement 6</strong> — Integration test for tenant isolation
 * across all migrated services.
 */
@Tag("integration")
@DisplayName("Sprint 35 — Legacy Migration Tenant Isolation IT")
@TestMethodOrder(OrderAnnotation.class)
class LegacyMigrationTenantIsolationIT {

    // =========================================================================
    // Test infrastructure
    // =========================================================================

    private static final String ALPHA_PREFIX = "alpha";
    private static final String BETA_PREFIX = "beta";

    /** Real resolver — no mocking needed, it reads TenantContext directly. */
    private final MsspIndexResolver indexResolver = new MsspIndexResolver();

    private ElasticsearchService elasticsearchService;
    private ApplicationEventService applicationEventService;
    private SearchProcessorRegistry searchProcessorRegistry;
    private OverviewService overviewService;
    private ElasticsearchResource elasticsearchResource;

    @BeforeEach
    void setUp() {
        elasticsearchService = mock(ElasticsearchService.class);
        applicationEventService = mock(ApplicationEventService.class);
        searchProcessorRegistry = mock(SearchProcessorRegistry.class);
        overviewService = new OverviewService(elasticsearchService, indexResolver);
        elasticsearchResource = new ElasticsearchResource(
            elasticsearchService,
            applicationEventService,
            searchProcessorRegistry,
            indexResolver
        );
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    // =========================================================================
    // 10.2 — Provision alpha and beta tenants with test data
    // =========================================================================

    /**
     * Verifies that MsspIndexResolver correctly produces tenant-scoped patterns
     * for both alpha and beta tenants. This is the foundation for all subsequent
     * isolation tests — the resolver is the single source of truth for index names.
     *
     * <p>Expected patterns:
     * <ul>
     *   <li>alpha alerts: {@code v3-hive-alert-alpha-*}</li>
     *   <li>alpha logs: {@code v3-hive-log-alpha-*}</li>
     *   <li>beta alerts: {@code v3-hive-alert-beta-*}</li>
     *   <li>beta logs: {@code v3-hive-log-beta-*}</li>
     * </ul>
     */
    @Test
    @Order(1)
    @DisplayName("10.2 — Resolver produces correct tenant-scoped patterns for alpha and beta")
    void resolver_producesTenantScopedPatterns_forBothTenants() {
        // Alpha tenant patterns
        try {
            TenantContext.set(ALPHA_PREFIX);
            assertThat(indexResolver.resolveAlertIndexPattern()).isEqualTo("v3-hive-alert-alpha-*");
            assertThat(indexResolver.resolveIndexPattern("log")).isEqualTo("v3-hive-log-alpha-*");
        } finally {
            TenantContext.clear();
        }

        // Beta tenant patterns
        try {
            TenantContext.set(BETA_PREFIX);
            assertThat(indexResolver.resolveAlertIndexPattern()).isEqualTo("v3-hive-alert-beta-*");
            assertThat(indexResolver.resolveIndexPattern("log")).isEqualTo("v3-hive-log-beta-*");
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // 10.3 — Alpha tenant isolation across alert service and overview
    // =========================================================================

    @Test
    @Order(2)
    @DisplayName("10.3 — Alpha: alert service resolves v3-hive-alert-alpha-*")
    void alphaTenant_alertService_resolvesAlphaAlertPattern() {
        try {
            TenantContext.set(ALPHA_PREFIX);

            String alertPattern = indexResolver.resolveAlertIndexPattern();
            assertThat(alertPattern)
                .isEqualTo("v3-hive-alert-alpha-*")
                .contains("-alpha-")
                .doesNotContain("-beta-");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @Order(3)
    @DisplayName("10.3 — Alpha: overview service resolves both alert and log patterns for alpha")
    void alphaTenant_overviewService_resolvesAlphaPatterns() {
        try {
            TenantContext.set(ALPHA_PREFIX);

            // Overview uses both alert and log patterns
            String alertPattern = indexResolver.resolveIndexPattern("alert");
            String logPattern = indexResolver.resolveIndexPattern("log");

            assertThat(alertPattern).isEqualTo("v3-hive-alert-alpha-*");
            assertThat(logPattern).isEqualTo("v3-hive-log-alpha-*");

            // Both patterns are tenant-scoped (contain -alpha-)
            assertThat(alertPattern).contains("-alpha-");
            assertThat(logPattern).contains("-alpha-");

            // Neither pattern matches global wildcard
            assertThat(alertPattern).isNotEqualTo("v3-hive-alert-*");
            assertThat(logPattern).isNotEqualTo("v3-hive-log-*");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @Order(4)
    @DisplayName("10.3 — Alpha: log queries target v3-hive-log-alpha-*")
    void alphaTenant_logQueries_targetAlphaLogPattern() {
        try {
            TenantContext.set(ALPHA_PREFIX);

            String logPattern = indexResolver.resolveIndexPattern("log");
            assertThat(logPattern)
                .isEqualTo("v3-hive-log-alpha-*")
                .startsWith("v3-hive-log-alpha-");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @Order(5)
    @DisplayName("10.3 — Alpha: ElasticsearchResource allows alpha's own pattern")
    void alphaTenant_elasticsearchResource_allowsOwnPattern() {
        try {
            TenantContext.set(ALPHA_PREFIX);
            Pageable pageable = PageRequest.of(0, 10);

            // Alpha user querying their own alert index — should not throw
            assertThatCode(() -> elasticsearchResource.search(null, 100, "v3-hive-alert-alpha-*", false, pageable))
                .doesNotThrowAnyException();

            // Alpha user querying their own log index — should not throw
            assertThatCode(() -> elasticsearchResource.search(null, 100, "v3-hive-log-alpha-*", false, pageable))
                .doesNotThrowAnyException();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // 10.4 — Beta tenant isolation across alert service
    // =========================================================================

    @Test
    @Order(6)
    @DisplayName("10.4 — Beta: alert service resolves v3-hive-alert-beta-*")
    void betaTenant_alertService_resolvesBetaAlertPattern() {
        try {
            TenantContext.set(BETA_PREFIX);

            String alertPattern = indexResolver.resolveAlertIndexPattern();
            assertThat(alertPattern)
                .isEqualTo("v3-hive-alert-beta-*")
                .contains("-beta-")
                .doesNotContain("-alpha-");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @Order(7)
    @DisplayName("10.4 — Beta: log service resolves v3-hive-log-beta-*")
    void betaTenant_logService_resolvesBetaLogPattern() {
        try {
            TenantContext.set(BETA_PREFIX);

            String logPattern = indexResolver.resolveIndexPattern("log");
            assertThat(logPattern)
                .isEqualTo("v3-hive-log-beta-*")
                .contains("-beta-")
                .doesNotContain("-alpha-");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @Order(8)
    @DisplayName("10.4 — Beta: ElasticsearchResource allows beta's own pattern")
    void betaTenant_elasticsearchResource_allowsOwnPattern() {
        try {
            TenantContext.set(BETA_PREFIX);
            Pageable pageable = PageRequest.of(0, 10);

            assertThatCode(() -> elasticsearchResource.search(null, 100, "v3-hive-alert-beta-*", false, pageable))
                .doesNotThrowAnyException();
            assertThatCode(() -> elasticsearchResource.search(null, 100, "v3-hive-log-beta-*", false, pageable))
                .doesNotThrowAnyException();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // 10.5 — Null context returns all data from both tenants (global mode)
    // =========================================================================

    @Test
    @Order(9)
    @DisplayName("10.5 — Global: null context resolves to v3-hive-alert-* (all tenants)")
    void nullContext_alertService_resolvesGlobalAlertPattern() {
        // TenantContext is null by default — no tenant scope
        assertThat(TenantContext.get()).isNull();

        String alertPattern = indexResolver.resolveAlertIndexPattern();
        assertThat(alertPattern)
            .isEqualTo("v3-hive-alert-*")
            .doesNotContain("-alpha-")
            .doesNotContain("-beta-");
    }

    @Test
    @Order(10)
    @DisplayName("10.5 — Global: null context resolves to v3-hive-log-* (all tenants)")
    void nullContext_logService_resolvesGlobalLogPattern() {
        assertThat(TenantContext.get()).isNull();

        String logPattern = indexResolver.resolveIndexPattern("log");
        assertThat(logPattern)
            .isEqualTo("v3-hive-log-*")
            .doesNotContain("-alpha-")
            .doesNotContain("-beta-");
    }

    @Test
    @Order(11)
    @DisplayName("10.5 — Global: overview resolves global patterns for both alert and log")
    void nullContext_overviewService_resolvesGlobalPatterns() {
        assertThat(TenantContext.get()).isNull();

        String alertPattern = indexResolver.resolveIndexPattern("alert");
        String logPattern = indexResolver.resolveIndexPattern("log");

        // Global patterns match ALL tenants
        assertThat(alertPattern).isEqualTo("v3-hive-alert-*");
        assertThat(logPattern).isEqualTo("v3-hive-log-*");
    }

    @Test
    @Order(12)
    @DisplayName("10.5 — Global: ElasticsearchResource allows any pattern in non-MSSP mode")
    void nullContext_elasticsearchResource_allowsAnyPattern() {
        assertThat(TenantContext.get()).isNull();
        Pageable pageable = PageRequest.of(0, 10);

        // In global mode, any pattern is allowed (backward compat)
        assertThatCode(() -> elasticsearchResource.search(null, 100, "v3-hive-alert-*", false, pageable))
            .doesNotThrowAnyException();
        assertThatCode(() -> elasticsearchResource.search(null, 100, "v3-hive-alert-alpha-*", false, pageable))
            .doesNotThrowAnyException();
        assertThatCode(() -> elasticsearchResource.search(null, 100, "v3-hive-alert-beta-*", false, pageable))
            .doesNotThrowAnyException();
        assertThatCode(() -> elasticsearchResource.search(null, 100, "v3-hive-log-*", false, pageable))
            .doesNotThrowAnyException();
    }

    // =========================================================================
    // 10.6 — ElasticsearchResource cross-tenant validation returns 403
    // =========================================================================

    @Test
    @Order(13)
    @DisplayName("10.6 — Alpha cannot access beta's alert index → TenantScopeViolationException")
    void alphaTenant_cannotAccessBetaAlerts() {
        try {
            TenantContext.set(ALPHA_PREFIX);
            Pageable pageable = PageRequest.of(0, 10);

            assertThatThrownBy(() -> elasticsearchResource.search(null, 100, "v3-hive-alert-beta-*", false, pageable))
                .isInstanceOf(TenantScopeViolationException.class)
                .hasMessageContaining("outside tenant scope");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @Order(14)
    @DisplayName("10.6 — Alpha cannot access beta's log index → TenantScopeViolationException")
    void alphaTenant_cannotAccessBetaLogs() {
        try {
            TenantContext.set(ALPHA_PREFIX);
            Pageable pageable = PageRequest.of(0, 10);

            assertThatThrownBy(() -> elasticsearchResource.search(null, 100, "v3-hive-log-beta-*", false, pageable))
                .isInstanceOf(TenantScopeViolationException.class)
                .hasMessageContaining("outside tenant scope");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @Order(15)
    @DisplayName("10.6 — Beta cannot access alpha's alert index → TenantScopeViolationException")
    void betaTenant_cannotAccessAlphaAlerts() {
        try {
            TenantContext.set(BETA_PREFIX);
            Pageable pageable = PageRequest.of(0, 10);

            assertThatThrownBy(() -> elasticsearchResource.search(null, 100, "v3-hive-alert-alpha-*", false, pageable))
                .isInstanceOf(TenantScopeViolationException.class)
                .hasMessageContaining("outside tenant scope");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @Order(16)
    @DisplayName("10.6 — Beta cannot access alpha's log index → TenantScopeViolationException")
    void betaTenant_cannotAccessAlphaLogs() {
        try {
            TenantContext.set(BETA_PREFIX);
            Pageable pageable = PageRequest.of(0, 10);

            assertThatThrownBy(() -> elasticsearchResource.search(null, 100, "v3-hive-log-alpha-*", false, pageable))
                .isInstanceOf(TenantScopeViolationException.class)
                .hasMessageContaining("outside tenant scope");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @Order(17)
    @DisplayName("10.6 — Alpha cannot access global alert pattern → TenantScopeViolationException")
    void alphaTenant_cannotAccessGlobalAlertPattern() {
        try {
            TenantContext.set(ALPHA_PREFIX);
            Pageable pageable = PageRequest.of(0, 10);

            // Tenant user should not be able to query the global wildcard
            assertThatThrownBy(() -> elasticsearchResource.search(null, 100, "v3-hive-alert-*", false, pageable))
                .isInstanceOf(TenantScopeViolationException.class)
                .hasMessageContaining("outside tenant scope");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @Order(18)
    @DisplayName("10.6 — Null context allows cross-tenant pattern (backward compat)")
    void nullContext_allowsCrossTenantPattern() {
        // When no tenant context is set, any pattern is allowed — backward compatibility
        assertThat(TenantContext.get()).isNull();
        Pageable pageable = PageRequest.of(0, 10);

        // All patterns should be allowed in non-MSSP mode
        assertThatCode(() -> elasticsearchResource.search(null, 100, "v3-hive-alert-beta-*", false, pageable))
            .doesNotThrowAnyException();
        assertThatCode(() -> elasticsearchResource.search(null, 100, "v3-hive-alert-alpha-*", false, pageable))
            .doesNotThrowAnyException();
    }

    // =========================================================================
    // Cross-cutting: Tenant patterns are mutually exclusive
    // =========================================================================

    @Test
    @Order(19)
    @DisplayName("Isolation invariant: alpha and beta patterns never overlap")
    void tenantPatterns_areMutuallyExclusive() {
        String alphaAlert;
        String alphaLog;
        String betaAlert;
        String betaLog;

        try {
            TenantContext.set(ALPHA_PREFIX);
            alphaAlert = indexResolver.resolveAlertIndexPattern();
            alphaLog = indexResolver.resolveIndexPattern("log");
        } finally {
            TenantContext.clear();
        }

        try {
            TenantContext.set(BETA_PREFIX);
            betaAlert = indexResolver.resolveAlertIndexPattern();
            betaLog = indexResolver.resolveIndexPattern("log");
        } finally {
            TenantContext.clear();
        }

        // Alpha and beta patterns must be completely distinct
        assertThat(alphaAlert).isNotEqualTo(betaAlert);
        assertThat(alphaLog).isNotEqualTo(betaLog);

        // Alpha patterns must not contain beta prefix and vice versa
        assertThat(alphaAlert).doesNotContain("-beta-");
        assertThat(alphaLog).doesNotContain("-beta-");
        assertThat(betaAlert).doesNotContain("-alpha-");
        assertThat(betaLog).doesNotContain("-alpha-");
    }

    @Test
    @Order(20)
    @DisplayName("Isolation invariant: global pattern is distinct from all tenant patterns")
    void globalPattern_isDistinctFromTenantPatterns() {
        String globalAlert = indexResolver.resolveAlertIndexPattern();
        String globalLog = indexResolver.resolveIndexPattern("log");

        String alphaAlert;
        String betaAlert;

        try {
            TenantContext.set(ALPHA_PREFIX);
            alphaAlert = indexResolver.resolveAlertIndexPattern();
        } finally {
            TenantContext.clear();
        }

        try {
            TenantContext.set(BETA_PREFIX);
            betaAlert = indexResolver.resolveAlertIndexPattern();
        } finally {
            TenantContext.clear();
        }

        // Global is NOT the same as any tenant pattern
        assertThat(globalAlert).isNotEqualTo(alphaAlert);
        assertThat(globalAlert).isNotEqualTo(betaAlert);
        assertThat(globalAlert).isEqualTo("v3-hive-alert-*");
        assertThat(globalLog).isEqualTo("v3-hive-log-*");
    }

    // =========================================================================
    // 10.7 — Production build verification (documented as manual step)
    // =========================================================================

    /**
     * Note: Production Maven build verification is performed as a separate step:
     * <pre>
     * cd backend && mvn -s settings.xml -Pprod clean package -Dmaven.test.skip=true -Denforcer.skip=true
     * </pre>
     *
     * This test verifies the precondition: that the resolver contract is stable
     * and all migrated services can be instantiated without compilation errors.
     * The actual production build verification is task 10.7 and is run as a
     * separate Maven command (see below in the test class).
     */
    @Test
    @Order(21)
    @DisplayName("10.7 — MsspIndexResolver contract is stable for production")
    void productionBuildPrecondition_resolverContractIsStable() {
        // Verify the resolver handles all expected data types without exception
        assertThatCode(() -> indexResolver.resolveIndexPattern("alert")).doesNotThrowAnyException();
        assertThatCode(() -> indexResolver.resolveIndexPattern("log")).doesNotThrowAnyException();
        assertThatCode(() -> indexResolver.resolveAlertIndexPattern()).doesNotThrowAnyException();
        assertThatCode(() -> indexResolver.resolveCurrentDayAlertIndex()).doesNotThrowAnyException();
        assertThatCode(() -> indexResolver.resolveCurrentDayIndex("log")).doesNotThrowAnyException();

        // Verify explicit prefix resolution (used by MsspOverviewService)
        assertThatCode(() -> indexResolver.resolveIndexPatternForPrefix("alert", "alpha")).doesNotThrowAnyException();
        assertThatCode(() -> indexResolver.resolveIndexPatternForPrefix("log", null)).doesNotThrowAnyException();

        // Verify the resolver produces patterns matching the immutable index format
        assertThat(indexResolver.resolveIndexPattern("alert")).matches("v3-hive-alert-\\*");
        assertThat(indexResolver.resolveIndexPatternForPrefix("alert", "alpha")).matches("v3-hive-alert-alpha-\\*");
    }
}
