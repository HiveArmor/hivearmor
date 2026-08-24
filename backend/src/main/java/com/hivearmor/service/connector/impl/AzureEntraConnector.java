package com.hivearmor.service.connector.impl;

import com.hivearmor.service.connector.ConnectionTestResult;
import com.hivearmor.service.connector.ConnectorCapability;
import com.hivearmor.service.connector.ConnectorField;
import com.hivearmor.service.connector.ConnectorSchema;
import com.hivearmor.service.connector.MicrosoftOAuthClient;
import com.hivearmor.service.connector.NormalizedAlert;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Microsoft Entra ID (Azure AD) — PULL_AUDIT + live DISABLE_USER (Graph accountEnabled=false).
 *
 * <p>STAGING CANDIDATE — unit-tested with mocked Graph HTTP; not live-tenant verified.
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
        return EnumSet.of(ConnectorCapability.PULL_AUDIT, ConnectorCapability.DISABLE_USER);
    }

    @Override
    public ConnectorSchema schema() {
        return new ConnectorSchema(
            ID,
            connectorName(),
            category(),
            "Microsoft Entra ID directory audit/sign-in logs and DISABLE_USER via Microsoft Graph "
                + "(PATCH /v1.0/users/{id|UPN} accountEnabled=false). "
                + "Playbook disable_user accepts user object id or UPN.",
            List.of(
                ConnectorField.secret("tenant_id", "Tenant ID"),
                ConnectorField.secret("client_id", "Application (client) ID"),
                ConnectorField.secret("client_secret", "Client secret"),
                ConnectorField.stringOptional(
                    "base_url",
                    "Graph base URL",
                    "https://graph.microsoft.com",
                    "Microsoft Graph root; users are addressed by object id or UPN"
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

    /**
     * Disable an Entra user via Graph {@code PATCH /v1.0/users/{id|UPN}} with
     * {@code {"accountEnabled": false}}.
     *
     * @param config  merged connector config ({@code tenant_id}, {@code client_id}, {@code client_secret})
     * @param userKey Entra object id or userPrincipalName
     */
    public Map<String, Object> disableUser(Map<String, String> config, String userKey) {
        validateRequiredFields(config);
        if (MicrosoftOAuthClient.looksLikePlaceholder(config)) {
            throw new IllegalArgumentException("Refusing Entra mutate with placeholder credentials");
        }
        if (userKey == null || userKey.isBlank()) {
            throw new IllegalArgumentException("userId (object id or UPN) is required");
        }
        String base = optional(config, "base_url", "https://graph.microsoft.com").replaceAll("/$", "");
        safeBase(base);
        String key = userKey.trim();
        String pathId = URLEncoder.encode(key, StandardCharsets.UTF_8).replace("+", "%20");

        try {
            String token = oauth.fetchAccessToken(
                require(config, "tenant_id"),
                require(config, "client_id"),
                require(config, "client_secret"),
                MicrosoftOAuthClient.graphScope()
            );
            Map<String, Object> result = oauth.patchJson(
                base + "/v1.0/users/" + pathId,
                token,
                "{\"accountEnabled\":false}"
            );
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("userId", key);
            out.putAll(result);
            if (Boolean.TRUE.equals(result.get("ok"))) {
                out.put("message", "Entra user disabled (HTTP " + result.get("httpStatus") + ")");
            }
            return out;
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Entra disableUser failed: " + e.getMessage(), e);
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
