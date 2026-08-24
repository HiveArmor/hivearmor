package com.hivearmor.service.connector;

import com.hivearmor.domain.connector.HaConnectorInstance;
import com.hivearmor.repository.connector.HaConnectorInstanceRepository;
import com.hivearmor.service.connector.impl.OktaConnector;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlaybookConnectorDispatcherTest {

    @Mock
    private HaConnectorInstanceService instanceService;
    @Mock
    private HaConnectorInstanceRepository instanceRepository;
    @Mock
    private OktaIdentityClient oktaIdentityClient;

    private PlaybookConnectorDispatcher dispatcher;

    @BeforeEach
    void setUp() {
        dispatcher = new PlaybookConnectorDispatcher(
            instanceService,
            new HaConnectorRegistry(oktaIdentityClient, false),
            instanceRepository
        );
    }

    @Test
    void supportsKnownConnectorActions() {
        assertThat(dispatcher.supports("connector.test")).isTrue();
        assertThat(dispatcher.supports("pull_alerts")).isTrue();
        assertThat(dispatcher.supports("disable_user")).isTrue();
        assertThat(dispatcher.supports("isolate_host")).isFalse();
    }

    @Test
    void disableUserRequiresUserIdOrUsername() {
        HaConnectorInstance row = oktaRow(9L);
        when(instanceRepository.findById(9L)).thenReturn(Optional.of(row));
        when(instanceService.decryptedConfig(9L)).thenReturn(Map.of(
            "org_url", "https://example.okta.com",
            "api_token", "real-token"
        ));

        assertThatThrownBy(() -> dispatcher.dispatch(
            "disable_user",
            Map.of("connectorInstanceId", 9L)
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("userId");
    }

    @Test
    void disableUserDeactivatesViaOkta() {
        HaConnectorInstance row = oktaRow(9L);
        when(instanceRepository.findById(9L)).thenReturn(Optional.of(row));
        when(instanceService.decryptedConfig(9L)).thenReturn(Map.of(
            "org_url", "https://example.okta.com",
            "api_token", "real-token"
        ));
        Map<String, Object> apiResult = new LinkedHashMap<>();
        apiResult.put("ok", true);
        apiResult.put("httpStatus", 200);
        apiResult.put("userId", "00uABC");
        apiResult.put("message", "Okta user deactivated (HTTP 200)");
        when(oktaIdentityClient.deactivateUser(
            eq("https://example.okta.com"),
            eq("real-token"),
            eq("00uABC")
        )).thenReturn(apiResult);

        Map<String, Object> out = dispatcher.dispatch(
            "disable_user",
            Map.of("connectorInstanceId", 9L, "userId", "00uABC")
        );
        assertThat(out.get("status")).isEqualTo("deactivated");
        assertThat(out.get("connectorId")).isEqualTo(OktaConnector.ID);
        assertThat(out.get("ok")).isEqualTo(true);
        assertThat(out.get("userId")).isEqualTo("00uABC");
    }

    @Test
    void disableUserResolvesUsernameThenDeactivates() {
        HaConnectorInstance row = oktaRow(9L);
        when(instanceRepository.findById(9L)).thenReturn(Optional.of(row));
        when(instanceService.decryptedConfig(9L)).thenReturn(Map.of(
            "org_url", "https://example.okta.com",
            "api_token", "real-token"
        ));
        when(oktaIdentityClient.resolveUserIdByLogin(
            eq("https://example.okta.com"),
            eq("real-token"),
            eq("alice@example.com")
        )).thenReturn("00uresolved");
        Map<String, Object> apiResult = new LinkedHashMap<>();
        apiResult.put("ok", true);
        apiResult.put("httpStatus", 200);
        apiResult.put("userId", "00uresolved");
        apiResult.put("message", "Okta user deactivated (HTTP 200)");
        when(oktaIdentityClient.deactivateUser(anyString(), anyString(), eq("00uresolved")))
            .thenReturn(apiResult);

        Map<String, Object> out = dispatcher.dispatch(
            "disable_user",
            Map.of(
                "connectorInstanceId", 9L,
                "params", Map.of("username", "alice@example.com")
            )
        );
        assertThat(out.get("status")).isEqualTo("deactivated");
        assertThat(out.get("userId")).isEqualTo("00uresolved");
    }

    @Test
    void disableUserRefusesPlaceholderCredentials() {
        HaConnectorInstance row = oktaRow(9L);
        when(instanceRepository.findById(9L)).thenReturn(Optional.of(row));
        when(instanceService.decryptedConfig(9L)).thenReturn(Map.of(
            "org_url", "https://example.okta.com",
            "api_token", "placeholder"
        ));

        assertThatThrownBy(() -> dispatcher.dispatch(
            "disable_user",
            Map.of("connectorInstanceId", 9L, "userId", "00u1")
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("placeholder");
    }

    @Test
    void pullAlertsRequiresInstanceId() {
        assertThatThrownBy(() -> dispatcher.dispatch("pull_alerts", Map.of()))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("connectorInstanceId");
    }

    @Test
    void resolvesByConnectorId() {
        HaConnectorInstance row = oktaRow(3L);
        when(instanceRepository.findByConnectorIdOrderByNameAsc(OktaConnector.ID))
            .thenReturn(List.of(row));
        when(instanceService.decryptedConfig(3L)).thenReturn(Map.of(
            "org_url", "https://example.okta.com",
            "api_token", "real-token"
        ));
        Map<String, Object> apiResult = new LinkedHashMap<>();
        apiResult.put("ok", true);
        apiResult.put("httpStatus", 200);
        apiResult.put("userId", "00u1");
        apiResult.put("message", "ok");
        when(oktaIdentityClient.deactivateUser(anyString(), anyString(), eq("00u1")))
            .thenReturn(apiResult);

        Map<String, Object> out = dispatcher.dispatch(
            "disable_user",
            Map.of("connectorId", OktaConnector.ID, "userId", "00u1")
        );
        assertThat(out.get("connectorInstanceId")).isEqualTo(3L);
        assertThat(out.get("status")).isEqualTo("deactivated");
    }

    private static HaConnectorInstance oktaRow(long id) {
        HaConnectorInstance row = new HaConnectorInstance();
        row.setId(id);
        row.setConnectorId(OktaConnector.ID);
        row.setEnabled(true);
        return row;
    }
}
