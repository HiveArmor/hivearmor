package com.hivearmor.service.connector;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Result of persisting connector alerts to the ADR-20260824 staging queue.
 *
 * <p>{@code destination} is always the PostgreSQL table
 * {@code ha_connector_alert_staging} — never an OpenSearch alert index.
 */
public final class ConnectorIngestResult {

    public static final String DESTINATION = "ha_connector_alert_staging";

    private final String batchId;
    private final Long connectorInstanceId;
    private final String connectorId;
    private final int fetched;
    private final int inserted;
    private final int skippedDuplicate;
    private final List<Map<String, Object>> alerts;

    public ConnectorIngestResult(
            String batchId,
            Long connectorInstanceId,
            String connectorId,
            int fetched,
            int inserted,
            int skippedDuplicate,
            List<Map<String, Object>> alerts) {
        this.batchId = batchId;
        this.connectorInstanceId = connectorInstanceId;
        this.connectorId = connectorId;
        this.fetched = fetched;
        this.inserted = inserted;
        this.skippedDuplicate = skippedDuplicate;
        this.alerts = alerts != null ? List.copyOf(alerts) : List.of();
    }

    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("batchId", batchId);
        m.put("connectorInstanceId", connectorInstanceId);
        m.put("connectorId", connectorId);
        m.put("fetched", fetched);
        m.put("inserted", inserted);
        m.put("skippedDuplicate", skippedDuplicate);
        m.put("count", fetched);
        m.put("persisted", true);
        m.put("destination", DESTINATION);
        m.put(
            "note",
            "ADR-20260824 staging queue (PostgreSQL) — not OpenSearch v3-hive-alert-*; EP bridge requires follow-up ADR"
        );
        m.put("alerts", new ArrayList<>(alerts));
        return m;
    }

    public String getBatchId() {
        return batchId;
    }

    public Long getConnectorInstanceId() {
        return connectorInstanceId;
    }

    public String getConnectorId() {
        return connectorId;
    }

    public int getFetched() {
        return fetched;
    }

    public int getInserted() {
        return inserted;
    }

    public int getSkippedDuplicate() {
        return skippedDuplicate;
    }

    public List<Map<String, Object>> getAlerts() {
        return alerts;
    }
}
