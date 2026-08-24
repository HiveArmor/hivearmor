package com.hivearmor.service.connector.impl;

import com.hivearmor.service.connector.ConnectionTestResult;
import com.hivearmor.service.connector.ConnectorCapability;
import com.hivearmor.service.connector.ConnectorField;
import com.hivearmor.service.connector.ConnectorSchema;
import com.hivearmor.service.connector.MicrosoftOAuthClient;
import com.hivearmor.service.connector.NormalizedAlert;

import java.time.Instant;
import java.util.EnumSet;
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
        return List.of();
    }

    @Override
    public NormalizedAlert normalize(Map<String, Object> raw) {
        return new NormalizedAlert(
            ID,
            asString(raw.getOrDefault("id", raw.get("external_id"))),
            asString(raw.getOrDefault("title", "Defender alert")),
            asString(raw.get("description")),
            asString(raw.getOrDefault("severity", "medium")),
            asString(raw.getOrDefault("hostname", raw.get("deviceDnsName"))),
            asString(raw.get("src_ip")),
            List.of(),
            Instant.now(),
            raw
        );
    }
}
