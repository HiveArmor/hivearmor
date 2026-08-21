package com.hivearmor.service.telemetry;

/**
 * Structured telemetry query failure for vulnerability and CIS JDBC contracts.
 */
public class TelemetryQueryException extends IllegalArgumentException {

    private final String code;

    public TelemetryQueryException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
