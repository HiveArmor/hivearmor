package com.hivearmor.service.connector.impl;

import com.hivearmor.service.connector.ConnectionTestResult;
import com.hivearmor.service.connector.ConnectorCapability;
import com.hivearmor.service.connector.ConnectorField;
import com.hivearmor.service.connector.ConnectorSchema;
import com.hivearmor.service.connector.NormalizedAlert;

import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Okta — PULL_AUDIT + DISABLE_USER capability declaration (identity actions gated later).
 */
public final class OktaConnector extends AbstractHttpConnector {

    public static final String ID = "okta";

    @Override
    public String connectorId() {
        return ID;
    }

    @Override
    public String connectorName() {
        return "Okta";
    }

    @Override
    public String category() {
        return "iam";
    }

    @Override
    public Set<ConnectorCapability> capabilities() {
        return EnumSet.of(ConnectorCapability.PULL_AUDIT, ConnectorCapability.DISABLE_USER);
    }

    @Override
    public ConnectorSchema schema() {
        return new ConnectorSchema(
            ID,
            connectorName(),
            category(),
            "Okta System Log and identity actions.",
            List.of(
                ConnectorField.string("org_url", "Okta org URL"),
                ConnectorField.secret("api_token", "API token")
            ),
            List.copyOf(capabilities())
        );
    }

    @Override
    public ConnectionTestResult testConnection(Map<String, String> config) {
        try {
            validateRequiredFields(config);
            String org = require(config, "org_url").replaceAll("/$", "");
            safeBase(org);
            require(config, "api_token");
            if (config.values().stream().anyMatch(v ->
                v != null && v.toLowerCase(java.util.Locale.ROOT).contains("placeholder"))) {
                return ConnectionTestResult.failure(
                    "Refusing live probe with placeholder credentials"
                );
            }
            return httpGetProbe(
                org + "/api/v1/users?limit=1",
                Map.of("Authorization", "SSWS " + config.get("api_token").trim())
            );
        } catch (IllegalArgumentException e) {
            return ConnectionTestResult.failure(e.getMessage());
        }
    }

    @Override
    public List<NormalizedAlert> fetchAlerts(Map<String, String> config, Instant since) {
        // Audit pull maps to normalized events; empty until live token path is verified.
        validateRequiredFields(config);
        return List.of();
    }

    @Override
    public NormalizedAlert normalize(Map<String, Object> raw) {
        return new NormalizedAlert(
            ID,
            asString(raw.getOrDefault("uuid", raw.get("id"))),
            asString(raw.getOrDefault("displayMessage", raw.getOrDefault("eventType", "Okta event"))),
            asString(raw.get("legacyEventType")),
            "medium",
            null,
            asString(raw.get("client.ipAddress")),
            List.of(),
            Instant.now(),
            raw
        );
    }
}
