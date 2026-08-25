package com.hivearmor.service.connector;

import com.hivearmor.service.connector.impl.AwsSecurityHubConnector;
import com.hivearmor.service.connector.impl.AzureDefenderConnector;
import com.hivearmor.service.connector.impl.AzureEntraConnector;
import com.hivearmor.service.connector.impl.CrowdStrikeConnector;
import com.hivearmor.service.connector.impl.GoogleWorkspaceConnector;
import com.hivearmor.service.connector.impl.OktaConnector;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Conformance: every registered connector exposes schema / capabilities /
 * normalize / test / fetch without throwing on empty-ish inputs where specified.
 */
class HaConnectorConformanceTest {

    private final HaConnectorRegistry registry = new HaConnectorRegistry(false);

    @Test
    void registryContainsExactlyFirstSix() {
        Set<String> ids = registry.all().stream().map(HaConnector::connectorId).collect(Collectors.toSet());
        assertThat(ids).containsExactlyInAnyOrder(
            CrowdStrikeConnector.ID,
            AzureDefenderConnector.ID,
            OktaConnector.ID,
            AzureEntraConnector.ID,
            AwsSecurityHubConnector.ID,
            GoogleWorkspaceConnector.ID
        );
        assertThat(registry.size()).isEqualTo(6);
    }

    @Test
    void googleWorkspacePullAuditAndFailsWithoutConfig() {
        HaConnector gw = registry.require(GoogleWorkspaceConnector.ID);
        assertThat(gw.capabilities()).containsExactly(ConnectorCapability.PULL_AUDIT);
        ConnectionTestResult empty = gw.testConnection(Map.of());
        assertThat(empty.isOk()).isFalse();
        assertThat(empty.getMessage()).containsIgnoringCase("missing");
        ConnectionTestResult placeholders = gw.testConnection(Map.of(
            "domain", "example.com",
            "client_email", "placeholder@example.com",
            "private_key", "-----BEGIN PLACEHOLDER-----",
            "admin_email", "admin@example.com"
        ));
        assertThat(placeholders.isOk()).isFalse();
        assertThat(placeholders.getMessage()).containsIgnoringCase("placeholder");
    }

    @Test
    void azureEntraDeclaresDisableUser() {
        HaConnector entra = registry.require(AzureEntraConnector.ID);
        assertThat(entra.capabilities()).contains(
            ConnectorCapability.PULL_AUDIT,
            ConnectorCapability.DISABLE_USER
        );
        assertThat(entra.schema().getCapabilities()).contains(ConnectorCapability.DISABLE_USER);
        assertThat(entra.schema().getDescription()).containsIgnoringCase("UPN");
    }

    @Test
    void awsSecurityHubDeclaresBlockIp() {
        HaConnector aws = registry.require(AwsSecurityHubConnector.ID);
        assertThat(aws.capabilities()).contains(
            ConnectorCapability.PULL_ALERTS,
            ConnectorCapability.BLOCK_IP
        );
        assertThat(aws.schema().getCapabilities()).contains(ConnectorCapability.BLOCK_IP);
        assertThat(aws.schema().getDescription()).containsIgnoringCase("NetworkAcl");
    }

    @Test
    void everyConnectorHasNonEmptySchemaAndCapabilities() {
        for (HaConnector c : registry.all()) {
            ConnectorSchema schema = c.schema();
            assertThat(schema.getConnectorId()).isEqualTo(c.connectorId());
            assertThat(schema.getConnectorName()).isNotBlank();
            assertThat(schema.getCategory()).isNotBlank();
            assertThat(schema.getFields()).isNotEmpty();
            assertThat(c.capabilities()).isNotEmpty();
            assertThat(schema.getCapabilities()).containsAll(c.capabilities());
            boolean hasSecret = schema.getFields().stream().anyMatch(ConnectorField::isSecret);
            assertThat(hasSecret).as(c.connectorId() + " should declare at least one secret field").isTrue();
        }
    }

    @Test
    void normalizeAlwaysIncludesSourceAndExternalId() {
        for (HaConnector c : registry.all()) {
            Map<String, Object> raw = new LinkedHashMap<>();
            raw.put("id", "ext-1");
            raw.put("title", "sample");
            raw.put("severity", "high");
            raw.put("hostname", "host-a");
            raw.put("src_ip", "203.0.113.10");
            NormalizedAlert n = c.normalize(raw);
            assertThat(n.getSource()).isEqualTo(c.connectorId());
            assertThat(n.getExternalId()).isNotBlank();
            assertThat(n.getSeverity()).isNotBlank();
            Map<String, Object> map = n.toMap();
            assertThat(map).containsKeys("source", "externalId", "severity");
        }
    }

    @Test
    void testConnectionFailsClosedWithoutCredentials() {
        for (HaConnector c : registry.all()) {
            ConnectionTestResult r = c.testConnection(Map.of());
            assertThat(r.isOk()).as(c.connectorId()).isFalse();
            assertThat(r.getMessage()).isNotBlank();
        }
    }

    @Test
    void crowdstrikeIsolateCapabilityHonorsFeatureFlag() {
        HaConnector gated = new CrowdStrikeConnector(false);
        assertThat(gated.capabilities()).contains(ConnectorCapability.PULL_ALERTS);
        assertThat(gated.capabilities()).doesNotContain(ConnectorCapability.ISOLATE_HOST);

        HaConnector open = new CrowdStrikeConnector(true);
        assertThat(open.capabilities()).contains(
            ConnectorCapability.PULL_ALERTS,
            ConnectorCapability.ISOLATE_HOST,
            ConnectorCapability.UNISOLATE_HOST,
            ConnectorCapability.KILL_PROCESS
        );
    }

    
    @Test
    void azureDefenderIsolateCapabilityHonorsFeatureFlag() {
        HaConnector gated = new AzureDefenderConnector(false);
        assertThat(gated.capabilities()).contains(ConnectorCapability.PULL_ALERTS);
        assertThat(gated.capabilities()).doesNotContain(ConnectorCapability.ISOLATE_HOST);

        HaConnector open = new AzureDefenderConnector(true);
        assertThat(open.capabilities()).contains(
            ConnectorCapability.PULL_ALERTS,
            ConnectorCapability.ISOLATE_HOST,
            ConnectorCapability.UNISOLATE_HOST
        );
        assertThat(open.capabilities()).doesNotContain(ConnectorCapability.KILL_PROCESS);
    }

@Test
    void fetchAlertsWithoutLiveCredsReturnsEmptyNotException() {
        for (HaConnector c : registry.all()) {
            Map<String, String> cfg = minimalConfig(c);
            List<NormalizedAlert> alerts = c.fetchAlerts(cfg, Instant.now().minusSeconds(60));
            assertThat(alerts).isNotNull();
        }
    }

    @Test
    void urlGuardRejectsPrivateHosts() {
        assertThatThrownBy(() -> ConnectorUrlGuard.requireHttpsUrl("https://127.0.0.1/x"))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> ConnectorUrlGuard.requireHttpsUrl("http://api.crowdstrike.com"))
            .isInstanceOf(IllegalArgumentException.class);
    }

    private static Map<String, String> minimalConfig(HaConnector c) {
        Map<String, String> cfg = new LinkedHashMap<>();
        for (ConnectorField f : c.schema().getFields()) {
            if (f.getDefaultValue() != null) {
                cfg.put(f.getName(), f.getDefaultValue());
            } else if (f.isRequired()) {
                cfg.put(f.getName(), "placeholder");
            }
        }
        return cfg;
    }
}
