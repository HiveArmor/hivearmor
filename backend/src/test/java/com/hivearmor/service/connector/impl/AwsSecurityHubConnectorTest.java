package com.hivearmor.service.connector.impl;

import com.hivearmor.service.connector.AwsNetworkBlockClient;
import com.hivearmor.service.connector.ConnectorCapability;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AwsSecurityHubConnectorTest {

    @Mock
    private AwsNetworkBlockClient awsNetwork;

    private AwsSecurityHubConnector connector;

    @BeforeEach
    void setUp() {
        connector = new AwsSecurityHubConnector(awsNetwork);
    }

    @Test
    void capabilitiesIncludeBlockIp() {
        assertThat(connector.capabilities()).containsExactlyInAnyOrder(
            ConnectorCapability.PULL_ALERTS,
            ConnectorCapability.BLOCK_IP
        );
        assertThat(connector.schema().getCapabilities()).contains(ConnectorCapability.BLOCK_IP);
        assertThat(connector.schema().getDescription()).containsIgnoringCase("NetworkAcl");
    }

    @Test
    void blockIp_livePathCreatesNaclDeny() {
        Map<String, Object> apiResult = new LinkedHashMap<>();
        apiResult.put("ok", true);
        apiResult.put("httpStatus", 200);
        apiResult.put("cidr", "203.0.113.50/32");
        apiResult.put("networkAclId", "acl-abc123");
        apiResult.put("message", "AWS NACL deny entry created (HTTP 200)");
        when(awsNetwork.createNetworkAclDenyEntry(
            eq("us-east-1"),
            eq("AKIATESTKEYID0001"),
            eq("real-secret-access-key"),
            isNull(),
            eq("acl-abc123"),
            eq("203.0.113.50/32"),
            eq(100),
            eq(false)
        )).thenReturn(apiResult);

        Map<String, Object> out = connector.blockIp(
            Map.of(
                "region", "us-east-1",
                "access_key_id", "AKIATESTKEYID0001",
                "secret_access_key", "real-secret-access-key",
                "network_acl_id", "acl-abc123"
            ),
            "203.0.113.50"
        );

        assertThat(out.get("ok")).isEqualTo(true);
        assertThat(out.get("ip")).isEqualTo("203.0.113.50");
        assertThat(out.get("httpStatus")).isEqualTo(200);
        assertThat(out.get("message").toString()).contains("NACL");
        verify(awsNetwork).createNetworkAclDenyEntry(
            anyString(), anyString(), anyString(), isNull(), anyString(), anyString(), anyInt(), anyBoolean()
        );
    }

    @Test
    void blockIp_dryRunSkipsAwsCall() {
        Map<String, Object> out = connector.blockIp(
            Map.of(
                "region", "eu-west-1",
                "access_key_id", "AKIATESTKEYID0001",
                "secret_access_key", "real-secret-access-key",
                "dry_run", "true"
            ),
            "198.51.100.9"
        );

        assertThat(out.get("ok")).isEqualTo(true);
        assertThat(out.get("dryRun")).isEqualTo(true);
        assertThat(out.get("status")).isEqualTo("dry_run");
        assertThat(out.get("cidr")).isEqualTo("198.51.100.9/32");
        assertThat(out.get("message").toString()).containsIgnoringCase("no AWS API call");
        verifyNoInteractions(awsNetwork);
    }

    @Test
    void blockIp_refusesPlaceholderCredentials() {
        assertThatThrownBy(() -> connector.blockIp(
            Map.of(
                "region", "us-east-1",
                "access_key_id", "placeholder",
                "secret_access_key", "placeholder",
                "network_acl_id", "acl-1"
            ),
            "203.0.113.1"
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("placeholder");
        verifyNoInteractions(awsNetwork);
    }

    @Test
    void blockIp_failsClosedWithoutCredentials() {
        assertThatThrownBy(() -> connector.blockIp(Map.of(), "203.0.113.1"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Missing required");
        verifyNoInteractions(awsNetwork);
    }

    @Test
    void blockIp_liveRequiresNetworkAclId() {
        assertThatThrownBy(() -> connector.blockIp(
            Map.of(
                "region", "us-east-1",
                "access_key_id", "AKIATESTKEYID0001",
                "secret_access_key", "real-secret-access-key"
            ),
            "203.0.113.1"
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("network_acl_id");
        verifyNoInteractions(awsNetwork);
    }

    @Test
    void blockIp_requiresValidIpv4() {
        assertThatThrownBy(() -> connector.blockIp(
            Map.of(
                "region", "us-east-1",
                "access_key_id", "AKIATESTKEYID0001",
                "secret_access_key", "real-secret-access-key",
                "network_acl_id", "acl-1"
            ),
            "not-an-ip"
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("IPv4");
        verifyNoInteractions(awsNetwork);
    }

    @Test
    void testConnection_refusesPlaceholders() {
        assertThat(connector.testConnection(Map.of(
            "region", "us-east-1",
            "access_key_id", "placeholder",
            "secret_access_key", "placeholder"
        )).isOk()).isFalse();
    }
}
