package com.hivearmor.service.connector;

import com.hivearmor.domain.connector.HaConnectorInstance;
import com.hivearmor.repository.connector.HaConnectorInstanceRepository;
import com.hivearmor.service.connector.impl.AzureEntraConnector;
import com.hivearmor.service.connector.impl.OktaConnector;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Resolves playbook actions to typed connector capabilities.
 *
 * <p>First-party HA agent remains preferred for isolate/kill via
 * {@link HybridResponseMeshDispatcher}. Vendor kinetic actions stay behind
 * {@code hivearmor.connectors.vendor-isolate-enabled} and are dry-run only
 * in the mesh dispatcher (no live vendor calls).
 * {@code pull_alerts} persists to the ADR-20260824 PostgreSQL staging queue
 * (not OpenSearch alert indices).
 * {@code disable_user} performs live Okta lifecycle deactivate or Entra
 * {@code accountEnabled=false} when connector is {@code okta} or {@code azure_entra}.
 */
@Service
public class PlaybookConnectorDispatcher {

    private static final Set<String> TEST_IDS = Set.of(
        "connector.test", "connector_test", "test_connection");
    private static final Set<String> PULL_IDS = Set.of(
        "connector.pull_alerts", "pull_alerts", "pull-alerts", "connector.fetch_alerts");
    private static final Set<String> DISABLE_USER_IDS = Set.of(
        "disable_user", "disable-user", "identity.disable_user", "connector.disable_user");

    private final HaConnectorInstanceService instanceService;
    private final HaConnectorRegistry registry;
    private final HaConnectorInstanceRepository instanceRepository;
    private final ConnectorAlertIngestService ingestService;

    public PlaybookConnectorDispatcher(
            HaConnectorInstanceService instanceService,
            HaConnectorRegistry registry,
            HaConnectorInstanceRepository instanceRepository,
            ConnectorAlertIngestService ingestService) {
        this.instanceService = instanceService;
        this.registry = registry;
        this.instanceRepository = instanceRepository;
        this.ingestService = ingestService;
    }

    public boolean supports(String actionId) {
        if (actionId == null || actionId.isBlank()) {
            return false;
        }
        String n = actionId.trim().toLowerCase(Locale.ROOT);
        return TEST_IDS.contains(n) || PULL_IDS.contains(n) || DISABLE_USER_IDS.contains(n);
    }

    @Transactional
    public Map<String, Object> dispatch(String actionId, Map<String, Object> config) {
        String n = actionId.trim().toLowerCase(Locale.ROOT);
        HaConnectorInstance row = resolveInstance(config);
        HaConnector connector = registry.require(row.getConnectorId());

        if (TEST_IDS.contains(n)) {
            ConnectionTestResult result = instanceService.test(row.getId());
            Map<String, Object> out = new LinkedHashMap<>(result.toMap());
            out.put("action", "connector.test");
            out.put("connectorInstanceId", row.getId());
            out.put("connectorId", row.getConnectorId());
            return out;
        }

        if (PULL_IDS.contains(n)) {
            if (!connector.capabilities().contains(ConnectorCapability.PULL_ALERTS)
                && !connector.capabilities().contains(ConnectorCapability.PULL_AUDIT)) {
                throw new IllegalStateException(
                    "Connector " + row.getConnectorId() + " does not declare PULL_ALERTS/PULL_AUDIT");
            }
            Instant since = Instant.now().minusSeconds(3600);
            ConnectorIngestResult ingest = ingestService.ingest(row.getId(), since);
            Map<String, Object> out = new LinkedHashMap<>(ingest.toMap());
            out.put("action", "connector.pull_alerts");
            return out;
        }

        if (DISABLE_USER_IDS.contains(n)) {
            return disableUser(row, connector, config);
        }

        throw new IllegalArgumentException("Unsupported connector action: " + actionId);
    }

    private Map<String, Object> disableUser(
            HaConnectorInstance row,
            HaConnector connector,
            Map<String, Object> config) {
        if (!connector.capabilities().contains(ConnectorCapability.DISABLE_USER)) {
            throw new IllegalStateException(
                "Connector " + row.getConnectorId() + " does not declare DISABLE_USER");
        }

        String userId = firstNonBlank(
            asString(config.get("userId")),
            paramString(config, "userId")
        );
        String username = firstNonBlank(
            asString(config.get("username")),
            paramString(config, "username"),
            asString(config.get("login")),
            paramString(config, "login"),
            asString(config.get("upn")),
            paramString(config, "upn")
        );

        Map<String, String> merged = instanceService.decryptedConfig(row.getId());

        if (connector instanceof OktaConnector okta) {
            return disableOktaUser(row, okta, merged, userId, username);
        }
        if (connector instanceof AzureEntraConnector entra) {
            return disableEntraUser(row, entra, merged, userId, username);
        }

        throw new IllegalStateException(
            "Live DISABLE_USER is only implemented for Okta and azure_entra (got: "
                + row.getConnectorId() + ")");
    }

    private Map<String, Object> disableOktaUser(
            HaConnectorInstance row,
            OktaConnector okta,
            Map<String, String> merged,
            String userId,
            String username) {
        if (OktaIdentityClient.looksLikePlaceholder(merged)) {
            throw new IllegalArgumentException("Refusing Okta mutate with placeholder credentials");
        }

        if ((userId == null || userId.isBlank()) && (username == null || username.isBlank())) {
            throw new IllegalArgumentException(
                "disable_user requires config.userId (or username for Okta login lookup)");
        }

        String resolvedId = userId;
        if (resolvedId == null || resolvedId.isBlank()) {
            resolvedId = okta.resolveUserId(merged, username);
        }

        Map<String, Object> result = okta.deactivateUser(merged, resolvedId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("action", "disable_user");
        out.put("connectorInstanceId", row.getId());
        out.put("connectorId", row.getConnectorId());
        out.put("status", Boolean.TRUE.equals(result.get("ok")) ? "deactivated" : "failed");
        out.putAll(result);
        return out;
    }

    private Map<String, Object> disableEntraUser(
            HaConnectorInstance row,
            AzureEntraConnector entra,
            Map<String, String> merged,
            String userId,
            String username) {
        if (MicrosoftOAuthClient.looksLikePlaceholder(merged)) {
            throw new IllegalArgumentException("Refusing Entra mutate with placeholder credentials");
        }

        String userKey = firstNonBlank(userId, username);
        if (userKey == null || userKey.isBlank()) {
            throw new IllegalArgumentException(
                "disable_user requires config.userId (Entra object id or UPN)");
        }

        Map<String, Object> result = entra.disableUser(merged, userKey);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("action", "disable_user");
        out.put("connectorInstanceId", row.getId());
        out.put("connectorId", row.getConnectorId());
        out.put("status", Boolean.TRUE.equals(result.get("ok")) ? "disabled" : "failed");
        out.putAll(result);
        return out;
    }

    private HaConnectorInstance resolveInstance(Map<String, Object> config) {
        Long instanceId = asLong(config.get("connectorInstanceId"));
        if (instanceId == null && config.get("params") instanceof Map<?, ?> pm) {
            instanceId = asLong(pm.get("connectorInstanceId"));
        }
        if (instanceId != null) {
            final Long id = instanceId;
            return instanceRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Connector instance not found: " + id));
        }

        String connectorKey = asString(config.get("connectorId"));
        if (connectorKey == null && config.get("params") instanceof Map<?, ?> pm) {
            connectorKey = asString(pm.get("connectorId"));
        }
        if (connectorKey != null && !connectorKey.isBlank()) {
            final String connectorId = connectorKey.trim();
            var rows = instanceRepository.findByConnectorIdOrderByNameAsc(connectorId);
            Optional<HaConnectorInstance> enabled = rows.stream().filter(HaConnectorInstance::isEnabled).findFirst();
            return enabled.orElseThrow(() -> new IllegalArgumentException(
                "No enabled connector instance for connectorId=" + connectorId));
        }

        throw new IllegalArgumentException(
            "Connector action requires config.connectorInstanceId or config.connectorId");
    }

    private static String paramString(Map<String, Object> config, String key) {
        if (config.get("params") instanceof Map<?, ?> pm) {
            return asString(pm.get(key));
        }
        return null;
    }

    private static String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String v : values) {
            if (v != null && !v.isBlank() && !"null".equals(v)) {
                return v.trim();
            }
        }
        return null;
    }

    private static Long asLong(Object o) {
        if (o instanceof Number n) {
            return n.longValue();
        }
        if (o instanceof String s && !s.isBlank()) {
            try {
                return Long.parseLong(s.trim());
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }

    private static String asString(Object o) {
        return o == null ? null : String.valueOf(o);
    }
}
