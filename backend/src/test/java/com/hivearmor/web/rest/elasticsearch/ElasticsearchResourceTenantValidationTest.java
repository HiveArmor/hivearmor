package com.hivearmor.web.rest.elasticsearch;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.elasticsearch.ElasticsearchService;
import com.hivearmor.service.elasticsearch.processor.SearchProcessorRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.*;

/**
 * Verifies tenant scope validation in {@link ElasticsearchResource}.
 *
 * <p>Tests three scenarios:
 * <ol>
 *   <li>Tenant user requesting own index (pattern matches their prefix) — allowed</li>
 *   <li>Tenant user requesting another tenant's index — 403 Forbidden</li>
 *   <li>Non-MSSP user (null TenantContext) — any pattern allowed (backward compat)</li>
 * </ol>
 *
 * <p><strong>Validates: Requirements 4.1, 4.2, 4.4</strong>
 */
@DisplayName("ElasticsearchResource tenant scope validation")
class ElasticsearchResourceTenantValidationTest {

    private ElasticsearchService elasticsearchService;
    private ApplicationEventService applicationEventService;
    private SearchProcessorRegistry searchProcessorRegistry;
    private MsspIndexResolver indexResolver;
    private ElasticsearchResource resource;

    @BeforeEach
    void setUp() {
        elasticsearchService = mock(ElasticsearchService.class);
        applicationEventService = mock(ApplicationEventService.class);
        searchProcessorRegistry = mock(SearchProcessorRegistry.class);
        indexResolver = new MsspIndexResolver();
        resource = new ElasticsearchResource(
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
    // Non-MSSP mode (null TenantContext) — any pattern allowed
    // =========================================================================

    @Test
    @DisplayName("Non-MSSP: any index pattern is allowed when TenantContext is null")
    void search_noTenantContext_anyPatternAllowed() {
        // TenantContext is null by default — no MSSP scope active
        assertThat(TenantContext.get()).isNull();
        Pageable pageable = PageRequest.of(0, 10);

        // Should not throw for any pattern — backward compatibility
        assertThatCode(() -> resource.search(null, 100, "v3-hive-alert-*", false, pageable))
            .doesNotThrowAnyException();
        assertThatCode(() -> resource.search(null, 100, "v3-hive-log-*", false, pageable))
            .doesNotThrowAnyException();
        assertThatCode(() -> resource.search(null, 100, "v3-hive-alert-other-*", false, pageable))
            .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Non-MSSP: searchToCsv allows any pattern when TenantContext is null")
    void searchToCsv_noTenantContext_anyPatternAllowed() {
        assertThat(TenantContext.get()).isNull();
        // The method should not throw TenantScopeViolationException for any pattern
        // (it may throw other exceptions due to null HttpServletResponse, but not scope violation)
        try {
            resource.searchToCsv(buildCsvParams("v3-hive-alert-other-*"), null);
        } catch (TenantScopeViolationException e) {
            throw new AssertionError("Should not throw TenantScopeViolationException in non-MSSP mode", e);
        } catch (Exception e) {
            // Expected — NullPointerException from null HttpServletResponse is fine
        }
    }

    // =========================================================================
    // MSSP mode — tenant user requesting own index (allowed)
    // =========================================================================

    @Test
    @DisplayName("MSSP: tenant 'cwm' can query own alert index pattern")
    void search_tenantCwm_ownAlertPatternAllowed() {
        try {
            TenantContext.set("cwm");
            Pageable pageable = PageRequest.of(0, 10);

            // Pattern matches tenant's scope: v3-hive-alert-cwm-*
            assertThatCode(() -> resource.search(null, 100, "v3-hive-alert-cwm-*", false, pageable))
                .doesNotThrowAnyException();
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @DisplayName("MSSP: tenant 'cwm' can query own log index pattern")
    void search_tenantCwm_ownLogPatternAllowed() {
        try {
            TenantContext.set("cwm");
            Pageable pageable = PageRequest.of(0, 10);

            // Pattern matches tenant's scope: v3-hive-log-cwm-*
            assertThatCode(() -> resource.search(null, 100, "v3-hive-log-cwm-*", false, pageable))
                .doesNotThrowAnyException();
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @DisplayName("MSSP: tenant 'cwm' can query own alert index with date suffix")
    void search_tenantCwm_ownAlertPatternWithDateAllowed() {
        try {
            TenantContext.set("cwm");
            Pageable pageable = PageRequest.of(0, 10);

            // More specific pattern still starts with the tenant prefix
            assertThatCode(() -> resource.search(null, 100, "v3-hive-alert-cwm-2024.01.01", false, pageable))
                .doesNotThrowAnyException();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // MSSP mode — tenant user requesting another tenant's index (denied)
    // =========================================================================

    @Test
    @DisplayName("MSSP: tenant 'cwm' denied access to another tenant's alert index")
    void search_tenantCwm_otherTenantAlertPatternDenied() {
        try {
            TenantContext.set("cwm");
            Pageable pageable = PageRequest.of(0, 10);

            // Attempting to query tenant 'other' data
            assertThatThrownBy(() -> resource.search(null, 100, "v3-hive-alert-other-*", false, pageable))
                .isInstanceOf(TenantScopeViolationException.class)
                .hasMessageContaining("outside tenant scope");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @DisplayName("MSSP: tenant 'cwm' denied access to global alert index")
    void search_tenantCwm_globalPatternDenied() {
        try {
            TenantContext.set("cwm");
            Pageable pageable = PageRequest.of(0, 10);

            // Attempting to query global data (no tenant prefix)
            assertThatThrownBy(() -> resource.search(null, 100, "v3-hive-alert-*", false, pageable))
                .isInstanceOf(TenantScopeViolationException.class)
                .hasMessageContaining("outside tenant scope");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @DisplayName("MSSP: tenant 'cwm' denied access to another tenant's log index")
    void search_tenantCwm_otherTenantLogPatternDenied() {
        try {
            TenantContext.set("cwm");
            Pageable pageable = PageRequest.of(0, 10);

            assertThatThrownBy(() -> resource.search(null, 100, "v3-hive-log-beta-*", false, pageable))
                .isInstanceOf(TenantScopeViolationException.class)
                .hasMessageContaining("outside tenant scope");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @DisplayName("MSSP: searchToCsv denies cross-tenant access")
    void searchToCsv_tenantCwm_otherTenantDenied() {
        try {
            TenantContext.set("cwm");

            assertThatThrownBy(() -> resource.searchToCsv(buildCsvParams("v3-hive-alert-other-*"), null))
                .isInstanceOf(TenantScopeViolationException.class)
                .hasMessageContaining("outside tenant scope");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @DisplayName("MSSP: searchToCsv allows own tenant pattern")
    void searchToCsv_tenantCwm_ownPatternAllowed() {
        try {
            TenantContext.set("cwm");

            // Should not throw TenantScopeViolationException for own pattern
            // (may throw other exceptions due to null HttpServletResponse)
            try {
                resource.searchToCsv(buildCsvParams("v3-hive-log-cwm-*"), null);
            } catch (TenantScopeViolationException e) {
                throw new AssertionError("Should not throw TenantScopeViolationException for own tenant pattern", e);
            } catch (Exception e) {
                // Expected — NullPointerException from null HttpServletResponse is fine
            }
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // B0-5a — genericSearch tenant-scope enforcement
    // =========================================================================

    @Test
    @DisplayName("MSSP: genericSearch denies another tenant's index")
    void genericSearch_tenantCwm_otherTenantDenied() {
        try {
            TenantContext.set("cwm");
            Pageable pageable = PageRequest.of(0, 10);
            assertThatThrownBy(() -> resource.genericSearch(buildGenericBody("v3-hive-alert-other-*"), pageable))
                .isInstanceOf(TenantScopeViolationException.class)
                .hasMessageContaining("outside tenant scope");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @DisplayName("MSSP: genericSearch denies global index")
    void genericSearch_tenantCwm_globalDenied() {
        try {
            TenantContext.set("cwm");
            Pageable pageable = PageRequest.of(0, 10);
            assertThatThrownBy(() -> resource.genericSearch(buildGenericBody("v3-hive-alert-*"), pageable))
                .isInstanceOf(TenantScopeViolationException.class)
                .hasMessageContaining("outside tenant scope");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @DisplayName("MSSP: genericSearch allows own tenant index")
    void genericSearch_tenantCwm_ownAllowed() {
        try {
            TenantContext.set("cwm");
            Pageable pageable = PageRequest.of(0, 10);
            try {
                resource.genericSearch(buildGenericBody("v3-hive-log-cwm-*"), pageable);
            } catch (TenantScopeViolationException e) {
                throw new AssertionError("Own-tenant pattern must not be a scope violation", e);
            } catch (Exception ignored) {
                // acceptable — downstream mock behavior
            }
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @DisplayName("Non-MSSP: genericSearch allows any index")
    void genericSearch_noContext_anyAllowed() {
        assertThat(TenantContext.get()).isNull();
        Pageable pageable = PageRequest.of(0, 10);
        try {
            resource.genericSearch(buildGenericBody("v3-hive-alert-other-*"), pageable);
        } catch (TenantScopeViolationException e) {
            throw new AssertionError("Non-MSSP must not raise scope violation", e);
        } catch (Exception ignored) {
            // acceptable
        }
    }

    // =========================================================================
    // B0-5a — count tenant-scope enforcement
    // =========================================================================

    @Test
    @DisplayName("MSSP: count denies another tenant's index")
    void count_tenantCwm_otherTenantDenied() {
        try {
            TenantContext.set("cwm");
            Pageable pageable = PageRequest.of(0, 10);
            assertThatThrownBy(() -> resource.count(null, "v3-hive-log-beta-*", pageable))
                .isInstanceOf(TenantScopeViolationException.class)
                .hasMessageContaining("outside tenant scope");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @DisplayName("MSSP: count allows own tenant index")
    void count_tenantCwm_ownAllowed() {
        try {
            TenantContext.set("cwm");
            Pageable pageable = PageRequest.of(0, 10);
            try {
                resource.count(null, "v3-hive-log-cwm-*", pageable);
            } catch (TenantScopeViolationException e) {
                throw new AssertionError("Own-tenant pattern must not be a scope violation", e);
            } catch (Exception ignored) {
                // acceptable
            }
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @DisplayName("Non-MSSP: count allows any index")
    void count_noContext_anyAllowed() {
        assertThat(TenantContext.get()).isNull();
        Pageable pageable = PageRequest.of(0, 10);
        try {
            resource.count(null, "v3-hive-alert-other-*", pageable);
        } catch (TenantScopeViolationException e) {
            throw new AssertionError("Non-MSSP must not raise scope violation", e);
        } catch (Exception ignored) {
            // acceptable
        }
    }

    // =========================================================================
    // B0-5a — searchBySql scoped-SQL enforcement
    // =========================================================================

    @Test
    @DisplayName("MSSP: searchBySql denies another tenant's FROM target")
    void searchBySql_tenantCwm_otherTenantDenied() {
        try {
            TenantContext.set("cwm");
            Pageable pageable = PageRequest.of(0, 10);
            assertThatThrownBy(() -> resource.searchBySql(
                    buildSql("SELECT * FROM \"v3-hive-alert-other-*\""), pageable))
                .isInstanceOf(TenantScopeViolationException.class)
                .hasMessageContaining("outside tenant scope");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @DisplayName("MSSP: searchBySql denies global FROM target")
    void searchBySql_tenantCwm_globalDenied() {
        try {
            TenantContext.set("cwm");
            Pageable pageable = PageRequest.of(0, 10);
            assertThatThrownBy(() -> resource.searchBySql(
                    buildSql("SELECT * FROM \"v3-hive-alert-*\""), pageable))
                .isInstanceOf(TenantScopeViolationException.class)
                .hasMessageContaining("outside tenant scope");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @DisplayName("MSSP: searchBySql denies a query with no identifiable FROM target")
    void searchBySql_tenantCwm_noFromDenied() {
        try {
            TenantContext.set("cwm");
            Pageable pageable = PageRequest.of(0, 10);
            assertThatThrownBy(() -> resource.searchBySql(buildSql("SELECT 1"), pageable))
                .isInstanceOf(TenantScopeViolationException.class);
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @DisplayName("MSSP: searchBySql allows own-tenant FROM target")
    void searchBySql_tenantCwm_ownAllowed() {
        try {
            TenantContext.set("cwm");
            Pageable pageable = PageRequest.of(0, 10);
            try {
                resource.searchBySql(buildSql("SELECT * FROM \"v3-hive-alert-cwm-*\""), pageable);
            } catch (TenantScopeViolationException e) {
                throw new AssertionError("Own-tenant FROM target must not be a scope violation", e);
            } catch (Exception ignored) {
                // acceptable — downstream mock behavior
            }
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @DisplayName("Non-MSSP: searchBySql allows any FROM target")
    void searchBySql_noContext_anyAllowed() {
        assertThat(TenantContext.get()).isNull();
        Pageable pageable = PageRequest.of(0, 10);
        try {
            resource.searchBySql(buildSql("SELECT * FROM \"v3-hive-alert-other-*\""), pageable);
        } catch (TenantScopeViolationException e) {
            throw new AssertionError("Non-MSSP must not raise scope violation", e);
        } catch (Exception ignored) {
            // acceptable
        }
    }

    // =========================================================================
    // Helper methods
    // =========================================================================

    private ElasticsearchResource.GenericSearchBody buildGenericBody(String index) {
        var body = new ElasticsearchResource.GenericSearchBody();
        body.setIndex(index);
        body.setTop(100);
        return body;
    }

    private com.hivearmor.service.dto.elastic.SqlSearchDto buildSql(String query) {
        var dto = new com.hivearmor.service.dto.elastic.SqlSearchDto();
        dto.setQuery(query);
        return dto;
    }

    private com.hivearmor.domain.shared_types.CsvExportingParams buildCsvParams(String indexPattern) {
        var params = new com.hivearmor.domain.shared_types.CsvExportingParams();
        params.setIndexPattern(indexPattern);
        params.setTop(100);
        params.setColumns(new com.hivearmor.domain.shared_types.DataColumn[0]);
        return params;
    }
}
