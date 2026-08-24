package com.hivearmor.service.connector.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.hivearmor.service.connector.ConnectionTestResult;
import com.hivearmor.service.connector.ConnectorCapability;
import com.hivearmor.service.connector.ConnectorField;
import com.hivearmor.service.connector.ConnectorSchema;
import com.hivearmor.service.connector.MicrosoftOAuthClient;
import com.hivearmor.service.connector.NormalizedAlert;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Microsoft Defender for Endpoint — PULL_ALERTS (OAuth client credentials).
 */
public final class AzureDefenderConnector extends AbstractHttpConnector {

    public static final String ID = "azure_defender";

    private final MicrosoftOAuthClient oauth;

    public AzureDefenderConnector(MicrosoftOAuthClient oauth) {
        this.oauth = oauth != null ? oauth : new MicrosoftOAuthClient();
    }

    public AzureDefenderConnector() {
        this(new MicrosoftOAuthClient());
    }

    @Override
    public String connectorId() {
        return ID;
    }

    @Override
    public String connectorName() {
        return "Microsoft Defender for Endpoint";
    }

    @Override
    public String category() {
        return "edr";
    }

    @Override
    public Set<ConnectorCapability> capabilities() {
        return EnumSet.of(ConnectorCapability.PULL_ALERTS);
    }

    @Override
    public ConnectorSchema schema() {
        return new ConnectorSchema(
            ID,
            connectorName(),
            category(),
            "Microsoft Defender for Endpoint alerts via Microsoft Graph / security API.",
            List.of(
                ConnectorField.secret("tenant_id", "Tenant ID"),
                ConnectorField.secret("client_id", "Application (client) ID"),
                ConnectorField.secret("client_secret", "Client secret"),
                ConnectorField.stringOptional(
                    "base_url",
                    "API base URL",
                    "https://api.securitycenter.microsoft.com",
                    null
                )
            ),
            List.copyOf(capabilities())
        );
    }

    @Override
    public ConnectionTestResult testConnection(Map<String, String> config) {
        try {
            validateRequiredFields(config);
            String base = optional(config, "base_url", "https://api.securitycenter.microsoft.com")
                .replaceAll("/$", "");
            safeBase(base);
            if (MicrosoftOAuthClient.looksLikePlaceholder(config)) {
                return ConnectionTestResult.failure(
                    "Refusing live probe with placeholder credentials — set real tenant/client secrets"
                );
            }
            String token = oauth.fetchAccessToken(
                require(config, "tenant_id"),
                require(config, "client_id"),
                require(config, "client_secret"),
                MicrosoftOAuthClient.defenderScope()
            );
            return oauth.probeGet(base + "/api/machines?$top=1", token);
        } catch (IllegalArgumentException e) {
            return ConnectionTestResult.failure(e.getMessage());
        } catch (Exception e) {
            return ConnectionTestResult.failure("Defender OAuth/probe failed: " + e.getMessage());
        }
    }

    @Override
    public List<NormalizedAlert> fetchAlerts(Map<String, String> config, Instant since) {
        validateRequiredFields(config);
        if (MicrosoftOAuthClient.looksLikePlaceholder(config)) {
            return List.of();
        }
        try {
            String base = optional(config, "base_url", "https://api.securitycenter.microsoft.com")
                .replaceAll("/$", "");
            safeBase(base);
            String token = oauth.fetchAccessToken(
                require(config, "tenant_id"),
                require(config, "client_id"),
                require(config, "client_secret"),
                MicrosoftOAuthClient.defenderScope()
            );
            StringBuilder url = new StringBuilder(base).append("/api/alerts?$top=50");
            if (since != null) {
                String filter = "alertCreationTime ge " + since.toString();
                url.append("&$filter=").append(URLEncoder.encode(filter, StandardCharsets.UTF_8));
            }
            JsonNode root = oauth.getJson(url.toString(), token);
            JsonNode value = root.path("value");
            List<NormalizedAlert> out = new ArrayList<>();
            if (value.isArray()) {
                for (JsonNode node : value) {
                    out.add(normalize(jsonToMap(node)));
                }
            }
            return out;
        } catch (Exception e) {
            return List.of();
        }
    }

    @Override
    public NormalizedAlert normalize(Map<String, Object> raw) {
        Instant created = Instant.now();
        Object createdRaw = raw.get("alertCreationTime");
        if (createdRaw == null) {
            createdRaw = raw.get("createdAt");
        }
        if (createdRaw instanceof String s && !s.isBlank()) {
            try {
                created = Instant.parse(s);
            } catch (Exception ignored) {
                // keep now
            }
        }
        return new NormalizedAlert(
            ID,
            asString(raw.getOrDefault("id", raw.get("external_id"))),
            asString(raw.getOrDefault("title", "Defender alert")),
            asString(raw.get("description")),
            asString(raw.getOrDefault("severity", "medium")),
            asString(raw.getOrDefault("hostname", raw.getOrDefault("computerDnsName", raw.get("deviceDnsName")))),
            asString(raw.getOrDefault("src_ip", raw.get("lastIpAddress"))),
            List.of(),
            created,
            raw
        );
    }

    private static Map<String, Object> jsonToMap(JsonNode node) {
        Map<String, Object> raw = new LinkedHashMap<>();
        if (node == null || !node.isObject()) {
            return raw;
        }
        Iterator<String> names = node.fieldNames();
        while (names.hasNext()) {
            String name = names.next();
            JsonNode child = node.get(name);
            if (child == null || child.isNull()) {
                continue;
            }
            if (child.isValueNode()) {
                raw.put(name, child.asText());
            } else {
                raw.put(name, child.toString());
            }
        }
        return raw;
    }
}
