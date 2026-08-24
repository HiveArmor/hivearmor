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
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Okta Users API client for identity actions (deactivate). HTTPS-only via {@link ConnectorUrlGuard}.
 * Never logs API tokens.
 */
@Component
public class OktaIdentityClient {

    private static final Duration TIMEOUT = Duration.ofSeconds(12);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @FunctionalInterface
    public interface UrlGuard {
        URI requireHttps(String url);
    }

    private final HttpClient httpClient;
    private final UrlGuard urlGuard;

    public OktaIdentityClient() {
        this(
            HttpClient.newBuilder()
                .connectTimeout(TIMEOUT)
                .followRedirects(HttpClient.Redirect.NEVER)
                .build(),
            ConnectorUrlGuard::requireHttpsUrl
        );
    }

    public OktaIdentityClient(HttpClient httpClient) {
        this(httpClient, ConnectorUrlGuard::requireHttpsUrl);
    }

    /** Package/test constructor — inject HttpClient and optional URL guard (no DNS in unit tests). */
    public OktaIdentityClient(HttpClient httpClient, UrlGuard urlGuard) {
        this.httpClient = httpClient != null
            ? httpClient
            : HttpClient.newBuilder()
                .connectTimeout(TIMEOUT)
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
        this.urlGuard = urlGuard != null ? urlGuard : ConnectorUrlGuard::requireHttpsUrl;
    }

    /**
     * POST {@code {org}/api/v1/users/{id}/lifecycle/deactivate} with SSWS token.
     *
     * @return result map with {@code ok}, {@code httpStatus}, {@code userId}, {@code message}
     */
    public Map<String, Object> deactivateUser(String orgUrl, String apiToken, String userId) {
        if (userId == null || userId.isBlank()) {
            throw new IllegalArgumentException("userId is required");
        }
        String token = requireToken(apiToken);
        String org = normalizeOrg(orgUrl);
        String id = userId.trim();
        String pathId = encodePathSegment(id);
        URI uri = urlGuard.requireHttps(org + "/api/v1/users/" + pathId + "/lifecycle/deactivate");

        try {
            HttpRequest req = HttpRequest.newBuilder(uri)
                .timeout(TIMEOUT)
                .header("Authorization", "SSWS " + token)
                .header("Accept", "application/json")
                .header("Content-Type", "application/json")
                .header("User-Agent", "HiveArmor-Connector/1.0")
                .POST(HttpRequest.BodyPublishers.ofString("{}"))
                .build();
            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            int code = resp.statusCode();
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("userId", id);
            out.put("httpStatus", code);
            if (code >= 200 && code < 300) {
                out.put("ok", true);
                out.put("message", "Okta user deactivated (HTTP " + code + ")");
                return out;
            }
            out.put("ok", false);
            out.put("message", statusMessage(code));
            return out;
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Okta deactivate failed: " + safeError(e), e);
        }
    }

    /**
     * Resolve Okta user id from login/username via GET {@code /api/v1/users/{login}}.
     */
    public String resolveUserIdByLogin(String orgUrl, String apiToken, String login) {
        if (login == null || login.isBlank()) {
            throw new IllegalArgumentException("username/login is required");
        }
        String token = requireToken(apiToken);
        String org = normalizeOrg(orgUrl);
        String pathLogin = encodePathSegment(login.trim());
        URI uri = urlGuard.requireHttps(org + "/api/v1/users/" + pathLogin);

        try {
            HttpRequest req = HttpRequest.newBuilder(uri)
                .timeout(TIMEOUT)
                .header("Authorization", "SSWS " + token)
                .header("Accept", "application/json")
                .header("User-Agent", "HiveArmor-Connector/1.0")
                .GET()
                .build();
            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            int code = resp.statusCode();
            if (code == 404) {
                throw new IllegalArgumentException("Okta user not found for login");
            }
            if (code < 200 || code >= 300) {
                throw new IllegalStateException(statusMessage(code));
            }
            JsonNode json = MAPPER.readTree(resp.body() != null ? resp.body() : "{}");
            String id = json.path("id").asText(null);
            if (id == null || id.isBlank()) {
                throw new IllegalStateException("Okta user response missing id");
            }
            return id;
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Okta user lookup failed: " + safeError(e), e);
        }
    }

    public static boolean looksLikePlaceholder(Map<String, String> config) {
        if (config == null || config.isEmpty()) {
            return true;
        }
        for (String v : config.values()) {
            if (v != null && v.toLowerCase(Locale.ROOT).contains("placeholder")) {
                return true;
            }
        }
        return false;
    }

    private String normalizeOrg(String orgUrl) {
        if (orgUrl == null || orgUrl.isBlank()) {
            throw new IllegalArgumentException("Missing required config: org_url");
        }
        String org = orgUrl.trim().replaceAll("/$", "");
        urlGuard.requireHttps(org);
        return org;
    }

    private static String requireToken(String apiToken) {
        if (apiToken == null || apiToken.isBlank()) {
            throw new IllegalArgumentException("Missing required config: api_token");
        }
        String token = apiToken.trim();
        if (token.toLowerCase(Locale.ROOT).contains("placeholder")) {
            throw new IllegalArgumentException("Refusing Okta mutate with placeholder credentials");
        }
        return token;
    }

    private static String encodePathSegment(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static String statusMessage(int code) {
        if (code == 401 || code == 403) {
            return "Okta authentication failed (HTTP " + code + ")";
        }
        if (code == 404) {
            return "Okta user not found (HTTP 404)";
        }
        return "Okta API unexpected HTTP " + code;
    }

    /** Avoid echoing secrets that might appear in rare exception text. */
    private static String safeError(Exception e) {
        String msg = e.getMessage();
        if (msg == null) {
            return e.getClass().getSimpleName();
        }
        return msg.replaceAll("(?i)SSWS\\s+\\S+", "SSWS ***")
            .replaceAll("(?i)api[_-]?token[=:]\\s*\\S+", "api_token=***");
    }
}
