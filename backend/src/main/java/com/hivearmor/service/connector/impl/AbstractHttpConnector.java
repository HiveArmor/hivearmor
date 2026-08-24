package com.hivearmor.service.connector.impl;

import com.hivearmor.service.connector.ConnectionTestResult;
import com.hivearmor.service.connector.ConnectorField;
import com.hivearmor.service.connector.ConnectorUrlGuard;
import com.hivearmor.service.connector.HaConnector;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Shared helpers for HTTP-backed connectors.
 */
abstract class AbstractHttpConnector implements HaConnector {

    protected static final Duration TIMEOUT = Duration.ofSeconds(12);

    protected final HttpClient httpClient = HttpClient.newBuilder()
        .connectTimeout(TIMEOUT)
        .followRedirects(HttpClient.Redirect.NEVER)
        .build();

    protected String require(Map<String, String> config, String key) {
        String v = config != null ? config.get(key) : null;
        if (v == null || v.isBlank()) {
            throw new IllegalArgumentException("Missing required config: " + key);
        }
        return v.trim();
    }

    protected String optional(Map<String, String> config, String key, String defaultValue) {
        if (config == null) {
            return defaultValue;
        }
        String v = config.get(key);
        return v == null || v.isBlank() ? defaultValue : v.trim();
    }

    protected void validateRequiredFields(Map<String, String> config) {
        List<String> missing = new ArrayList<>();
        for (ConnectorField field : schema().getFields()) {
            if (!field.isRequired()) {
                continue;
            }
            String v = config != null ? config.get(field.getName()) : null;
            if (v == null || v.isBlank()) {
                missing.add(field.getName());
            }
        }
        if (!missing.isEmpty()) {
            throw new IllegalArgumentException("Missing required fields: " + String.join(", ", missing));
        }
    }

    protected URI safeBase(String baseUrl) {
        return ConnectorUrlGuard.requireHttpsUrl(baseUrl);
    }

    protected ConnectionTestResult httpGetProbe(String url, Map<String, String> headers) {
        try {
            HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url))
                .timeout(TIMEOUT)
                .GET()
                .header("User-Agent", "HiveArmor-Connector/1.0");
            if (headers != null) {
                headers.forEach(b::header);
            }
            HttpResponse<String> resp = httpClient.send(b.build(), HttpResponse.BodyHandlers.ofString());
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
            return ConnectionTestResult.failure("Connection error: " + e.getMessage());
        }
    }

    protected static String asString(Object o) {
        return o == null ? null : String.valueOf(o);
    }
}
