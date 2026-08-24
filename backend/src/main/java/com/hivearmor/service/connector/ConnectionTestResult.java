package com.hivearmor.service.connector;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Result of {@link HaConnector#testConnection(Map)}.
 */
public final class ConnectionTestResult {

    private final boolean ok;
    private final String message;
    private final Integer httpStatus;

    public ConnectionTestResult(boolean ok, String message, Integer httpStatus) {
        this.ok = ok;
        this.message = message;
        this.httpStatus = httpStatus;
    }

    public static ConnectionTestResult success(String message) {
        return new ConnectionTestResult(true, message, 200);
    }

    public static ConnectionTestResult failure(String message) {
        return new ConnectionTestResult(false, message, null);
    }

    public static ConnectionTestResult failure(String message, int httpStatus) {
        return new ConnectionTestResult(false, message, httpStatus);
    }

    public boolean isOk() {
        return ok;
    }

    public String getMessage() {
        return message;
    }

    public Integer getHttpStatus() {
        return httpStatus;
    }

    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ok", ok);
        m.put("message", message);
        if (httpStatus != null) {
            m.put("httpStatus", httpStatus);
        }
        return m;
    }
}
