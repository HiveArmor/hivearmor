package com.hivearmor.service.connector.impl;

import com.hivearmor.service.connector.ConnectionTestResult;
import com.hivearmor.service.connector.ConnectorCapability;
import com.hivearmor.service.connector.ConnectorField;
import com.hivearmor.service.connector.ConnectorSchema;
import com.hivearmor.service.connector.NormalizedAlert;
import com.hivearmor.service.connector.OktaIdentityClient;

import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Okta — PULL_AUDIT + live DISABLE_USER (lifecycle deactivate).
 */
public final class OktaConnector extends AbstractHttpConnector {

    public static final String ID = "okta";

    private final OktaIdentityClient identityClient;

    public OktaConnector() {
        this(new OktaIdentityClient());
    }

    public OktaConnector(OktaIdentityClient identityClient) {
        this.identityClient = identityClient != null ? identityClient : new OktaIdentityClient();
    }

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
            if (OktaIdentityClient.looksLikePlaceholder(config)) {
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

    /**
     * Deactivate an Okta user via lifecycle API.
     *
     * @param config merged connector config ({@code org_url}, {@code api_token})
     * @param userId Okta user id (or login if already resolved by caller)
     */
    public Map<String, Object> deactivateUser(Map<String, String> config, String userId) {
        validateRequiredFields(config);
        if (OktaIdentityClient.looksLikePlaceholder(config)) {
            throw new IllegalArgumentException("Refusing Okta mutate with placeholder credentials");
        }
        return identityClient.deactivateUser(
            require(config, "org_url"),
            require(config, "api_token"),
            userId
        );
    }

    /**
     * Optional username → Okta user id lookup before deactivate.
     */
    public String resolveUserId(Map<String, String> config, String username) {
        validateRequiredFields(config);
        if (OktaIdentityClient.looksLikePlaceholder(config)) {
            throw new IllegalArgumentException("Refusing Okta mutate with placeholder credentials");
        }
        return identityClient.resolveUserIdByLogin(
            require(config, "org_url"),
            require(config, "api_token"),
            username
        );
    }

    @Override
    public List<NormalizedAlert> fetchAlerts(Map<String, String> config, Instant since) {
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
