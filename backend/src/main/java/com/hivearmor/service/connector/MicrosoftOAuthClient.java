package com.hivearmor.service.connector;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;
import java.util.Map;

/**
 * Shared Microsoft identity platform client-credentials token + HTTPS probe.
 */
@Component
public class MicrosoftOAuthClient {

    private static final Duration TIMEOUT = Duration.ofSeconds(12);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final HttpClient httpClient = HttpClient.newBuilder()
        .connectTimeout(TIMEOUT)
        .followRedirects(HttpClient.Redirect.NEVER)
        .build();

    /**
     * Acquire an access token via client credentials.
     *
     * @param tenantId Azure AD tenant
     * @param clientId app id
     * @param clientSecret app secret
     * @param scope e.g. {@code https://graph.microsoft.com/.default}
     */
    public String fetchAccessToken(String tenantId, String clientId, String clientSecret, String scope)
        throws Exception {
        if (tenantId == null || tenantId.isBlank()) {
            throw new IllegalArgumentException("tenant_id is required");
        }
        if (clientId == null || clientId.isBlank() || clientSecret == null || clientSecret.isBlank()) {
            throw new IllegalArgumentException("client_id and client_secret are required");
        }
        if (scope == null || scope.isBlank()) {
            throw new IllegalArgumentException("scope is required");
        }
        // Tenant path segment — reject path traversal / host injection
        String tenant = tenantId.trim();
        if (!tenant.matches("[0-9a-fA-F-]{36}|[a-zA-Z0-9._-]+")) {
            throw new IllegalArgumentException("Invalid tenant_id format");
        }
        String tokenUrl = "https://login.microsoftonline.com/" + tenant + "/oauth2/v2.0/token";
        ConnectorUrlGuard.requireHttpsUrl(tokenUrl);

        String body = "client_id=" + URLEncoder.encode(clientId.trim(), StandardCharsets.UTF_8)
            + "&client_secret=" + URLEncoder.encode(clientSecret.trim(), StandardCharsets.UTF_8)
            + "&scope=" + URLEncoder.encode(scope.trim(), StandardCharsets.UTF_8)
            + "&grant_type=client_credentials";

        HttpRequest req = HttpRequest.newBuilder(URI.create(tokenUrl))
            .timeout(TIMEOUT)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header("User-Agent", "HiveArmor-Connector/1.0")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();
        HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() < 200 || resp.statusCode() >= 300) {
            throw new IllegalStateException("Token endpoint HTTP " + resp.statusCode());
        }
        JsonNode json = MAPPER.readTree(resp.body());
        String token = json.path("access_token").asText(null);
        if (token == null || token.isBlank()) {
            throw new IllegalStateException("Token response missing access_token");
        }
        return token;
    }

    public ConnectionTestResult probeGet(String url, String bearerToken) {
        try {
            URI uri = ConnectorUrlGuard.requireHttpsUrl(url);
            HttpRequest req = HttpRequest.newBuilder(uri)
                .timeout(TIMEOUT)
                .header("Authorization", "Bearer " + bearerToken)
                .header("User-Agent", "HiveArmor-Connector/1.0")
                .GET()
                .build();
            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            int code = resp.statusCode();
            if (code >= 200 && code < 300) {
                return ConnectionTestResult.success("Connection OK (HTTP " + code + ")");
            }
            if (code == 401 || code == 403) {
                return ConnectionTestResult.failure("Authentication failed (HTTP " + code + ")", code);
            }
            return ConnectionTestResult.failure("Unexpected HTTP " + code, code);
        } catch (IllegalArgumentException e) {
            return ConnectionTestResult.failure(e.getMessage());
        } catch (Exception e) {
            return ConnectionTestResult.failure("Probe error: " + e.getMessage());
        }
    }

    public static String graphScope() {
        return "https://graph.microsoft.com/.default";
    }

    public static String defenderScope() {
        return "https://api.securitycenter.microsoft.com/.default";
    }

    public static boolean looksLikePlaceholder(Map<String, String> config) {
        if (config == null) {
            return true;
        }
        for (String v : config.values()) {
            if (v != null && v.toLowerCase(Locale.ROOT).contains("placeholder")) {
                return true;
            }
        }
        return false;
    }
}
