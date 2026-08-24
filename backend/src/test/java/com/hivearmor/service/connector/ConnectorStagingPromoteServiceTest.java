package com.hivearmor.service.connector;

import com.hivearmor.domain.connector.ConnectorStagingStatus;
import com.hivearmor.domain.connector.HaConnectorAlertStaging;
import com.hivearmor.repository.connector.HaConnectorAlertStagingRepository;
import com.hivearmor.service.elasticsearch.ElasticsearchService;
import com.hivearmor.service.inputs.HaIndexNames;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ConnectorStagingPromoteServiceTest {

    @Mock
    private HaConnectorAlertStagingRepository stagingRepository;
    @Mock
    private ElasticsearchService elasticsearchService;

    private ConnectorStagingPromoteService promoteService;

    @BeforeEach
    void setUp() {
        promoteService = new ConnectorStagingPromoteService(stagingRepository, elasticsearchService);
    }

    @Test
    void promoteByIdsWritesLabeledConnectorPromotedDocAndMarksPromoted() {
        HaConnectorAlertStaging row = pendingRow(101L, "det-42");
        when(stagingRepository.findByIdIn(List.of(101L))).thenReturn(List.of(row));
        when(stagingRepository.save(any(HaConnectorAlertStaging.class)))
            .thenAnswer(inv -> inv.getArgument(0));

        // IndexResponse.id() is not reliably mockable (final client types) — return null;
        // promote still records PROMOTED + destination index.
        when(elasticsearchService.index(anyString(), any())).thenReturn(null);

        ConnectorPromoteResult result = promoteService.promoteByIds(List.of(101L));

        assertThat(result.getPromoted()).isEqualTo(1);
        assertThat(result.getFailed()).isEqualTo(0);
        assertThat(result.getSkipped()).isEqualTo(0);
        assertThat(result.getDestinationIndex())
            .startsWith("v3-hive-connector-promoted-")
            .doesNotContain("alert");
        assertThat(result.toMap().get("correlationStatus"))
            .isEqualTo(ConnectorPromoteResult.CORRELATION_STATUS);
        assertThat(String.valueOf(result.toMap().get("note")))
            .contains("not EP /v1/inject")
            .contains("not v3-hive-alert");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> docCap = ArgumentCaptor.forClass(Map.class);
        String expectedIndex = HaIndexNames.buildCurrentDayIndex(ConnectorPromoteResult.INDEX_TYPE);
        verify(elasticsearchService).index(eq(expectedIndex), docCap.capture());
        Map<String, Object> doc = docCap.getValue();
        assertThat(doc.get("ha.document.kind")).isEqualTo(ConnectorPromoteResult.DOCUMENT_KIND);
        assertThat(doc.get("ha.correlation.status")).isEqualTo("not_correlated");
        assertThat(doc.get("ha.provenance")).isEqualTo(ConnectorPromoteResult.PROVENANCE);
        assertThat(doc.get("ha.staging.id")).isEqualTo(101L);
        assertThat(doc.get("ha.external.id")).isEqualTo("det-42");
        assertThat(doc.get("ha.siem.correlated_alert")).isEqualTo(false);
        assertThat(doc.get("ha.siem.inject_used")).isEqualTo(false);

        assertThat(row.getStatus()).isEqualTo(ConnectorStagingStatus.PROMOTED);
        assertThat(row.getPromotedIndex()).isEqualTo(expectedIndex);
        assertThat(row.getPromoteBatchId()).isEqualTo(result.getPromoteBatchId());
        assertThat(row.getPromoteError()).isNull();
    }

    @Test
    void promoteByIdsMarksFailedWhenOpenSearchWriteFails() {
        HaConnectorAlertStaging row = pendingRow(7L, "ext-fail");
        when(stagingRepository.findByIdIn(List.of(7L))).thenReturn(List.of(row));
        when(stagingRepository.save(any(HaConnectorAlertStaging.class)))
            .thenAnswer(inv -> inv.getArgument(0));
        when(elasticsearchService.index(anyString(), any()))
            .thenThrow(new RuntimeException("opensearch down"));

        ConnectorPromoteResult result = promoteService.promoteByIds(List.of(7L));

        assertThat(result.getPromoted()).isEqualTo(0);
        assertThat(result.getFailed()).isEqualTo(1);
        assertThat(row.getStatus()).isEqualTo(ConnectorStagingStatus.FAILED);
        assertThat(row.getPromoteError()).contains("opensearch down");
        assertThat(row.getPromotedDocId()).isNull();
    }

    @Test
    void promoteSkipsAlreadyPromotedAndMissingIds() {
        HaConnectorAlertStaging already = pendingRow(1L, "a");
        already.setStatus(ConnectorStagingStatus.PROMOTED);
        already.setPromotedIndex("v3-hive-connector-promoted-2026.08.24");
        already.setPromotedDocId("old");
        when(stagingRepository.findByIdIn(List.of(1L, 99L))).thenReturn(List.of(already));

        ConnectorPromoteResult result = promoteService.promoteByIds(List.of(1L, 99L));

        assertThat(result.getSkipped()).isEqualTo(2);
        assertThat(result.getPromoted()).isEqualTo(0);
        verify(elasticsearchService, never()).index(anyString(), any());
    }

    @Test
    void assertSafeDestinationRejectsAlertIndices() {
        assertThatThrownBy(() -> ConnectorStagingPromoteService.assertSafeDestination("v3-hive-alert-2026.08.24"))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("alert");
        assertThatThrownBy(() -> ConnectorStagingPromoteService.assertSafeDestination("v3-hive-log-2026.08.24"))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("unexpected");
    }

    @Test
    void promoteOneRejectsNullId() {
        assertThatThrownBy(() -> promoteService.promoteOne(null))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void buildPromotedDocumentNeverClaimsCorrelatedAlert() {
        HaConnectorAlertStaging row = pendingRow(5L, "x");
        Map<String, Object> doc = ConnectorStagingPromoteService.buildPromotedDocument(
            row,
            "batch-1",
            "v3-hive-connector-promoted-2026.08.24"
        );
        assertThat(doc.get("ha.siem.correlated_alert")).isEqualTo(false);
        assertThat(doc.get("ha.siem.inject_used")).isEqualTo(false);
        assertThat(doc.get("ha.correlation.status")).isEqualTo("not_correlated");
    }

    private static HaConnectorAlertStaging pendingRow(long id, String externalId) {
        HaConnectorAlertStaging row = new HaConnectorAlertStaging();
        row.setId(id);
        row.setConnectorInstanceId(11L);
        row.setConnectorId("crowdstrike");
        row.setExternalId(externalId);
        row.setTitle("stub title");
        row.setSeverity("high");
        row.setHostname("host-a");
        row.setIngestBatchId("ingest-1");
        row.setIngestedAt(Instant.parse("2026-08-24T12:00:00Z"));
        row.setStatus(ConnectorStagingStatus.PENDING);
        return row;
    }
}
