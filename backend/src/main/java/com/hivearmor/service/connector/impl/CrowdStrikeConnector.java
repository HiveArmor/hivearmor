package com.hivearmor.service.connector.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.service.connector.ConnectionTestResult;
import com.hivearmor.service.connector.ConnectorCapability;
import com.hivearmor.service.connector.ConnectorField;
import com.hivearmor.service.connector.ConnectorSchema;
import com.hivearmor.service.connector.NormalizedAlert;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * CrowdStrike Falcon — PULL_ALERTS; kinetic isolate only when feature-flagged.
 */
public final class CrowdStrikeConnector extends AbstractHttpConnector {

    public static final String ID = "crowdstrike";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final boolean vendorIsolateEnabled;

    public CrowdStrikeConnector(boolean vendorIsolateEnabled) {
        this.vendorIsolateEnabled = vendorIsolateEnabled;
    }

    @Override
    public String connectorId() {
        return ID;
    }

    @Override
    public String connectorName() {
        return "CrowdStrike Falcon";
    }

    @Override
    public String category() {
        return "edr";
    }

    @Override
    public Set<ConnectorCapability> capabilities() {
        EnumSet<ConnectorCapability> caps = EnumSet.of(ConnectorCapability.PULL_ALERTS);
        if (vendorIsolateEnabled) {
            caps.add(ConnectorCapability.ISOLATE_HOST);
            caps.add(ConnectorCapability.UNISOLATE_HOST);
            caps.add(ConnectorCapability.KILL_PROCESS);
        }
        return caps;
    }

    @Override
    public ConnectorSchema schema() {
        return new ConnectorSchema(
            ID,
            connectorName(),
            category(),
            "CrowdStrike Falcon detections via the Falcon REST API.",
            List.of(
                ConnectorField.secret("client_id", "Client ID"),
                ConnectorField.secret("client_secret", "Client Secret"),
                ConnectorField.stringOptional(
                    "base_url",
                    "Base URL",
                    "https://api.crowdstrike.com",
                    "Override for non-US clouds (e.g. api.eu-1.crowdstrike.com)."
                )
            ),
            List.copyOf(capabilities())
        );
    }

    @Override
    public ConnectionTestResult testConnection(Map<String, String> config) {
        try {
            validateRequiredFields(config);
            String token = authenticate(config);
            String base = optional(config, "base_url", "https://api.crowdstrike.com");
            safeBase(base);
            return httpGetProbe(
                base.replaceAll("/$", "") + "/sensors/queries/devices/v1?limit=1",
                Map.of("Authorization", "Bearer " + token)
            );
        } catch (IllegalArgumentException e) {
            return ConnectionTestResult.failure(e.getMessage());
        } catch (Exception e) {
            return ConnectionTestResult.failure("CrowdStrike auth failed: " + e.getMessage());
        }
    }

    @Override
    public List<NormalizedAlert> fetchAlerts(Map<String, String> config, Instant since) {
        validateRequiredFields(config);
        // Live pull is credential-gated; without network success return empty rather than inventing alerts.
        try {
            String token = authenticate(config);
            String base = optional(config, "base_url", "https://api.crowdstrike.com").replaceAll("/$", "");
            safeBase(base);
            String filter = since != null
                ? "last_behavior:>'" + since.toString() + "'"
                : null;
            String q = filter != null
                ? "?filter=" + URLEncoder.encode(filter, StandardCharsets.UTF_8) + "&limit=50"
                : "?limit=50";
            HttpRequest req = HttpRequest.newBuilder(URI.create(base + "/detects/queries/detects/v1" + q))
                .timeout(TIMEOUT)
                .header("Authorization", "Bearer " + token)
                .header("User-Agent", "HiveArmor-Connector/1.0")
                .GET()
                .build();
            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() < 200 || resp.statusCode() >= 300) {
                return List.of();
            }
            JsonNode root = MAPPER.readTree(resp.body());
            JsonNode ids = root.path("resources");
            List<NormalizedAlert> out = new ArrayList<>();
            if (ids.isArray()) {
                for (JsonNode idNode : ids) {
                    Map<String, Object> raw = new LinkedHashMap<>();
                    raw.put("detection_id", idNode.asText());
                    raw.put("source", ID);
                    out.add(normalize(raw));
                }
            }
            return out;
        } catch (Exception e) {
            return List.of();
        }
    }

    @Override
    public NormalizedAlert normalize(Map<String, Object> raw) {
        String id = asString(raw.getOrDefault("detection_id", raw.getOrDefault("external_id", raw.get("id"))));
        if (id == null || id.isBlank()) {
            id = "unknown";
        }
        String title = asString(raw.getOrDefault("title", "CrowdStrike detection"));
        String severity = asString(raw.getOrDefault("max_severity", raw.getOrDefault("severity", "medium")));
        String hostname = asString(raw.getOrDefault("hostname", raw.get("device_hostname")));
        String srcIp = asString(raw.getOrDefault("src_ip", raw.get("local_ip")));
        return new NormalizedAlert(
            ID,
            id,
            title,
            asString(raw.get("description")),
            severity,
            hostname,
            srcIp,
            List.of(),
            Instant.now(),
            raw
        );
    }

    private String authenticate(Map<String, String> config) throws Exception {
        String base = optional(config, "base_url", "https://api.crowdstrike.com").replaceAll("/$", "");
        safeBase(base);
        String body = "client_id=" + URLEncoder.encode(require(config, "client_id"), StandardCharsets.UTF_8)
            + "&client_secret=" + URLEncoder.encode(require(config, "client_secret"), StandardCharsets.UTF_8);
        HttpRequest req = HttpRequest.newBuilder(URI.create(base + "/oauth2/token"))
            .timeout(TIMEOUT)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header("User-Agent", "HiveArmor-Connector/1.0")
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();
        HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() < 200 || resp.statusCode() >= 300) {
            throw new IllegalStateException("OAuth token HTTP " + resp.statusCode());
        }
        JsonNode json = MAPPER.readTree(resp.body());
        String token = json.path("access_token").asText(null);
        if (token == null || token.isBlank()) {
            throw new IllegalStateException("OAuth response missing access_token");
        }
        return token;
    }
}
