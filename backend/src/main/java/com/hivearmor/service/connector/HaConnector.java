package com.hivearmor.service.connector;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * HiveArmor connector contract — mirrors AiSOC {@code BaseConnector}.
 *
 * <p>Implementations are catalog entries (stateless). Runtime credentials are
 * passed as a merged config map (public fields + decrypted secrets).
 */
public interface HaConnector {

    String connectorId();

    String connectorName();

    String category();

    ConnectorSchema schema();

    Set<ConnectorCapability> capabilities();

    /**
     * Validates credentials / reachability. Must not log secrets.
     */
    ConnectionTestResult testConnection(Map<String, String> config);

    /**
     * Pull alerts since {@code since}. Empty list is valid. Must not write OpenSearch.
     */
    List<NormalizedAlert> fetchAlerts(Map<String, String> config, Instant since);

    /**
     * Map a vendor raw event into the neutral alert shape.
     */
    NormalizedAlert normalize(Map<String, Object> raw);
}
