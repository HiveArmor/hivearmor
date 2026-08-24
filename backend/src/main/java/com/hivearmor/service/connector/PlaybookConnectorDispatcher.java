package com.hivearmor.service.connector;

import com.hivearmor.domain.connector.HaConnectorInstance;
import com.hivearmor.repository.connector.HaConnectorInstanceRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Resolves playbook actions to typed connector capabilities.
 *
 * <p>First-party HA agent remains preferred for isolate/kill. Vendor kinetic
 * actions stay behind {@code hivearmor.connectors.vendor-isolate-enabled}.
 * {@code pull_alerts} is a dry-run (ADR-20260824) — does not write OpenSearch.
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

    public PlaybookConnectorDispatcher(
            HaConnectorInstanceService instanceService,
            HaConnectorRegistry registry,
            HaConnectorInstanceRepository instanceRepository) {
        this.instanceService = instanceService;
        this.registry = registry;
        this.instanceRepository = instanceRepository;
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
            List<Map<String, Object>> alerts = instanceService.fetchAlerts(row.getId(), Instant.now().minusSeconds(3600));
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("action", "connector.pull_alerts");
            out.put("connectorInstanceId", row.getId());
            out.put("connectorId", row.getConnectorId());
            out.put("count", alerts.size());
            out.put("persisted", false);
            out.put("note", "Dry-run only — ADR-20260824 forbids OpenSearch write from connectors");
            return out;
        }

        if (DISABLE_USER_IDS.contains(n)) {
            if (!connector.capabilities().contains(ConnectorCapability.DISABLE_USER)) {
                throw new IllegalStateException(
                    "Connector " + row.getConnectorId() + " does not declare DISABLE_USER");
            }
            // Live Okta deactivate is deferred; capability routing is proven here.
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("action", "disable_user");
            out.put("connectorInstanceId", row.getId());
            out.put("connectorId", row.getConnectorId());
            out.put("status", "capability_resolved");
            out.put(
                "note",
                "DISABLE_USER capability matched instance; live identity mutate not enabled in this build"
            );
            return out;
        }

        throw new IllegalArgumentException("Unsupported connector action: " + actionId);
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
            List<HaConnectorInstance> rows = instanceRepository.findByConnectorIdOrderByNameAsc(connectorId);
            Optional<HaConnectorInstance> enabled = rows.stream().filter(HaConnectorInstance::isEnabled).findFirst();
            return enabled.orElseThrow(() -> new IllegalArgumentException(
                "No enabled connector instance for connectorId=" + connectorId));
        }

        throw new IllegalArgumentException(
            "Connector action requires config.connectorInstanceId or config.connectorId");
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
