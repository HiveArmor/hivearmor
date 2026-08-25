package com.hivearmor.service.connector.impl;

import com.hivearmor.service.connector.ConnectorCapability;
import com.hivearmor.service.connector.MicrosoftOAuthClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AzureDefenderConnectorTest {

    @Mock
    private MicrosoftOAuthClient oauth;

    private AzureDefenderConnector connector;

    @BeforeEach
    void setUp() {
        connector = new AzureDefenderConnector(oauth, true);
    }

    @Test
    void capabilitiesHonorFeatureFlag() {
        assertThat(new AzureDefenderConnector(oauth, false).capabilities())
            .containsExactly(ConnectorCapability.PULL_ALERTS);
        assertThat(connector.capabilities()).containsExactlyInAnyOrder(
            ConnectorCapability.PULL_ALERTS,
            ConnectorCapability.ISOLATE_HOST,
            ConnectorCapability.UNISOLATE_HOST
        );
        assertThat(connector.schema().getCapabilities()).contains(
            ConnectorCapability.ISOLATE_HOST,
            ConnectorCapability.UNISOLATE_HOST
        );
    }

    @Test
    void isolateHost_postsDefenderIsolate() throws Exception {
        when(oauth.fetchAccessToken(anyString(), anyString(), anyString(), eq(MicrosoftOAuthClient.defenderScope())))
            .thenReturn("defender-access-token");
        Map<String, Object> postResult = new LinkedHashMap<>();
        postResult.put("ok", true);
        postResult.put("httpStatus", 201);
        postResult.put("message", "Defender POST OK (HTTP 201)");
        when(oauth.postJson(
            eq("https://api.securitycenter.microsoft.com/api/machines/machine-1/isolate"),
            eq("defender-access-token"),
            anyString()
        )).thenReturn(postResult);

        Map<String, Object> out = connector.isolateHost(validConfig(), "machine-1", null);

        assertThat(out.get("ok")).isEqualTo(true);
        assertThat(out.get("machineId")).isEqualTo("machine-1");
        assertThat(out.get("action")).isEqualTo("isolate_host");
        assertThat(out.get("httpStatus")).isEqualTo(201);
        assertThat(out.get("message").toString()).contains("isolate");

        ArgumentCaptor<String> urlCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> bodyCaptor = ArgumentCaptor.forClass(String.class);
        verify(oauth).postJson(urlCaptor.capture(), eq("defender-access-token"), bodyCaptor.capture());
        assertThat(urlCaptor.getValue())
            .isEqualTo("https://api.securitycenter.microsoft.com/api/machines/machine-1/isolate");
        assertThat(bodyCaptor.getValue()).contains("IsolationType").contains("Full");
    }

    @Test
    void unisolateHost_postsDefenderUnisolate() throws Exception {
        when(oauth.fetchAccessToken(anyString(), anyString(), anyString(), eq(MicrosoftOAuthClient.defenderScope())))
            .thenReturn("defender-access-token");
        Map<String, Object> postResult = new LinkedHashMap<>();
        postResult.put("ok", true);
        postResult.put("httpStatus", 201);
        when(oauth.postJson(anyString(), eq("defender-access-token"), anyString())).thenReturn(postResult);

        Map<String, Object> out = connector.unisolateHost(validConfig(), "machine-9", "lift");

        assertThat(out.get("ok")).isEqualTo(true);
        assertThat(out.get("action")).isEqualTo("unisolate_host");

        ArgumentCaptor<String> urlCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> bodyCaptor = ArgumentCaptor.forClass(String.class);
        verify(oauth).postJson(urlCaptor.capture(), eq("defender-access-token"), bodyCaptor.capture());
        assertThat(urlCaptor.getValue()).endsWith("/api/machines/machine-9/unisolate");
        assertThat(bodyCaptor.getValue()).contains("\"Comment\":\"lift\"");
        assertThat(bodyCaptor.getValue()).doesNotContain("IsolationType");
    }

    @Test
    void isolateHost_refusesWhenFlagOff() {
        AzureDefenderConnector gated = new AzureDefenderConnector(oauth, false);
        assertThatThrownBy(() -> gated.isolateHost(validConfig(), "machine-1", null))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("vendor-isolate-enabled=false");
    }

    @Test
    void isolateHost_refusesPlaceholderCredentials() {
        assertThatThrownBy(() -> connector.isolateHost(
            Map.of(
                "tenant_id", "11111111-1111-1111-1111-111111111111",
                "client_id", "app-id",
                "client_secret", "placeholder"
            ),
            "machine-1",
            null
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("placeholder");
    }

    @Test
    void isolateHost_failsClosedWithoutCredentials() {
        assertThatThrownBy(() -> connector.isolateHost(Map.of(), "machine-1", null))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Missing required");
    }

    @Test
    void isolateHost_requiresMachineId() {
        assertThatThrownBy(() -> connector.isolateHost(validConfig(), "  ", null))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("machineId");
    }

    private static Map<String, String> validConfig() {
        return Map.of(
            "tenant_id", "11111111-1111-1111-1111-111111111111",
            "client_id", "app-id",
            "client_secret", "real-secret"
        );
    }
}
