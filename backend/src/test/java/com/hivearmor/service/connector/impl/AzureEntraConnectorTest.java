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
class AzureEntraConnectorTest {

    @Mock
    private MicrosoftOAuthClient oauth;

    private AzureEntraConnector connector;

    @BeforeEach
    void setUp() {
        connector = new AzureEntraConnector(oauth);
    }

    @Test
    void capabilitiesIncludeDisableUser() {
        assertThat(connector.capabilities()).containsExactlyInAnyOrder(
            ConnectorCapability.PULL_AUDIT,
            ConnectorCapability.DISABLE_USER
        );
        assertThat(connector.schema().getCapabilities()).contains(ConnectorCapability.DISABLE_USER);
    }

    @Test
    void disableUser_patchesAccountEnabledFalse() throws Exception {
        when(oauth.fetchAccessToken(anyString(), anyString(), anyString(), eq(MicrosoftOAuthClient.graphScope())))
            .thenReturn("graph-access-token");
        Map<String, Object> patchResult = new LinkedHashMap<>();
        patchResult.put("ok", true);
        patchResult.put("httpStatus", 204);
        patchResult.put("message", "Graph PATCH OK (HTTP 204)");
        when(oauth.patchJson(anyString(), eq("graph-access-token"), eq("{\"accountEnabled\":false}")))
            .thenReturn(patchResult);

        Map<String, Object> out = connector.disableUser(
            Map.of(
                "tenant_id", "11111111-1111-1111-1111-111111111111",
                "client_id", "app-id",
                "client_secret", "real-secret"
            ),
            "alice@contoso.com"
        );

        assertThat(out.get("ok")).isEqualTo(true);
        assertThat(out.get("userId")).isEqualTo("alice@contoso.com");
        assertThat(out.get("httpStatus")).isEqualTo(204);
        assertThat(out.get("message").toString()).contains("disabled");

        ArgumentCaptor<String> urlCaptor = ArgumentCaptor.forClass(String.class);
        verify(oauth).patchJson(urlCaptor.capture(), eq("graph-access-token"), eq("{\"accountEnabled\":false}"));
        assertThat(urlCaptor.getValue())
            .isEqualTo("https://graph.microsoft.com/v1.0/users/alice%40contoso.com");
    }

    @Test
    void disableUser_refusesPlaceholderCredentials() {
        assertThatThrownBy(() -> connector.disableUser(
            Map.of(
                "tenant_id", "11111111-1111-1111-1111-111111111111",
                "client_id", "app-id",
                "client_secret", "placeholder"
            ),
            "user-guid"
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("placeholder");
    }

    @Test
    void disableUser_failsClosedWithoutCredentials() {
        assertThatThrownBy(() -> connector.disableUser(Map.of(), "user-guid"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Missing required");
    }

    @Test
    void disableUser_requiresUserKey() {
        assertThatThrownBy(() -> connector.disableUser(
            Map.of(
                "tenant_id", "11111111-1111-1111-1111-111111111111",
                "client_id", "app-id",
                "client_secret", "real-secret"
            ),
            "  "
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("userId");
    }
}
