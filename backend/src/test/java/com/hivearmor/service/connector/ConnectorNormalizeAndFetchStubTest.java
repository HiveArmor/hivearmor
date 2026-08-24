package com.hivearmor.service.connector;

import com.hivearmor.service.connector.impl.AzureDefenderConnector;
import com.hivearmor.service.connector.impl.CrowdStrikeConnector;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ConnectorNormalizeAndFetchStubTest {

    @Test
    void crowdStrikeNormalizeBuildsStagingReadyAlert() {
        CrowdStrikeConnector cs = new CrowdStrikeConnector(false);
        NormalizedAlert alert = cs.normalize(Map.of(
            "detection_id", "ldt:abc",
            "title", "Suspicious PowerShell",
            "max_severity", "critical",
            "hostname", "wkstn-1",
            "local_ip", "192.168.1.10"
        ));
        assertThat(alert.getSource()).isEqualTo(CrowdStrikeConnector.ID);
        assertThat(alert.getExternalId()).isEqualTo("ldt:abc");
        assertThat(alert.getSeverity()).isEqualTo("critical");
        assertThat(alert.getHostname()).isEqualTo("wkstn-1");
        assertThat(alert.getSrcIp()).isEqualTo("192.168.1.10");
        assertThat(alert.toMap()).containsKey("rawEvent");
    }

    @Test
    void azureDefenderNormalizeMapsSecurityCenterFields() {
        AzureDefenderConnector defender = new AzureDefenderConnector();
        NormalizedAlert alert = defender.normalize(Map.of(
            "id", "da123",
            "title", "Malware detected",
            "description", "Defender found malware",
            "severity", "High",
            "computerDnsName", "srv-01.contoso.local",
            "lastIpAddress", "10.1.2.3",
            "alertCreationTime", "2026-08-24T12:00:00Z"
        ));
        assertThat(alert.getSource()).isEqualTo(AzureDefenderConnector.ID);
        assertThat(alert.getExternalId()).isEqualTo("da123");
        assertThat(alert.getHostname()).isEqualTo("srv-01.contoso.local");
        assertThat(alert.getSrcIp()).isEqualTo("10.1.2.3");
        assertThat(alert.getCreatedAt()).isEqualTo(java.time.Instant.parse("2026-08-24T12:00:00Z"));
    }

    @Test
    void azureDefenderFetchWithPlaceholderReturnsEmpty() {
        AzureDefenderConnector defender = new AzureDefenderConnector();
        List<NormalizedAlert> alerts = defender.fetchAlerts(
            Map.of(
                "tenant_id", "00000000-0000-0000-0000-000000000000",
                "client_id", "placeholder-client",
                "client_secret", "placeholder-secret"
            ),
            java.time.Instant.now().minusSeconds(60)
        );
        assertThat(alerts).isEmpty();
    }

    @Test
    void ingestResultMapNeverClaimsOpensearchAlertIndex() {
        ConnectorIngestResult result = new ConnectorIngestResult(
            "batch-1",
            1L,
            CrowdStrikeConnector.ID,
            2,
            1,
            1,
            List.of()
        );
        Map<String, Object> map = result.toMap();
        assertThat(map.get("destination")).isEqualTo("ha_connector_alert_staging");
        assertThat(map.get("persisted")).isEqualTo(true);
        assertThat(String.valueOf(map.get("note"))).contains("not OpenSearch");
        assertThat(String.valueOf(map.get("note"))).contains("follow-up ADR");
    }
}
