package com.hivearmor.service.connector.impl;

import com.hivearmor.service.connector.ConnectionTestResult;
import com.hivearmor.service.connector.ConnectorCapability;
import com.hivearmor.service.connector.ConnectorField;
import com.hivearmor.service.connector.ConnectorSchema;
import com.hivearmor.service.connector.NormalizedAlert;

import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Google Workspace — PULL_AUDIT (Admin SDK Reports API).
 *
 * <p>STAGING CANDIDATE: schema and normalize are wired; live JWT/OAuth Admin
 * SDK probe is stubbed until staging credentials are supplied. No secrets
 * are logged.
 */
public final class GoogleWorkspaceConnector extends AbstractHttpConnector {

    public static final String ID = "google_workspace";

    private static final String DEFAULT_BASE = "https://admin.googleapis.com";

    @Override
    public String connectorId() {
        return ID;
    }

    @Override
    public String connectorName() {
        return "Google Workspace";
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
            "Google Workspace Admin SDK audit / Reports API "
                + "(login, admin, drive activities). Service-account "
                + "domain-wide delegation or OAuth client credentials.",
            List.of(
                ConnectorField.string("domain", "Workspace primary domain"),
                ConnectorField.secret("client_email", "Service account client email"),
                ConnectorField.secret("private_key", "Service account private key (PEM)"),
                ConnectorField.string(
                    "admin_email",
                    "Delegated admin email (domain-wide delegation subject)"
                ),
                ConnectorField.stringOptional(
                    "customer_id",
                    "Customer ID",
                    "my_customer",
                    "Google customer id; default my_customer"
                ),
                ConnectorField.stringOptional(
                    "client_id",
                    "OAuth client ID",
                    null,
                    "Optional when using OAuth refresh-token flow instead of SA key"
                ),
                ConnectorField.secretOptional(
                    "client_secret",
                    "OAuth client secret",
                    "Optional OAuth client secret"
                ),
                ConnectorField.secretOptional(
                    "refresh_token",
                    "OAuth refresh token",
                    "Optional; pair with client_id/client_secret"
                ),
                ConnectorField.stringOptional(
                    "base_url",
                    "Admin SDK base URL",
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
            String domain = require(config, "domain");
            if (!domain.matches("[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}")) {
                return ConnectionTestResult.failure("Invalid Workspace domain format");
            }
            require(config, "client_email");
            require(config, "private_key");
            require(config, "admin_email");
            String base = optional(config, "base_url", DEFAULT_BASE).replaceAll("/$", "");
            safeBase(base);
            if (looksLikePlaceholder(config)) {
                return ConnectionTestResult.failure(
                    "Refusing live probe with placeholder credentials — set real "
                        + "service-account or OAuth secrets"
                );
            }
            // Honest stub: full Google JWT assertion + Reports API probe needs
            // staging credentials and is not exercised in unit tests.
            return ConnectionTestResult.failure(
                "Config validated for domain "
                    + domain
                    + ", but live Google Admin SDK probe is not enabled without "
                    + "staging credentials (STAGING CANDIDATE)"
            );
        } catch (IllegalArgumentException e) {
            return ConnectionTestResult.failure(e.getMessage());
        } catch (Exception e) {
            return ConnectionTestResult.failure("Google Workspace probe failed: " + e.getMessage());
        }
    }

    @Override
    public List<NormalizedAlert> fetchAlerts(Map<String, String> config, Instant since) {
        validateRequiredFields(config);
        // Preview / dry-run only — no OpenSearch write (ADR-20260824).
        return List.of();
    }

    @Override
    public NormalizedAlert normalize(Map<String, Object> raw) {
        Object idNode = raw.get("id");
        String externalId = null;
        if (idNode instanceof Map<?, ?> idMap) {
            Object uq = idMap.get("uniqueQualifier");
            if (uq != null) {
                externalId = String.valueOf(uq);
            }
        }
        if (externalId == null || externalId.isBlank()) {
            externalId = asString(raw.getOrDefault("uniqueQualifier", raw.get("id")));
        }

        String title = firstEventName(raw);
        if (title == null || title.isBlank()) {
            title = asString(raw.getOrDefault("title", "Google Workspace audit event"));
        }

        String srcIp = asString(raw.get("ipAddress"));
        if (srcIp == null) {
            srcIp = asString(raw.get("src_ip"));
        }

        String hostname = null;
        Object actor = raw.get("actor");
        if (actor instanceof Map<?, ?> actorMap) {
            Object email = actorMap.get("email");
            if (email != null) {
                hostname = String.valueOf(email);
            }
        }
        if (hostname == null) {
            hostname = asString(raw.get("hostname"));
        }

        return new NormalizedAlert(
            ID,
            externalId,
            title,
            asString(raw.getOrDefault("description", raw.get("kind"))),
            asString(raw.getOrDefault("severity", "medium")),
            hostname,
            srcIp,
            List.of(),
            Instant.now(),
            raw
        );
    }

    private static String firstEventName(Map<String, Object> raw) {
        Object events = raw.get("events");
        if (!(events instanceof List<?> list) || list.isEmpty()) {
            return null;
        }
        Object first = list.get(0);
        if (first instanceof Map<?, ?> eventMap) {
            Object name = eventMap.get("name");
            return name != null ? String.valueOf(name) : null;
        }
        return null;
    }

    static boolean looksLikePlaceholder(Map<String, String> config) {
        if (config == null) {
            return true;
        }
        for (String v : config.values()) {
            if (v != null && v.toLowerCase(Locale.ROOT).contains("placeholder")) {
                return true;
            }
        }
        return false;
    }
}
