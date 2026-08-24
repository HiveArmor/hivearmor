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
 * Microsoft Entra ID (Azure AD) — PULL_AUDIT.
 */
public final class AzureEntraConnector extends AbstractHttpConnector {

    public static final String ID = "azure_entra";

    private final MicrosoftOAuthClient oauth;

    public AzureEntraConnector(MicrosoftOAuthClient oauth) {
        this.oauth = oauth != null ? oauth : new MicrosoftOAuthClient();
    }

    public AzureEntraConnector() {
        this(new MicrosoftOAuthClient());
    }

    @Override
    public String connectorId() {
        return ID;
    }

    @Override
    public String connectorName() {
        return "Microsoft Entra ID";
    }

    @Override
    public String category() {
        return "iam";
    }

    @Override
    public Set<ConnectorCapability> capabilities() {
        return EnumSet.of(ConnectorCapability.PULL_AUDIT);
    }

    @Override
    public ConnectorSchema schema() {
        return new ConnectorSchema(
            ID,
            connectorName(),
            category(),
            "Microsoft Entra ID directory audit and sign-in logs via Microsoft Graph.",
            List.of(
                ConnectorField.secret("tenant_id", "Tenant ID"),
                ConnectorField.secret("client_id", "Application (client) ID"),
                ConnectorField.secret("client_secret", "Client secret"),
                ConnectorField.stringOptional(
                    "base_url",
                    "Graph base URL",
                    "https://graph.microsoft.com",
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
            String base = optional(config, "base_url", "https://graph.microsoft.com").replaceAll("/$", "");
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
                MicrosoftOAuthClient.graphScope()
            );
            return oauth.probeGet(base + "/v1.0/organization?$select=id,displayName", token);
        } catch (IllegalArgumentException e) {
            return ConnectionTestResult.failure(e.getMessage());
        } catch (Exception e) {
            return ConnectionTestResult.failure("Entra OAuth/probe failed: " + e.getMessage());
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
            asString(raw.getOrDefault("activityDisplayName", "Entra audit event")),
            asString(raw.get("resultReason")),
            "medium",
            null,
            asString(raw.get("ipAddress")),
            List.of(),
            Instant.now(),
            raw
        );
    }
}
