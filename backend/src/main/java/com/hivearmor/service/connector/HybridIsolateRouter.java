package com.hivearmor.service.connector;

/**
 * P2 hybrid response mesh — pure isolate-path decision.
 *
 * <p>First-party HiveArmor agent is always preferred when enrolled. Vendor
 * {@link ConnectorCapability#ISOLATE_HOST} is only selectable when
 * {@code hivearmor.connectors.vendor-isolate-enabled} is true.
 *
 * <p><strong>STAGING CANDIDATE</strong> — routing helper only; does not invoke
 * vendor APIs or ProcessCommand.
 */
public final class HybridIsolateRouter {

    public enum Path {
        /** Enrolled HA agent → EdrService / ProcessCommand. */
        HA_AGENT,
        /** No HA agent; vendor connector kinetic isolate (feature-flagged). */
        VENDOR_CONNECTOR,
        /** Neither path available. */
        UNAVAILABLE
    }

    public record Decision(Path path, String reason) {}

    private HybridIsolateRouter() {}

    /**
     * @param haAgentEnrolled             true when a non-blank HA agent id is present / enrolled
     * @param vendorIsolateEnabled        {@code hivearmor.connectors.vendor-isolate-enabled}
     * @param vendorHasIsolateCapability  at least one registered connector declares {@code ISOLATE_HOST}
     */
    public static Decision resolve(
            boolean haAgentEnrolled,
            boolean vendorIsolateEnabled,
            boolean vendorHasIsolateCapability) {
        if (haAgentEnrolled) {
            return new Decision(
                Path.HA_AGENT,
                "HA agent enrolled — first-party isolate preferred"
            );
        }
        if (vendorIsolateEnabled && vendorHasIsolateCapability) {
            return new Decision(
                Path.VENDOR_CONNECTOR,
                "No HA agent enrolled; vendor ISOLATE_HOST available behind feature flag"
            );
        }
        if (!vendorIsolateEnabled) {
            return new Decision(
                Path.UNAVAILABLE,
                "No HA agent enrolled and vendor isolate disabled "
                    + "(hivearmor.connectors.vendor-isolate-enabled=false)"
            );
        }
        return new Decision(
            Path.UNAVAILABLE,
            "No HA agent enrolled and no connector declares ISOLATE_HOST"
        );
    }
}
