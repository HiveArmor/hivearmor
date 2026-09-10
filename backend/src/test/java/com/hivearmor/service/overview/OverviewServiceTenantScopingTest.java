package com.hivearmor.service.overview;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.service.elasticsearch.ElasticsearchService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Verifies that {@link OverviewService} uses tenant-scoped index patterns from
 * {@link MsspIndexResolver} and that null TenantContext produces global patterns
 * identical to the legacy {@code Constants.SYS_INDEX_PATTERN} behavior.
 *
 * <p><strong>Validates: Requirements 3.1, 3.2, 3.3</strong>
 */
@DisplayName("OverviewService tenant scoping")
class OverviewServiceTenantScopingTest {

    private ElasticsearchService elasticsearchService;
    private MsspIndexResolver indexResolver;
    private OverviewService overviewService;

    @BeforeEach
    void setUp() {
        elasticsearchService = mock(ElasticsearchService.class);
        indexResolver = new MsspIndexResolver();
        overviewService = new OverviewService(elasticsearchService, indexResolver);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    // =========================================================================
    // Global mode (null TenantContext) — must match legacy behavior
    // =========================================================================

    @Test
    @DisplayName("countAlertsTodayAndLastWeek with null TenantContext uses global alert pattern")
    void countAlertsTodayAndLastWeek_nullTenant_usesGlobalAlertPattern() throws Exception {
        // TenantContext is null by default
        when(elasticsearchService.indexExist("v3-hive-alert-*")).thenReturn(false);

        var result = overviewService.countAlertsTodayAndLastWeek();

        verify(elasticsearchService).indexExist("v3-hive-alert-*");
        assertThat(result).hasSize(2);
        assertThat(result.get(0).getValue()).isZero();
    }

    @Test
    @DisplayName("topAlerts with null TenantContext uses global alert pattern")
    void topAlerts_nullTenant_usesGlobalAlertPattern() throws Exception {
        when(elasticsearchService.indexExist("v3-hive-alert-*")).thenReturn(false);

        var result = overviewService.topAlerts("2024-01-01", "2024-01-31", 10);

        verify(elasticsearchService).indexExist("v3-hive-alert-*");
    }

    @Test
    @DisplayName("countAlertsBySeverity with null TenantContext uses global alert pattern")
    void countAlertsBySeverity_nullTenant_usesGlobalAlertPattern() throws Exception {
        when(elasticsearchService.indexExist("v3-hive-alert-*")).thenReturn(false);

        overviewService.countAlertsBySeverity("2024-01-01", "2024-01-31", 10);

        verify(elasticsearchService).indexExist("v3-hive-alert-*");
    }

    @Test
    @DisplayName("topAlertsByCategory with null TenantContext uses global alert pattern")
    void topAlertsByCategory_nullTenant_usesGlobalAlertPattern() throws Exception {
        when(elasticsearchService.indexExist("v3-hive-alert-*")).thenReturn(false);

        overviewService.topAlertsByCategory("2024-01-01", "2024-01-31", 10);

        verify(elasticsearchService).indexExist("v3-hive-alert-*");
    }

    @Test
    @DisplayName("countEventsByType with null TenantContext uses global log pattern")
    void countEventsByType_nullTenant_usesGlobalLogPattern() throws Exception {
        when(elasticsearchService.indexExist("v3-hive-log-*")).thenReturn(false);

        overviewService.countEventsByType("2024-01-01", "2024-01-31", 10);

        verify(elasticsearchService).indexExist("v3-hive-log-*");
    }

    @Test
    @DisplayName("eventsInTime with null TenantContext uses global log pattern")
    void eventsInTime_nullTenant_usesGlobalLogPattern() {
        when(elasticsearchService.indexExist("v3-hive-log-*")).thenReturn(false);

        overviewService.eventsInTime("2024-01-01", "2024-01-31",
            org.opensearch.client.opensearch._types.aggregations.CalendarInterval.Day);

        verify(elasticsearchService).indexExist("v3-hive-log-*");
    }

    @Test
    @DisplayName("topWindowsEvents with null TenantContext uses global log pattern")
    void topWindowsEvents_nullTenant_usesGlobalLogPattern() throws Exception {
        when(elasticsearchService.indexExist("v3-hive-log-*")).thenReturn(false);

        overviewService.topWindowsEvents("2024-01-01", "2024-01-31", 10);

        verify(elasticsearchService).indexExist("v3-hive-log-*");
    }

    // =========================================================================
    // Tenant-scoped mode (TenantContext set to "cwm")
    // =========================================================================

    @Test
    @DisplayName("countAlertsTodayAndLastWeek with tenant 'cwm' uses tenant-scoped alert pattern")
    void countAlertsTodayAndLastWeek_tenantCwm_usesTenantScopedPattern() throws Exception {
        try {
            TenantContext.set("cwm");
            when(elasticsearchService.indexExist("v3-hive-alert-cwm-*")).thenReturn(false);

            overviewService.countAlertsTodayAndLastWeek();

            verify(elasticsearchService).indexExist("v3-hive-alert-cwm-*");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @DisplayName("topAlerts with tenant 'cwm' uses tenant-scoped alert pattern")
    void topAlerts_tenantCwm_usesTenantScopedPattern() throws Exception {
        try {
            TenantContext.set("cwm");
            when(elasticsearchService.indexExist("v3-hive-alert-cwm-*")).thenReturn(false);

            overviewService.topAlerts("2024-01-01", "2024-01-31", 10);

            verify(elasticsearchService).indexExist("v3-hive-alert-cwm-*");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @DisplayName("countAlertsBySeverity with tenant 'cwm' uses tenant-scoped alert pattern")
    void countAlertsBySeverity_tenantCwm_usesTenantScopedPattern() throws Exception {
        try {
            TenantContext.set("cwm");
            when(elasticsearchService.indexExist("v3-hive-alert-cwm-*")).thenReturn(false);

            overviewService.countAlertsBySeverity("2024-01-01", "2024-01-31", 10);

            verify(elasticsearchService).indexExist("v3-hive-alert-cwm-*");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @DisplayName("topAlertsByCategory with tenant 'cwm' uses tenant-scoped alert pattern")
    void topAlertsByCategory_tenantCwm_usesTenantScopedPattern() throws Exception {
        try {
            TenantContext.set("cwm");
            when(elasticsearchService.indexExist("v3-hive-alert-cwm-*")).thenReturn(false);

            overviewService.topAlertsByCategory("2024-01-01", "2024-01-31", 10);

            verify(elasticsearchService).indexExist("v3-hive-alert-cwm-*");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @DisplayName("countEventsByType with tenant 'cwm' uses tenant-scoped log pattern")
    void countEventsByType_tenantCwm_usesTenantScopedPattern() throws Exception {
        try {
            TenantContext.set("cwm");
            when(elasticsearchService.indexExist("v3-hive-log-cwm-*")).thenReturn(false);

            overviewService.countEventsByType("2024-01-01", "2024-01-31", 10);

            verify(elasticsearchService).indexExist("v3-hive-log-cwm-*");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @DisplayName("eventsInTime with tenant 'cwm' uses tenant-scoped log pattern")
    void eventsInTime_tenantCwm_usesTenantScopedPattern() {
        try {
            TenantContext.set("cwm");
            when(elasticsearchService.indexExist("v3-hive-log-cwm-*")).thenReturn(false);

            overviewService.eventsInTime("2024-01-01", "2024-01-31",
                org.opensearch.client.opensearch._types.aggregations.CalendarInterval.Day);

            verify(elasticsearchService).indexExist("v3-hive-log-cwm-*");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @DisplayName("topWindowsEvents with tenant 'cwm' uses tenant-scoped log pattern (same type as LOGS)")
    void topWindowsEvents_tenantCwm_usesTenantScopedPattern() throws Exception {
        try {
            TenantContext.set("cwm");
            when(elasticsearchService.indexExist("v3-hive-log-cwm-*")).thenReturn(false);

            overviewService.topWindowsEvents("2024-01-01", "2024-01-31", 10);

            verify(elasticsearchService).indexExist("v3-hive-log-cwm-*");
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // Verify index pattern identity between null context and legacy global values
    // =========================================================================

    @Test
    @DisplayName("MsspIndexResolver with null context produces same patterns as legacy Constants")
    void indexResolver_nullContext_producesLegacyGlobalPatterns() {
        // When TenantContext is null, resolver must return the exact same strings
        // that Constants.SYS_INDEX_PATTERN.get(SystemIndexPattern.ALERTS/LOGS/LOGS_WINDOWS)
        // returned: "v3-hive-alert-*" and "v3-hive-log-*"
        assertThat(TenantContext.get()).isNull();
        assertThat(indexResolver.resolveIndexPattern("alert")).isEqualTo("v3-hive-alert-*");
        assertThat(indexResolver.resolveIndexPattern("log")).isEqualTo("v3-hive-log-*");
        // LOGS_WINDOWS also maps to "log" — same pattern
        assertThat(indexResolver.resolveIndexPattern("log")).isEqualTo("v3-hive-log-*");
    }

    @Test
    @DisplayName("MsspIndexResolver with tenant 'cwm' produces tenant-scoped patterns")
    void indexResolver_tenantCwm_producesTenantScopedPatterns() {
        try {
            TenantContext.set("cwm");
            assertThat(indexResolver.resolveIndexPattern("alert")).isEqualTo("v3-hive-alert-cwm-*");
            assertThat(indexResolver.resolveIndexPattern("log")).isEqualTo("v3-hive-log-cwm-*");
        } finally {
            TenantContext.clear();
        }
    }
}
