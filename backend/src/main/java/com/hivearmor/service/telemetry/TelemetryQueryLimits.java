package com.hivearmor.service.telemetry;

/**
 * Shared page bounds for vulnerability and CIS JDBC list contracts.
 */
public final class TelemetryQueryLimits {

    public static final int MAX_PAGE_SIZE = 100;

    private TelemetryQueryLimits() {
    }

    public static void requirePage(int page) {
        if (page < 0) {
            throw new TelemetryQueryException("TELEMETRY_PAGE_INVALID", "page must be 0 or greater");
        }
    }

    public static void requireSize(int size) {
        if (size < 1 || size > MAX_PAGE_SIZE) {
            throw new TelemetryQueryException(
                "TELEMETRY_SIZE_INVALID",
                "size must be between 1 and " + MAX_PAGE_SIZE);
        }
    }
}
