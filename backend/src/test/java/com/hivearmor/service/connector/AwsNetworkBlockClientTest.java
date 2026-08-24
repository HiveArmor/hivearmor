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
class AwsNetworkBlockClientTest {

    @Mock
    private HttpClient httpClient;

    @Mock
    private HttpResponse<String> httpResponse;

    private AwsNetworkBlockClient client;

    /** HTTPS + host present; skips DNS so unit tests stay offline. */
    private static final AwsNetworkBlockClient.UrlGuard TEST_GUARD = url -> {
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
        client = new AwsNetworkBlockClient(httpClient, TEST_GUARD);
    }

    @Test
    void createNetworkAclDenyEntry_postsSignedEc2Query() throws Exception {
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
            .thenReturn(httpResponse);

        Map<String, Object> out = client.createNetworkAclDenyEntry(
            "us-west-2",
            "AKIATESTKEYID0001",
            "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
            null,
            "acl-0deadbeef",
            "203.0.113.77/32",
            120,
            false
        );

        assertThat(out.get("ok")).isEqualTo(true);
        assertThat(out.get("httpStatus")).isEqualTo(200);
        assertThat(out.get("cidr")).isEqualTo("203.0.113.77/32");
        assertThat(out.get("networkAclId")).isEqualTo("acl-0deadbeef");
        assertThat(out.get("mechanism")).isEqualTo("ec2.CreateNetworkAclEntry");

        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(captor.capture(), any());
        HttpRequest req = captor.getValue();
        assertThat(req.method()).isEqualTo("POST");
        assertThat(req.uri().toString()).isEqualTo("https://ec2.us-west-2.amazonaws.com/");
        assertThat(req.headers().firstValue("Authorization").orElse(""))
            .startsWith("AWS4-HMAC-SHA256 Credential=AKIATESTKEYID0001/");
        assertThat(req.headers().firstValue("X-Amz-Date")).isPresent();
        // Body is not always readable from HttpRequest in all JDKs; assert via URI + headers is enough.
        // Credential header must not embed the secret access key.
        assertThat(req.headers().firstValue("Authorization").orElse(""))
            .doesNotContain("wJalrXUtnFEMI");
    }

    @Test
    void createNetworkAclDenyEntry_refusesPlaceholderCredentials() {
        assertThatThrownBy(() -> client.createNetworkAclDenyEntry(
            "us-east-1",
            "placeholder",
            "placeholder",
            null,
            "acl-1",
            "203.0.113.1/32",
            100,
            false
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("placeholder");
    }

    @Test
    void createNetworkAclDenyEntry_requiresNetworkAclId() {
        assertThatThrownBy(() -> client.createNetworkAclDenyEntry(
            "us-east-1",
            "AKIATESTKEYID0001",
            "real-secret",
            null,
            " ",
            "203.0.113.1/32",
            100,
            false
        ))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("network_acl_id");
    }

    @Test
    void createNetworkAclDenyEntry_mapsAuthFailure() throws Exception {
        when(httpResponse.statusCode()).thenReturn(403);
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
            .thenReturn(httpResponse);

        Map<String, Object> out = client.createNetworkAclDenyEntry(
            "us-east-1",
            "AKIATESTKEYID0001",
            "real-secret",
            null,
            "acl-1",
            "203.0.113.1/32",
            100,
            false
        );

        assertThat(out.get("ok")).isEqualTo(false);
        assertThat(out.get("httpStatus")).isEqualTo(403);
        assertThat(out.get("message").toString()).contains("403");
    }

    @Test
    void safeError_redactsCredentialMaterial() {
        Exception e = new IllegalStateException(
            "Credential=AKIATESTKEYID0001/20200101/us-east-1/ec2/aws4_request Signature=abcdef1234 "
                + "secret_access_key=supersecret"
        );
        String safe = AwsNetworkBlockClient.safeError(e);
        assertThat(safe).doesNotContain("supersecret");
        assertThat(safe).doesNotContain("abcdef1234");
        assertThat(safe).contains("Credential=***");
    }
}
