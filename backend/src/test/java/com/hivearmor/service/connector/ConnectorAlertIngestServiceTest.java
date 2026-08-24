package com.hivearmor.service.connector;

import com.hivearmor.domain.connector.HaConnectorAlertStaging;
import com.hivearmor.domain.connector.HaConnectorInstance;
import com.hivearmor.repository.connector.HaConnectorAlertStagingRepository;
import com.hivearmor.repository.connector.HaConnectorInstanceRepository;
import com.hivearmor.service.connector.impl.CrowdStrikeConnector;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ConnectorAlertIngestServiceTest {

    @Mock
    private HaConnectorRegistry registry;
    @Mock
    private HaConnectorInstanceRepository instanceRepository;
    @Mock
    private HaConnectorAlertStagingRepository stagingRepository;
    @Mock
    private HaConnectorInstanceService instanceService;

    private ConnectorAlertIngestService ingestService;
    private CrowdStrikeConnector crowdStrike;

    @BeforeEach
    void setUp() {
        crowdStrike = new CrowdStrikeConnector(false);
        ingestService = new ConnectorAlertIngestService(
            registry,
            instanceRepository,
            stagingRepository,
            instanceService
        );
    }

    @Test
    void stageNormalizedPersistsToPostgresQueueNotOpensearch() {
        HaConnectorInstance row = crowdstrikeRow(11L);
        when(instanceRepository.findById(11L)).thenReturn(Optional.of(row));
        when(stagingRepository.existsByConnectorInstanceIdAndExternalId(11L, "det-1")).thenReturn(false);
        when(stagingRepository.save(any(HaConnectorAlertStaging.class)))
            .thenAnswer(inv -> inv.getArgument(0));
        when(instanceRepository.save(any(HaConnectorInstance.class)))
            .thenAnswer(inv -> inv.getArgument(0));

        NormalizedAlert alert = crowdStrike.normalize(Map.of(
            "detection_id", "det-1",
            "title", "Stub CrowdStrike detection",
            "severity", "high",
            "hostname", "host-a",
            "src_ip", "10.0.0.1"
        ));

        ConnectorIngestResult result = ingestService.stageNormalized(
            11L,
            CrowdStrikeConnector.ID,
            List.of(alert)
        );

        assertThat(result.getInserted()).isEqualTo(1);
        assertThat(result.getSkippedDuplicate()).isEqualTo(0);
        assertThat(result.getFetched()).isEqualTo(1);
        assertThat(result.toMap().get("persisted")).isEqualTo(true);
        assertThat(result.toMap().get("destination")).isEqualTo("ha_connector_alert_staging");
        assertThat(String.valueOf(result.toMap().get("note")))
            .contains("not OpenSearch")
            .contains("follow-up ADR");

        ArgumentCaptor<HaConnectorAlertStaging> cap = ArgumentCaptor.forClass(HaConnectorAlertStaging.class);
        verify(stagingRepository).save(cap.capture());
        HaConnectorAlertStaging saved = cap.getValue();
        assertThat(saved.getExternalId()).isEqualTo("det-1");
        assertThat(saved.getConnectorId()).isEqualTo(CrowdStrikeConnector.ID);
        assertThat(saved.getTitle()).isEqualTo("Stub CrowdStrike detection");
        assertThat(saved.getIngestBatchId()).isEqualTo(result.getBatchId());

        assertThat(row.getLastIngestBatchId()).isEqualTo(result.getBatchId());
        assertThat(row.getLastIngestCount()).isEqualTo(1);
        assertThat(row.getLastIngestAt()).isNotNull();
    }

    @Test
    void stageNormalizedSkipsDuplicates() {
        HaConnectorInstance row = crowdstrikeRow(11L);
        when(instanceRepository.findById(11L)).thenReturn(Optional.of(row));
        when(stagingRepository.existsByConnectorInstanceIdAndExternalId(11L, "det-1")).thenReturn(true);
        when(instanceRepository.save(any(HaConnectorInstance.class)))
            .thenAnswer(inv -> inv.getArgument(0));

        NormalizedAlert alert = crowdStrike.normalize(Map.of("detection_id", "det-1", "title", "dup"));

        ConnectorIngestResult result = ingestService.stageNormalized(
            11L,
            CrowdStrikeConnector.ID,
            List.of(alert)
        );

        assertThat(result.getInserted()).isEqualTo(0);
        assertThat(result.getSkippedDuplicate()).isEqualTo(1);
        verify(stagingRepository, never()).save(any());
    }

    @Test
    void ingestFetchesThenStages() {
        HaConnectorInstance row = crowdstrikeRow(22L);
        when(instanceRepository.findById(22L)).thenReturn(Optional.of(row));
        when(registry.require(CrowdStrikeConnector.ID)).thenReturn(crowdStrike);
        NormalizedAlert alert = crowdStrike.normalize(Map.of(
            "detection_id", "live-stub-9",
            "title", "Fetched stub"
        ));
        when(instanceService.fetchAlertsNormalized(eq(22L), any(Instant.class)))
            .thenReturn(List.of(alert));
        when(stagingRepository.existsByConnectorInstanceIdAndExternalId(22L, "live-stub-9"))
            .thenReturn(false);
        when(stagingRepository.save(any(HaConnectorAlertStaging.class)))
            .thenAnswer(inv -> inv.getArgument(0));
        when(instanceRepository.save(any(HaConnectorInstance.class)))
            .thenAnswer(inv -> inv.getArgument(0));

        ConnectorIngestResult result = ingestService.ingest(22L, Instant.parse("2026-08-24T00:00:00Z"));

        assertThat(result.getInserted()).isEqualTo(1);
        assertThat(result.getConnectorInstanceId()).isEqualTo(22L);
        verify(instanceService, times(1)).fetchAlertsNormalized(eq(22L), any(Instant.class));
        verify(stagingRepository).save(any(HaConnectorAlertStaging.class));
    }

    private static HaConnectorInstance crowdstrikeRow(long id) {
        HaConnectorInstance row = new HaConnectorInstance();
        row.setId(id);
        row.setConnectorId(CrowdStrikeConnector.ID);
        row.setName("cs-" + id);
        row.setEnabled(true);
        row.setCreatedAt(Instant.now());
        row.setUpdatedAt(Instant.now());
        return row;
    }
}
