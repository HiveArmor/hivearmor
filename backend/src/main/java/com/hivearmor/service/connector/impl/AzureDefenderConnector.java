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
 * Microsoft Defender for Endpoint — PULL_ALERTS; kinetic isolate only when feature-flagged.
 *
 * <p>STAGING CANDIDATE — {@link ConnectorCapability#ISOLATE_HOST} /
 * {@link ConnectorCapability#UNISOLATE_HOST} are declared only when
 * {@code hivearmor.connectors.vendor-isolate-enabled=true}. Live isolate/unisolate
 * POSTs to the Defender machine API are unit-tested with mocked HTTP (no live tenant).
 * Hybrid response mesh still prefers an enrolled HA agent over vendor kinetic.
 */
public final class AzureDefenderConnector extends AbstractHttpConnector {

    public static final String ID = "azure_defender";

    private static final String DEFAULT_BASE = "https://api.securitycenter.microsoft.com";

    private final MicrosoftOAuthClient oauth;
    private final boolean vendorIsolateEnabled;

    public AzureDefenderConnector(MicrosoftOAuthClient oauth, boolean vendorIsolateEnabled) {
        this.oauth = oauth != null ? oauth : new MicrosoftOAuthClient();
        this.vendorIsolateEnabled = vendorIsolateEnabled;
    }

    public AzureDefenderConnector(MicrosoftOAuthClient oauth) {
        this(oauth, false);
    }

    public AzureDefenderConnector(boolean vendorIsolateEnabled) {
        this(new MicrosoftOAuthClient(), vendorIsolateEnabled);
    }

    public AzureDefenderConnector() {
        this(new MicrosoftOAuthClient(), false);
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
        EnumSet<ConnectorCapability> caps = EnumSet.of(ConnectorCapability.PULL_ALERTS);
        if (vendorIsolateEnabled) {
            caps.add(ConnectorCapability.ISOLATE_HOST);
            caps.add(ConnectorCapability.UNISOLATE_HOST);
        }
        return caps;
    }

    @Override
    public ConnectorSchema schema() {
        String description = "Microsoft Defender for Endpoint alerts via Microsoft Graph / security API.";
        if (vendorIsolateEnabled) {
            description += " Feature-flagged ISOLATE_HOST/UNISOLATE_HOST via POST "
                + "/api/machines/{id}/isolate|unisolate (STAGING CANDIDATE).";
        }
        return new ConnectorSchema(
            ID,
            connectorName(),
            category(),
            description,
            List.of(
                ConnectorField.secret("tenant_id", "Tenant ID"),
                ConnectorField.secret("client_id", "Application (client) ID"),
                ConnectorField.secret("client_secret", "Client secret"),
                ConnectorField.stringOptional(
                    "base_url",
                    "API base URL",
                    DEFAULT_BASE,
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
            String base = optional(config, "base_url", DEFAULT_BASE).replaceAll("/$", "");
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

    /**
     * Isolate a machine via Defender {@code POST /api/machines/{id}/isolate}.
     *
     * <p>Fail-closed without credentials / when feature flag is off. Never logs secrets.
     *
     * @param config    merged connector config
     * @param machineId Defender machine id
     * @param comment   optional operator comment (default applied when blank)
     */
    public Map<String, Object> isolateHost(Map<String, String> config, String machineId, String comment) {
        return machineAction(config, machineId, comment, true);
    }

    /**
     * Release isolation via Defender {@code POST /api/machines/{id}/unisolate}.
     */
    public Map<String, Object> unisolateHost(Map<String, String> config, String machineId, String comment) {
        return machineAction(config, machineId, comment, false);
    }

    private Map<String, Object> machineAction(
            Map<String, String> config,
            String machineId,
            String comment,
            boolean isolate) {
        if (!vendorIsolateEnabled) {
            throw new IllegalStateException(
                "Defender isolate disabled (hivearmor.connectors.vendor-isolate-enabled=false)"
            );
        }
        validateRequiredFields(config);
        if (MicrosoftOAuthClient.looksLikePlaceholder(config)) {
            throw new IllegalArgumentException("Refusing Defender mutate with placeholder credentials");
        }
        if (machineId == null || machineId.isBlank()) {
            throw new IllegalArgumentException("machineId is required");
        }
        String base = optional(config, "base_url", DEFAULT_BASE).replaceAll("/$", "");
        safeBase(base);
        String id = machineId.trim();
        String pathId = URLEncoder.encode(id, StandardCharsets.UTF_8).replace("+", "%20");
        String action = isolate ? "isolate" : "unisolate";
        String note = (comment == null || comment.isBlank())
            ? (isolate ? "HiveArmor isolate" : "HiveArmor unisolate")
            : comment.trim();
        String body = isolate
            ? "{\"Comment\":\"" + jsonEscape(note) + "\",\"IsolationType\":\"Full\"}"
            : "{\"Comment\":\"" + jsonEscape(note) + "\"}";

        try {
            String token = oauth.fetchAccessToken(
                require(config, "tenant_id"),
                require(config, "client_id"),
                require(config, "client_secret"),
                MicrosoftOAuthClient.defenderScope()
            );
            Map<String, Object> result = oauth.postJson(
                base + "/api/machines/" + pathId + "/" + action,
                token,
                body
            );
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("machineId", id);
            out.put("action", isolate ? "isolate_host" : "unisolate_host");
            out.put("connectorId", ID);
            out.putAll(result);
            if (Boolean.TRUE.equals(result.get("ok"))) {
                out.put(
                    "message",
                    "Defender " + action + " accepted (HTTP " + result.get("httpStatus") + ")"
                );
            }
            return out;
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Defender " + action + " failed: " + e.getMessage(), e);
        }
    }

    private static String jsonEscape(String value) {
        return value
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r");
    }

    @Override
    public List<NormalizedAlert> fetchAlerts(Map<String, String> config, Instant since) {
        validateRequiredFields(config);
        if (MicrosoftOAuthClient.looksLikePlaceholder(config)) {
            return List.of();
        }
        try {
            String base = optional(config, "base_url", DEFAULT_BASE).replaceAll("/$", "");
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
