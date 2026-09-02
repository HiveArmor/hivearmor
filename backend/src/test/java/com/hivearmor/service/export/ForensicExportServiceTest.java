package com.hivearmor.service.export;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.domain.export.HaExportManifest;
import com.hivearmor.domain.shared_types.DataColumn;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.export.HaExportManifestRepository;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.elasticsearch.ElasticsearchService;
import com.hivearmor.service.elasticsearch.TenantScopeGuard;
import com.hivearmor.web.rest.elasticsearch.TenantScopeViolationException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockHttpServletResponse;

import java.security.MessageDigest;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link ForensicExportService} (B0-4).
 *
 * <p>Verifies:
 * <ol>
 *   <li>the persisted manifest SHA-256 matches an independent hash of the payload bytes;</li>
 *   <li>the tenant-scope guard rejects a cross-tenant index pattern before streaming;</li>
 *   <li>an export writes exactly one audit record;</li>
 *   <li>an unknown format is rejected.</li>
 * </ol>
 */
@DisplayName("ForensicExportService — forensic export chain of custody")
class ForensicExportServiceTest {

    private ElasticsearchService elasticsearchService;
    private TenantScopeGuard tenantScopeGuard;
    private MsspIndexResolver indexResolver;
    private HaExportManifestRepository manifestRepository;
    private ApplicationEventService applicationEventService;
    private ForensicExportService service;

    @BeforeEach
    void setUp() {
        // UtilCsv's date formatter reads the app timezone from Constants.CFG; seed it for the
        // pure-unit CSV path (no Spring context to populate it).
        com.hivearmor.config.Constants.CFG.put(
            com.hivearmor.config.Constants.PROP_DATE_SETTINGS_TIMEZONE, "UTC");
        elasticsearchService = mock(ElasticsearchService.class);
        indexResolver = new MsspIndexResolver();
        tenantScopeGuard = new TenantScopeGuard(indexResolver);
        manifestRepository = mock(HaExportManifestRepository.class);
        applicationEventService = mock(ApplicationEventService.class);
        when(manifestRepository.save(any(HaExportManifest.class)))
            .thenAnswer(inv -> inv.getArgument(0));
        service = new ForensicExportService(
            elasticsearchService, tenantScopeGuard, indexResolver, manifestRepository,
            applicationEventService, new ObjectMapper(), 1_000_000L);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    // Emits two fixed documents through the searchStream consumer.
    @SuppressWarnings({"unchecked", "rawtypes"})
    private void stubTwoDocStream() {
        when(elasticsearchService.searchStream(any(), anyInt(), anyString(), anyInt(), eq(Map.class), any()))
            .thenAnswer(inv -> {
                ElasticsearchService.SearchBatchConsumer consumer = inv.getArgument(5);
                List<Map<String, Object>> batch = List.of(
                    new java.util.LinkedHashMap<>(Map.of("id", "a1", "severity", 9)),
                    new java.util.LinkedHashMap<>(Map.of("id", "a2", "severity", 4)));
                consumer.accept(batch);
                return 2L;
            });
    }

    private DataColumn[] columns() {
        DataColumn id = new DataColumn();
        id.setField("id");
        id.setType("string");
        DataColumn sev = new DataColumn();
        sev.setField("severity");
        sev.setType("number");
        return new DataColumn[]{id, sev};
    }

    @Test
    @DisplayName("NDJSON manifest SHA-256 matches an independent hash of the streamed bytes")
    void ndjson_manifestSha256MatchesPayload() throws Exception {
        stubTwoDocStream();
        MockHttpServletResponse response = new MockHttpServletResponse();

        var req = new ForensicExportService.ExportRequest(
            ForensicExportService.SURFACE_ALERT, ExportFormat.NDJSON, "v3-hive-alert-*",
            List.of(), null, Map.of("q", "test"));

        String exportId = service.streamExport(req, response);

        byte[] payload = response.getContentAsByteArray();
        String independent = ForensicExportService.toHex(
            MessageDigest.getInstance("SHA-256").digest(payload));

        ArgumentCaptor<HaExportManifest> captor = ArgumentCaptor.forClass(HaExportManifest.class);
        verify(manifestRepository).save(captor.capture());
        HaExportManifest saved = captor.getValue();

        assertThat(saved.getExportId()).isEqualTo(exportId);
        assertThat(saved.getSha256()).isEqualTo(independent);
        assertThat(saved.getRecordCount()).isEqualTo(2L);
        assertThat(response.getHeader("X-Export-Id")).isEqualTo(exportId);
        assertThat(response.getContentType()).isEqualTo("application/x-ndjson");
        assertThat(response.getHeader("Cache-Control")).isEqualTo("no-store");
        // NDJSON = one JSON object per line.
        assertThat(new String(payload).trim().split("\n")).hasSize(2);
    }

    @Test
    @DisplayName("CSV manifest SHA-256 matches an independent hash of the streamed bytes")
    void csv_manifestSha256MatchesPayload() throws Exception {
        stubTwoDocStream();
        MockHttpServletResponse response = new MockHttpServletResponse();

        var req = new ForensicExportService.ExportRequest(
            ForensicExportService.SURFACE_ALERT, ExportFormat.CSV, "v3-hive-alert-*",
            List.of(), columns(), Map.of("q", "test"));

        String exportId = service.streamExport(req, response);

        byte[] payload = response.getContentAsByteArray();
        String independent = ForensicExportService.toHex(
            MessageDigest.getInstance("SHA-256").digest(payload));

        ArgumentCaptor<HaExportManifest> captor = ArgumentCaptor.forClass(HaExportManifest.class);
        verify(manifestRepository).save(captor.capture());
        assertThat(captor.getValue().getSha256()).isEqualTo(independent);
        assertThat(response.getContentType()).isEqualTo("text/csv");
    }

    @Test
    @DisplayName("MSSP: cross-tenant index pattern is rejected before streaming")
    void crossTenantIndexPatternRejected() {
        TenantContext.set("cwm");
        MockHttpServletResponse response = new MockHttpServletResponse();

        // Controller path calls validateScope first — assert it throws.
        assertThatThrownBy(() -> {
            service.validateScope("v3-hive-alert-other-*");
        }).isInstanceOf(TenantScopeViolationException.class)
          .hasMessageContaining("outside tenant scope");

        var req = new ForensicExportService.ExportRequest(
            ForensicExportService.SURFACE_ALERT, ExportFormat.NDJSON, "v3-hive-alert-other-*",
            List.of(), null, Map.of());

        // Defence-in-depth: streamExport also enforces scope.
        assertThatThrownBy(() -> service.streamExport(req, response))
            .isInstanceOf(TenantScopeViolationException.class);

        // Nothing streamed, nothing persisted.
        verify(manifestRepository, never()).save(any());
        assertThat(response.getContentAsByteArray()).isEmpty();
    }

    @Test
    @DisplayName("An export writes exactly one audit record")
    void exportWritesExactlyOneAuditRecord() throws Exception {
        stubTwoDocStream();
        MockHttpServletResponse response = new MockHttpServletResponse();

        var req = new ForensicExportService.ExportRequest(
            ForensicExportService.SURFACE_HUNT, ExportFormat.NDJSON, "v3-hive-log-*",
            List.of(), null, Map.of("kql", "event.type:auth"));

        service.streamExport(req, response);

        verify(applicationEventService, times(1))
            .createEvent(anyString(), eq(ApplicationEventType.INFO), any());
        verifyNoMoreInteractions(applicationEventService);
    }

    @Test
    @DisplayName("Unknown export format is rejected")
    void unknownFormatRejected() {
        assertThatThrownBy(() -> ExportFormat.parse("xml"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Unknown export format");
        assertThatThrownBy(() -> ExportFormat.parse(null))
            .isInstanceOf(IllegalArgumentException.class);
        assertThat(ExportFormat.parse("CSV")).isEqualTo(ExportFormat.CSV);
        assertThat(ExportFormat.parse("ndjson")).isEqualTo(ExportFormat.NDJSON);
    }

    @Test
    @DisplayName("CSV export requires a non-empty columns projection")
    void csvRequiresColumns() {
        MockHttpServletResponse response = new MockHttpServletResponse();
        var req = new ForensicExportService.ExportRequest(
            ForensicExportService.SURFACE_ALERT, ExportFormat.CSV, "v3-hive-alert-*",
            List.of(), new DataColumn[0], Map.of());
        assertThatThrownBy(() -> service.streamExport(req, response))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("columns");
    }
}
