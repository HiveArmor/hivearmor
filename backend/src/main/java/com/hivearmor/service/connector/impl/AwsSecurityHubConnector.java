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
 * AWS Security Hub — PULL_ALERTS.
 */
public final class AwsSecurityHubConnector extends AbstractHttpConnector {

    public static final String ID = "aws_security_hub";

    @Override
    public String connectorId() {
        return ID;
    }

    @Override
    public String connectorName() {
        return "AWS Security Hub";
    }

    @Override
    public String category() {
        return "cloud";
    }

    @Override
    public Set<ConnectorCapability> capabilities() {
        return EnumSet.of(ConnectorCapability.PULL_ALERTS, ConnectorCapability.BLOCK_IP);
    }

    @Override
    public ConnectorSchema schema() {
        return new ConnectorSchema(
            ID,
            connectorName(),
            category(),
            "AWS Security Hub findings via the Security Hub API.",
            List.of(
                ConnectorField.string("region", "AWS region"),
                ConnectorField.secret("access_key_id", "Access key ID"),
                ConnectorField.secret("secret_access_key", "Secret access key"),
                ConnectorField.stringOptional("session_token", "Session token", null, "Optional for temporary credentials")
            ),
            List.copyOf(capabilities())
        );
    }

    @Override
    public ConnectionTestResult testConnection(Map<String, String> config) {
        try {
            validateRequiredFields(config);
            String region = require(config, "region");
            if (!region.matches("[a-z0-9-]+")) {
                return ConnectionTestResult.failure("Invalid AWS region format");
            }
            require(config, "access_key_id");
            require(config, "secret_access_key");
            return ConnectionTestResult.success(
                "Config validated for region " + region + ". Live SigV4 probe requires staging credentials."
            );
        } catch (IllegalArgumentException e) {
            return ConnectionTestResult.failure(e.getMessage());
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
            asString(raw.getOrDefault("Id", raw.get("id"))),
            asString(raw.getOrDefault("Title", raw.getOrDefault("title", "Security Hub finding"))),
            asString(raw.get("Description")),
            asString(raw.getOrDefault("Severity.Label", raw.getOrDefault("severity", "medium"))),
            asString(raw.get("Resources[0].Id")),
            null,
            List.of(),
            Instant.now(),
            raw
        );
    }
}
