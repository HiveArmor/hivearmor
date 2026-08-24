package com.hivearmor.service.connector;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * P2 hybrid response mesh — playbook/EDR isolate routing beside first-party agent.
 *
 * <p>Prefers enrolled HA agent. Vendor {@link ConnectorCapability#ISOLATE_HOST}
 * is only planned when {@code hivearmor.connectors.vendor-isolate-enabled=true}.
 * Vendor branch is a <strong>dry-run / plan</strong> — no live vendor kinetic calls.
 *
 * <p>Label: <strong>STAGING CANDIDATE</strong> — not PRODUCTION READY.
 */
@Service
public class HybridResponseMeshDispatcher {

    private final HaConnectorRegistry registry;
    private final boolean vendorIsolateEnabled;

    @Autowired
    public HybridResponseMeshDispatcher(
            HaConnectorRegistry registry,
            @Value("${hivearmor.connectors.vendor-isolate-enabled:false}") boolean vendorIsolateEnabled) {
        this.registry = registry;
        this.vendorIsolateEnabled = vendorIsolateEnabled;
    }

    public boolean isVendorIsolateEnabled() {
        return vendorIsolateEnabled;
    }

    public boolean anyVendorDeclaresIsolate() {
        return registry.all().stream()
            .anyMatch(c -> c.capabilities().contains(ConnectorCapability.ISOLATE_HOST));
    }

    /**
     * Plan isolate path. Does not dispatch ProcessCommand or vendor APIs.
     *
     * @param haAgentEnrolled true when playbook/EDR supplies a non-blank agent id
     */
    public HybridIsolateRouter.Decision planIsolate(boolean haAgentEnrolled) {
        return HybridIsolateRouter.resolve(
            haAgentEnrolled,
            vendorIsolateEnabled,
            anyVendorDeclaresIsolate()
        );
    }

    /**
     * Dry-run vendor isolate plan for playbook steps — never calls vendor APIs,
     * never logs secrets.
     *
     * @param connectorId optional preferred connector (defaults to first with ISOLATE_HOST)
     * @param hostname    optional host hint for audit payload
     */
    public Map<String, Object> vendorIsolateDryRun(String connectorId, String hostname) {
        if (!vendorIsolateEnabled) {
            throw new IllegalStateException(
                "Vendor isolate disabled (hivearmor.connectors.vendor-isolate-enabled=false)");
        }
        HaConnector connector = resolveIsolateConnector(connectorId)
            .orElseThrow(() -> new IllegalStateException(
                "No connector declares ISOLATE_HOST while vendor-isolate-enabled=true"));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("action", "isolate_host");
        out.put("path", HybridIsolateRouter.Path.VENDOR_CONNECTOR.name());
        out.put("connectorId", connector.connectorId());
        out.put("capability", ConnectorCapability.ISOLATE_HOST.name());
        out.put("executed", false);
        out.put("persisted", false);
        out.put("status", "planned");
        out.put(
            "note",
            "STAGING CANDIDATE dry-run — vendor kinetic isolate not executed; "
                + "HA agent remains primary when enrolled"
        );
        if (hostname != null && !hostname.isBlank()) {
            out.put("hostname", hostname.trim());
        }
        return out;
    }

    private Optional<HaConnector> resolveIsolateConnector(String connectorId) {
        if (connectorId != null && !connectorId.isBlank()) {
            String id = connectorId.trim().toLowerCase(Locale.ROOT);
            return registry.get(id)
                .filter(c -> c.capabilities().contains(ConnectorCapability.ISOLATE_HOST));
        }
        return registry.all().stream()
            .filter(c -> c.capabilities().contains(ConnectorCapability.ISOLATE_HOST))
            .findFirst();
    }
}
