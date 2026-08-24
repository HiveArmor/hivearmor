package com.hivearmor.domain.connector;

/**
 * Lifecycle for {@link HaConnectorAlertStaging} rows (ADR-20260824 staging bridge).
 */
public final class ConnectorStagingStatus {

    public static final String PENDING = "PENDING";
    public static final String PROMOTED = "PROMOTED";
    public static final String FAILED = "FAILED";

    private ConnectorStagingStatus() {}
}
