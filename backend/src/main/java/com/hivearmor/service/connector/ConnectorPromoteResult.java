package com.hivearmor.service.connector;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Result of promoting staged connector alerts (ADR-20260824-connector-staging-bridge).
 *
 * <p>Destination is always {@code v3-hive-connector-promoted-*}, never alert indices
 * and never event-processor {@code /v1/inject}.
 */
public final class ConnectorPromoteResult {

    public static final String INDEX_TYPE = "connector-promoted";
    public static final String DOCUMENT_KIND = "connector_staging_promoted";
    public static final String CORRELATION_STATUS = "not_correlated";
    public static final String PROVENANCE = "connector_staging_bridge";

    private final String promoteBatchId;
    private final String destinationIndex;
    private final int requested;
    private final int promoted;
    private final int failed;
    private final int skipped;
    private final List<Map<String, Object>> results;

    public ConnectorPromoteResult(
            String promoteBatchId,
            String destinationIndex,
            int requested,
            int promoted,
            int failed,
            int skipped,
            List<Map<String, Object>> results) {
        this.promoteBatchId = promoteBatchId;
        this.destinationIndex = destinationIndex;
        this.requested = requested;
        this.promoted = promoted;
        this.failed = failed;
        this.skipped = skipped;
        this.results = results != null ? List.copyOf(results) : List.of();
    }

    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("promoteBatchId", promoteBatchId);
        m.put("requested", requested);
        m.put("promoted", promoted);
        m.put("failed", failed);
        m.put("skipped", skipped);
        m.put("destinationIndex", destinationIndex);
        m.put("indexType", INDEX_TYPE);
        m.put("documentKind", DOCUMENT_KIND);
        m.put("correlationStatus", CORRELATION_STATUS);
        m.put(
            "note",
            "ADR-20260824-connector-staging-bridge — labeled connector-promoted docs only; "
                + "not v3-hive-alert-*; not EP /v1/inject; not_correlated"
        );
        m.put("results", new ArrayList<>(results));
        return m;
    }

    public String getPromoteBatchId() {
        return promoteBatchId;
    }

    public String getDestinationIndex() {
        return destinationIndex;
    }

    public int getRequested() {
        return requested;
    }

    public int getPromoted() {
        return promoted;
    }

    public int getFailed() {
        return failed;
    }

    public int getSkipped() {
        return skipped;
    }

    public List<Map<String, Object>> getResults() {
        return results;
    }
}
