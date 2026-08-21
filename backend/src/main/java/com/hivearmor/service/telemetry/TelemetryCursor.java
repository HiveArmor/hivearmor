package com.hivearmor.service.telemetry;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;

/**
 * Opaque keyset cursor for telemetry list contracts.
 */
public final class TelemetryCursor {

    private TelemetryCursor() {
    }

    public static String encode(List<String> parts) {
        String joined = String.join("\u001f", parts);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(joined.getBytes(StandardCharsets.UTF_8));
    }

    public static String[] decode(String cursor) {
        if (cursor == null || cursor.isBlank()) {
            return new String[0];
        }
        try {
            String decoded = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
            return decoded.split("\u001f", -1);
        } catch (RuntimeException e) {
            throw new TelemetryQueryException("TELEMETRY_CURSOR_INVALID", "List cursor is invalid");
        }
    }
}
