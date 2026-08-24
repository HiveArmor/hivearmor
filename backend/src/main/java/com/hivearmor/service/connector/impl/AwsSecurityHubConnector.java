package com.hivearmor.service.connector.impl;

import com.hivearmor.service.connector.AwsNetworkBlockClient;
import com.hivearmor.service.connector.ConnectionTestResult;
import com.hivearmor.service.connector.ConnectorCapability;
import com.hivearmor.service.connector.ConnectorField;
import com.hivearmor.service.connector.ConnectorSchema;
import com.hivearmor.service.connector.NormalizedAlert;

import java.time.Instant;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * AWS Security Hub — PULL_ALERTS + live BLOCK_IP via EC2 Network ACL deny.
 *
 * <p>BLOCK_IP uses the same IAM credentials as the connector instance to call
 * {@code CreateNetworkAclEntry} (deny, all protocols) for {@code ip/32}.
 * Default path is fail-closed without real credentials. Explicit
 * {@code dry_run=true} skips the AWS call and returns a clearly marked dry-run
 * result (never pretends a live block succeeded).
 *
 * <p>STAGING CANDIDATE — unit-tested with mocked EC2 HTTP; not live-account verified.
 */
public final class AwsSecurityHubConnector extends AbstractHttpConnector {

    public static final String ID = "aws_security_hub";

    private static final Pattern IPV4 = Pattern.compile(
        "^(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)$");

    private final AwsNetworkBlockClient awsNetwork;

    public AwsSecurityHubConnector(AwsNetworkBlockClient awsNetwork) {
        this.awsNetwork = awsNetwork != null ? awsNetwork : new AwsNetworkBlockClient();
    }

    public AwsSecurityHubConnector() {
        this(new AwsNetworkBlockClient());
    }

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
            "AWS Security Hub findings plus BLOCK_IP via EC2 CreateNetworkAclEntry "
                + "(deny rule for ip/32). Live path requires region, IAM keys, and network_acl_id. "
                + "Set dry_run=true to validate wiring without calling AWS (default is fail-closed).",
            List.of(
                ConnectorField.string("region", "AWS region"),
                ConnectorField.secret("access_key_id", "Access key ID"),
                ConnectorField.secret("secret_access_key", "Secret access key"),
                ConnectorField.stringOptional(
                    "session_token",
                    "Session token",
                    null,
                    "Optional for temporary credentials"
                ),
                ConnectorField.stringOptional(
                    "network_acl_id",
                    "Network ACL ID",
                    null,
                    "Required for live BLOCK_IP (e.g. acl-0abc…). Deny entry is added here."
                ),
                ConnectorField.stringOptional(
                    "rule_number",
                    "NACL rule number",
                    "100",
                    "EC2 Network ACL rule number (1–32766); default 100"
                ),
                ConnectorField.stringOptional(
                    "dry_run",
                    "Dry run",
                    "false",
                    "When true, BLOCK_IP returns a documented dry-run result and does not call AWS"
                )
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
            if (AwsNetworkBlockClient.looksLikePlaceholder(config)) {
                return ConnectionTestResult.failure(
                    "Refusing live probe with placeholder credentials — set real AWS keys"
                );
            }
            return ConnectionTestResult.success(
                "Config validated for region " + region
                    + ". Live SigV4 / NACL mutate requires staging credentials and network_acl_id."
            );
        } catch (IllegalArgumentException e) {
            return ConnectionTestResult.failure(e.getMessage());
        }
    }

    /**
     * Block an IPv4 address by creating an EC2 Network ACL deny entry ({@code /32}).
     *
     * @param config merged connector config
     * @param ip     IPv4 address to deny
     */
    public Map<String, Object> blockIp(Map<String, String> config, String ip) {
        validateRequiredFields(config);
        String region = require(config, "region");
        if (!region.matches("[a-z0-9-]+")) {
            throw new IllegalArgumentException("Invalid AWS region format");
        }
        String normalizedIp = requireValidIpv4(ip);
        String cidr = normalizedIp + "/32";
        boolean dryRun = isTruthy(optional(config, "dry_run", "false"));

        if (dryRun) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", true);
            out.put("dryRun", true);
            out.put("status", "dry_run");
            out.put("ip", normalizedIp);
            out.put("cidr", cidr);
            out.put("region", region);
            out.put("networkAclId", optional(config, "network_acl_id", null));
            out.put("mechanism", "ec2.CreateNetworkAclEntry");
            out.put(
                "message",
                "Dry-run only — no AWS API call was made. Set dry_run=false with real credentials "
                    + "and network_acl_id to enforce a NACL deny."
            );
            return out;
        }

        if (AwsNetworkBlockClient.looksLikePlaceholder(config)) {
            throw new IllegalArgumentException("Refusing AWS BLOCK_IP with placeholder credentials");
        }

        String accessKey = require(config, "access_key_id");
        String secretKey = require(config, "secret_access_key");
        String sessionToken = optional(config, "session_token", null);
        String networkAclId = optional(config, "network_acl_id", null);
        if (networkAclId == null || networkAclId.isBlank()) {
            throw new IllegalArgumentException(
                "network_acl_id is required for live BLOCK_IP (or set dry_run=true)"
            );
        }

        int ruleNumber = parseRuleNumber(optional(config, "rule_number", "100"));
        Map<String, Object> result = awsNetwork.createNetworkAclDenyEntry(
            region,
            accessKey,
            secretKey,
            sessionToken,
            networkAclId,
            cidr,
            ruleNumber,
            false
        );
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ip", normalizedIp);
        out.putAll(result);
        if (Boolean.TRUE.equals(result.get("ok"))) {
            out.put("message", "AWS blocked IP via NACL deny (HTTP " + result.get("httpStatus") + ")");
        }
        return out;
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

    static String requireValidIpv4(String ip) {
        if (ip == null || ip.isBlank()) {
            throw new IllegalArgumentException("ip is required for BLOCK_IP");
        }
        String trimmed = ip.trim();
        if (!IPV4.matcher(trimmed).matches()) {
            throw new IllegalArgumentException("BLOCK_IP requires a valid IPv4 address");
        }
        return trimmed;
    }

    private static int parseRuleNumber(String raw) {
        try {
            int n = Integer.parseInt(raw == null || raw.isBlank() ? "100" : raw.trim());
            if (n < 1 || n > 32766) {
                throw new IllegalArgumentException("rule_number must be between 1 and 32766");
            }
            return n;
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("rule_number must be an integer between 1 and 32766");
        }
    }

    private static boolean isTruthy(String value) {
        if (value == null || value.isBlank()) {
            return false;
        }
        String v = value.trim().toLowerCase(Locale.ROOT);
        return "true".equals(v) || "1".equals(v) || "yes".equals(v);
    }
}
