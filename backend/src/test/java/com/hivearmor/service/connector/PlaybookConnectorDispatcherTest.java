package com.hivearmor.service.connector;

import com.hivearmor.domain.connector.HaConnectorInstance;
import com.hivearmor.repository.connector.HaConnectorInstanceRepository;
import com.hivearmor.service.connector.impl.AzureEntraConnector;
import com.hivearmor.service.connector.impl.CrowdStrikeConnector;
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
import static org.mockito.ArgumentMatchers.any;
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
    @Mock
    private MicrosoftOAuthClient microsoftOAuthClient;
    @Mock
    private ConnectorAlertIngestService ingestService;

    private PlaybookConnectorDispatcher dispatcher;

    @BeforeEach
    void setUp() {
        dispatcher = new PlaybookConnectorDispatcher(
            instanceService,
            new HaConnectorRegistry(microsoftOAuthClient, oktaIdentityClient, false),
            instanceRepository,
            ingestService
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
    void pullAlertsPersistsToStagingQueue() {
        HaConnectorInstance row = crowdstrikeRow(7L);
        when(instanceRepository.findById(7L)).thenReturn(Optional.of(row));
        ConnectorIngestResult ingest = new ConnectorIngestResult(
            "batch-abc",
            7L,
            CrowdStrikeConnector.ID,
            2,
            2,
            0,
            List.of()
        );
        when(ingestService.ingest(eq(7L), any())).thenReturn(ingest);

        Map<String, Object> out = dispatcher.dispatch(
            "pull_alerts",
            Map.of("connectorInstanceId", 7L)
        );

        assertThat(out.get("action")).isEqualTo("connector.pull_alerts");
        assertThat(out.get("persisted")).isEqualTo(true);
        assertThat(out.get("destination")).isEqualTo("ha_connector_alert_staging");
        assertThat(out.get("inserted")).isEqualTo(2);
        assertThat(out.get("batchId")).isEqualTo("batch-abc");
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
    void disableUserDisablesViaEntra() throws Exception {
        HaConnectorInstance row = entraRow(11L);
        when(instanceRepository.findById(11L)).thenReturn(Optional.of(row));
        when(instanceService.decryptedConfig(11L)).thenReturn(Map.of(
            "tenant_id", "11111111-1111-1111-1111-111111111111",
            "client_id", "app-id",
            "client_secret", "real-secret"
        ));
        when(microsoftOAuthClient.fetchAccessToken(
            anyString(), anyString(), anyString(), eq(MicrosoftOAuthClient.graphScope())
        )).thenReturn("graph-token");
        Map<String, Object> patchResult = new LinkedHashMap<>();
        patchResult.put("ok", true);
        patchResult.put("httpStatus", 204);
        patchResult.put("message", "Graph PATCH OK (HTTP 204)");
        when(microsoftOAuthClient.patchJson(anyString(), eq("graph-token"), eq("{\"accountEnabled\":false}")))
            .thenReturn(patchResult);

        Map<String, Object> out = dispatcher.dispatch(
            "disable_user",
            Map.of("connectorInstanceId", 11L, "userId", "bob@contoso.com")
        );
        assertThat(out.get("status")).isEqualTo("disabled");
        assertThat(out.get("connectorId")).isEqualTo(AzureEntraConnector.ID);
        assertThat(out.get("ok")).isEqualTo(true);
        assertThat(out.get("userId")).isEqualTo("bob@contoso.com");
    }

    @Test
    void disableUserEntraAcceptsUpnParam() throws Exception {
        HaConnectorInstance row = entraRow(11L);
        when(instanceRepository.findById(11L)).thenReturn(Optional.of(row));
        when(instanceService.decryptedConfig(11L)).thenReturn(Map.of(
            "tenant_id", "11111111-1111-1111-1111-111111111111",
            "client_id", "app-id",
            "client_secret", "real-secret"
        ));
        when(microsoftOAuthClient.fetchAccessToken(
            anyString(), anyString(), anyString(), eq(MicrosoftOAuthClient.graphScope())
        )).thenReturn("graph-token");
        Map<String, Object> patchResult = new LinkedHashMap<>();
        patchResult.put("ok", true);
        patchResult.put("httpStatus", 204);
        when(microsoftOAuthClient.patchJson(anyString(), anyString(), anyString()))
            .thenReturn(patchResult);

        Map<String, Object> out = dispatcher.dispatch(
            "disable_user",
            Map.of(
                "connectorInstanceId", 11L,
                "params", Map.of("upn", "carol@contoso.com")
            )
        );
        assertThat(out.get("status")).isEqualTo("disabled");
        assertThat(out.get("userId")).isEqualTo("carol@contoso.com");
    }

    @Test
    void disableUserEntraRefusesPlaceholderCredentials() {
        HaConnectorInstance row = entraRow(11L);
        when(instanceRepository.findById(11L)).thenReturn(Optional.of(row));
        when(instanceService.decryptedConfig(11L)).thenReturn(Map.of(
            "tenant_id", "11111111-1111-1111-1111-111111111111",
            "client_id", "app-id",
            "client_secret", "placeholder-secret"
        ));

        assertThatThrownBy(() -> dispatcher.dispatch(
            "disable_user",
            Map.of("connectorInstanceId", 11L, "userId", "u1")
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

    private static HaConnectorInstance entraRow(long id) {
        HaConnectorInstance row = new HaConnectorInstance();
        row.setId(id);
        row.setConnectorId(AzureEntraConnector.ID);
        row.setEnabled(true);
        return row;
    }

    private static HaConnectorInstance crowdstrikeRow(long id) {
        HaConnectorInstance row = new HaConnectorInstance();
        row.setId(id);
        row.setConnectorId(CrowdStrikeConnector.ID);
        row.setEnabled(true);
        return row;
    }
}
