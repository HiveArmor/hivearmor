package com.hivearmor.service.telemetry;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TelemetryCursorTest {

    @Test
    void roundTripsParts() {
        String encoded = TelemetryCursor.encode(List.of("9.8", "1", "42"));
        assertThat(TelemetryCursor.decode(encoded)).containsExactly("9.8", "1", "42");
    }

    @Test
    void blankCursorIsEmpty() {
        assertThat(TelemetryCursor.decode(" ")).isEmpty();
        assertThat(TelemetryCursor.decode(null)).isEmpty();
    }

    @Test
    void rejectsGarbage() {
        assertThatThrownBy(() -> TelemetryCursor.decode("!!!not-base64!!!"))
            .isInstanceOf(TelemetryQueryException.class)
            .hasFieldOrPropertyWithValue("code", "TELEMETRY_CURSOR_INVALID");
    }
}
