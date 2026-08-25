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
class MicrosoftOAuthClientTest {

    @Mock
    private HttpClient httpClient;

    @Mock
    private HttpResponse<String> httpResponse;

    private MicrosoftOAuthClient client;

    /** HTTPS + host present; skips DNS so unit tests stay offline. */
    private static final MicrosoftOAuthClient.UrlGuard TEST_GUARD = url -> {
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
        client = new MicrosoftOAuthClient(httpClient, TEST_GUARD);
    }

    @Test
    void rejectsInvalidTenant() {
        assertThatThrownBy(() ->
            client.fetchAccessToken("../evil", "cid", "sec", MicrosoftOAuthClient.graphScope())
        ).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void looksLikePlaceholderDetectsTestConfig() {
        assertThat(MicrosoftOAuthClient.looksLikePlaceholder(
            Map.of("client_secret", "placeholder")
        )).isTrue();
        assertThat(MicrosoftOAuthClient.looksLikePlaceholder(
            Map.of("client_secret", "real-secret-value")
        )).isFalse();
    }

    @Test
    void patchJson_sendsPatchWithBearer() throws Exception {
        when(httpResponse.statusCode()).thenReturn(204);
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
            .thenReturn(httpResponse);

        Map<String, Object> out = client.patchJson(
            "https://graph.microsoft.com/v1.0/users/u1",
            "real-access-token",
            "{\"accountEnabled\":false}"
        );

        assertThat(out.get("ok")).isEqualTo(true);
        assertThat(out.get("httpStatus")).isEqualTo(204);

        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(captor.capture(), any());
        HttpRequest req = captor.getValue();
        assertThat(req.method()).isEqualTo("PATCH");
        assertThat(req.uri().toString()).isEqualTo("https://graph.microsoft.com/v1.0/users/u1");
        assertThat(req.headers().firstValue("Authorization")).contains("Bearer real-access-token");
    }

    @Test
    void patchJson_refusesPlaceholderBearer() {
        assertThatThrownBy(() ->
            client.patchJson(
                "https://graph.microsoft.com/v1.0/users/u1",
                "placeholder-token",
                "{\"accountEnabled\":false}"
            )
        )
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("placeholder");
    }

    @Test
    void patchJson_mapsAuthFailure() throws Exception {
        when(httpResponse.statusCode()).thenReturn(403);
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
            .thenReturn(httpResponse);

        Map<String, Object> out = client.patchJson(
            "https://graph.microsoft.com/v1.0/users/u1",
            "bad-token",
            "{\"accountEnabled\":false}"
        );
        assertThat(out.get("ok")).isEqualTo(false);
        assertThat(out.get("httpStatus")).isEqualTo(403);
        assertThat(out.get("message").toString()).contains("authentication failed");
    }

    @Test
    void patchJson_requiresHttps() {
        assertThatThrownBy(() ->
            client.patchJson(
                "http://graph.microsoft.com/v1.0/users/u1",
                "real-token",
                "{\"accountEnabled\":false}"
            )
        )
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("https");
    }

    @Test
    void postJson_sendsPostWithBearer() throws Exception {
        when(httpResponse.statusCode()).thenReturn(201);
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
            .thenReturn(httpResponse);

        Map<String, Object> out = client.postJson(
            "https://api.securitycenter.microsoft.com/api/machines/m1/isolate",
            "real-access-token",
            "{\"Comment\":\"iso\",\"IsolationType\":\"Full\"}"
        );

        assertThat(out.get("ok")).isEqualTo(true);
        assertThat(out.get("httpStatus")).isEqualTo(201);

        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(captor.capture(), any());
        HttpRequest req = captor.getValue();
        assertThat(req.method()).isEqualTo("POST");
        assertThat(req.uri().toString())
            .isEqualTo("https://api.securitycenter.microsoft.com/api/machines/m1/isolate");
        assertThat(req.headers().firstValue("Authorization")).contains("Bearer real-access-token");
    }

    @Test
    void postJson_refusesPlaceholderBearer() {
        assertThatThrownBy(() ->
            client.postJson(
                "https://api.securitycenter.microsoft.com/api/machines/m1/isolate",
                "placeholder-token",
                "{}"
            )
        )
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("placeholder");
    }

}
