package com.hivearmor.service.reports;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.service.UtmImagesService;
import com.hivearmor.service.elasticsearch.ElasticsearchService;
import com.hivearmor.service.incident_response.UtmIncidentJobService;
import com.hivearmor.service.network_scan.UtmNetworkScanService;
import com.hivearmor.util.PdfUtil;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.opensearch.client.opensearch.core.SearchRequest;

import java.time.Instant;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Verifies that {@link CustomReportService} uses tenant-scoped index patterns from
 * {@link MsspIndexResolver} and that null TenantContext produces global patterns
 * identical to the legacy {@code Constants.SYS_INDEX_PATTERN} behavior.
 *
 * <p><strong>Validates: Requirements 3.4</strong>
 */
@DisplayName("CustomReportService tenant scoping")
class CustomReportServiceTenantScopingTest {

    private ElasticsearchService elasticsearchService;
    private PdfUtil pdfUtil;
    private UtmIncidentJobService incidentJobService;
    private UtmNetworkScanService utmNetworkScanService;
    private UtmImagesService imagesService;
    private MsspIndexResolver indexResolver;
    private CustomReportService customReportService;

    @BeforeEach
    void setUp() {
        elasticsearchService = mock(ElasticsearchService.class);
        pdfUtil = mock(PdfUtil.class);
        incidentJobService = mock(UtmIncidentJobService.class);
        utmNetworkScanService = mock(UtmNetworkScanService.class);
        imagesService = mock(UtmImagesService.class);
        indexResolver = new MsspIndexResolver();
        customReportService = new CustomReportService(
            elasticsearchService, pdfUtil, incidentJobService,
            utmNetworkScanService, imagesService, indexResolver);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    // =========================================================================
    // Global mode (null TenantContext) — must match legacy behavior
    // =========================================================================

    @Test
    @DisplayName("buildThreatActivityForAlerts with null TenantContext uses global alert pattern")
    void buildThreatActivityForAlerts_nullTenant_usesGlobalAlertPattern() throws Exception {
        AtomicReference<SearchRequest> captured = captureSearchRequestAndThrow();

        try {
            customReportService.buildThreatActivityForAlerts(
                Instant.parse("2024-01-01T00:00:00Z"),
                Instant.parse("2024-01-31T23:59:59Z"),
                10);
        } catch (Exception ignored) {
            // Expected — we throw from the mock to short-circuit execution
        }

        assertThat(captured.get()).isNotNull();
        assertThat(captured.get().index()).contains("v3-hive-alert-*");
    }

    @Test
    @DisplayName("buildThreatActivityForIncidents with null TenantContext uses global alert pattern")
    void buildThreatActivityForIncidents_nullTenant_usesGlobalAlertPattern() {
        AtomicReference<SearchRequest> captured = captureSearchRequestAndThrow();

        try {
            customReportService.buildThreatActivityForIncidents(
                Instant.parse("2024-01-01T00:00:00Z"),
                Instant.parse("2024-01-31T23:59:59Z"),
                10);
        } catch (Exception ignored) {
            // Expected — we throw from the mock to short-circuit execution
        }

        assertThat(captured.get()).isNotNull();
        assertThat(captured.get().index()).contains("v3-hive-alert-*");
    }

    // =========================================================================
    // Tenant-scoped mode (TenantContext set to "cwm")
    // =========================================================================

    @Test
    @DisplayName("buildThreatActivityForAlerts with tenant 'cwm' uses tenant-scoped alert pattern")
    void buildThreatActivityForAlerts_tenantCwm_usesTenantScopedPattern() {
        try {
            TenantContext.set("cwm");
            AtomicReference<SearchRequest> captured = captureSearchRequestAndThrow();

            try {
                customReportService.buildThreatActivityForAlerts(
                    Instant.parse("2024-01-01T00:00:00Z"),
                    Instant.parse("2024-01-31T23:59:59Z"),
                    10);
            } catch (Exception ignored) {
                // Expected — we throw from the mock to short-circuit execution
            }

            assertThat(captured.get()).isNotNull();
            assertThat(captured.get().index()).contains("v3-hive-alert-cwm-*");
        } finally {
            TenantContext.clear();
        }
    }

    @Test
    @DisplayName("buildThreatActivityForIncidents with tenant 'cwm' uses tenant-scoped alert pattern")
    void buildThreatActivityForIncidents_tenantCwm_usesTenantScopedPattern() {
        try {
            TenantContext.set("cwm");
            AtomicReference<SearchRequest> captured = captureSearchRequestAndThrow();

            try {
                customReportService.buildThreatActivityForIncidents(
                    Instant.parse("2024-01-01T00:00:00Z"),
                    Instant.parse("2024-01-31T23:59:59Z"),
                    10);
            } catch (Exception ignored) {
                // Expected — we throw from the mock to short-circuit execution
            }

            assertThat(captured.get()).isNotNull();
            assertThat(captured.get().index()).contains("v3-hive-alert-cwm-*");
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // Verify index pattern identity between null context and legacy global values
    // =========================================================================

    @Test
    @DisplayName("MsspIndexResolver with null context returns legacy global alert pattern")
    void indexResolver_nullContext_returnsLegacyGlobalPattern() {
        assertThat(TenantContext.get()).isNull();
        assertThat(indexResolver.resolveAlertIndexPattern()).isEqualTo("v3-hive-alert-*");
    }

    @Test
    @DisplayName("MsspIndexResolver with tenant 'cwm' returns tenant-scoped alert pattern")
    void indexResolver_tenantCwm_returnsTenantScopedPattern() {
        try {
            TenantContext.set("cwm");
            assertThat(indexResolver.resolveAlertIndexPattern()).isEqualTo("v3-hive-alert-cwm-*");
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Configures the ElasticsearchService mock to capture the SearchRequest and then
     * throw a RuntimeException. This lets us inspect the index pattern passed to the
     * search call without needing to construct a full SearchResponse (which uses
     * final/sealed OpenSearch client classes that cannot be mocked).
     */
    private AtomicReference<SearchRequest> captureSearchRequestAndThrow() {
        AtomicReference<SearchRequest> captured = new AtomicReference<>();
        try {
            when(elasticsearchService.search(any(SearchRequest.class), any())).thenAnswer(invocation -> {
                captured.set(invocation.getArgument(0));
                throw new RuntimeException("short-circuit for test");
            });
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        return captured;
    }
}
