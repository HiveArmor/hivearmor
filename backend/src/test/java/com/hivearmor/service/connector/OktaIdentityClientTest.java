package com.hivearmor.service.connector;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Locale;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OktaIdentityClientTest {

    @Mock
    private HttpClient httpClient;

    @Mock
    private HttpResponse<String> httpResponse;

    private OktaIdentityClient client;

    /** HTTPS + host present; skips DNS so unit tests stay offline. */
    private static final OktaIdentityClient.UrlGuard TEST_GUARD = url -> {
        if (url == null || url.isBlank()) {
            throw new IllegalArgumentException("Base URL is required");
        }
        URI uri = URI.create(url.trim());
        String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase(Locale.ROOT) : "";
        if (!"https".equals(scheme)) {
            throw new IllegalArgumentException("Connector base URL must use https");
        }
        if (uri.getHost() == null || uri.getHost().isBlank()) {
            throw new IllegalArgumentException("Connector base URL host is required");
        }
        return uri;
    };

    @BeforeEach
    void setUp() {
        client = new OktaIdentityClient(httpClient, TEST_GUARD);
    }

    @Test
    void deactivateUser_postsLifecycleDeactivateWithSsws() throws Exception {
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
            .thenReturn(httpResponse);

        Map<String, Object> out = client.deactivateUser(
            "https://example.okta.com",
            "real-api-token",
            "00uABCDEF1234567890"
        );

        assertThat(out.get("ok")).isEqualTo(true);
        assertThat(out.get("httpStatus")).isEqualTo(200);
        assertThat(out.get("userId")).isEqualTo("00uABCDEF1234567890");

        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(captor.capture(), any());
        HttpRequest req = captor.getValue();
        assertThat(req.method()).isEqualTo("POST");
        assertThat(req.uri().toString())
            .isEqualTo("https://example.okta.com/api/v1/users/00uABCDEF1234567890/lifecycle/deactivate");
        assertThat(req.headers().firstValue("Authorization")).contains("SSWS real-api-token");
    }

    @Test
    void deactivateUser_refusesPlaceholderToken() {
        assertThatThrownBy(() ->
            client.deactivateUser("https://example.okta.com", "placeholder-token", "00u1")
        )
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("placeholder");
    }

    @Test
    void deactivateUser_requiresHttpsOrg() {
        assertThatThrownBy(() ->
            client.deactivateUser("http://example.okta.com", "real-token", "00u1")
        )
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("https");
    }

    @Test
    void deactivateUser_mapsAuthFailure() throws Exception {
        when(httpResponse.statusCode()).thenReturn(401);
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
            .thenReturn(httpResponse);

        Map<String, Object> out = client.deactivateUser(
            "https://example.okta.com",
            "bad-token",
            "00u1"
        );
        assertThat(out.get("ok")).isEqualTo(false);
        assertThat(out.get("httpStatus")).isEqualTo(401);
        assertThat(out.get("message").toString()).contains("authentication failed");
    }

    @Test
    void resolveUserIdByLogin_readsIdFromJson() throws Exception {
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn("{\"id\":\"00uresolved\",\"status\":\"ACTIVE\"}");
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
            .thenReturn(httpResponse);

        String id = client.resolveUserIdByLogin(
            "https://example.okta.com",
            "real-token",
            "alice@example.com"
        );
        assertThat(id).isEqualTo("00uresolved");

        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(captor.capture(), any());
        assertThat(captor.getValue().method()).isEqualTo("GET");
        assertThat(captor.getValue().uri().toString())
            .contains("/api/v1/users/alice%40example.com");
    }

    @Test
    void looksLikePlaceholderDetectsTestConfig() {
        assertThat(OktaIdentityClient.looksLikePlaceholder(
            Map.of("api_token", "placeholder")
        )).isTrue();
        assertThat(OktaIdentityClient.looksLikePlaceholder(
            Map.of("api_token", "00real.secret.token")
        )).isFalse();
    }
}
