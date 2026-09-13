package com.hivearmor.service.hunt;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class HuntCursorCodecTest {

    private HuntCursorCodec codec;

    @BeforeEach
    void setUp() {
        codec = new HuntCursorCodec(new ObjectMapper(), "0123456789abcdef0123456789abcdef0123456789abcdef");
    }

    @Test
    @DisplayName("cursor round-trips its PIT search-after values")
    void cursorRoundTrip() {
        String cursor = codec.encode("HUNT-ABC", "analyst", "acme", Instant.now().plusSeconds(60), List.of("123", "7"));
        HuntCursorCodec.CursorPayload decoded = codec.decode(cursor, "analyst", "acme");
        assertThat(decoded.searchId()).isEqualTo("HUNT-ABC");
        assertThat(decoded.sortValues()).containsExactly("123", "7");
    }

    @Test
    @DisplayName("cursor is bound to principal and tenant")
    void cursorScopeBinding() {
        String cursor = codec.encode("HUNT-ABC", "analyst", "acme", Instant.now().plusSeconds(60), List.of("123"));
        assertThatThrownBy(() -> codec.decode(cursor, "other", "acme"))
            .isInstanceOf(HuntQueryException.class)
            .extracting("code")
            .isEqualTo("HUNT_CURSOR_FORBIDDEN");
    }

    @Test
    @DisplayName("tampered and expired cursors fail closed")
    void tamperAndExpiry() {
        String cursor = codec.encode("HUNT-ABC", "analyst", "acme", Instant.now().plusSeconds(60), List.of("123"));
        String tampered = cursor.substring(0, cursor.length() - 1) + (cursor.endsWith("A") ? "B" : "A");
        assertThatThrownBy(() -> codec.decode(tampered, "analyst", "acme"))
            .isInstanceOf(HuntQueryException.class)
            .extracting("code")
            .isEqualTo("HUNT_CURSOR_INVALID");

        String expired = codec.encode("HUNT-ABC", "analyst", "acme", Instant.now().minusSeconds(1), List.of("123"));
        assertThatThrownBy(() -> codec.decode(expired, "analyst", "acme"))
            .isInstanceOf(HuntQueryException.class)
            .extracting("code")
            .isEqualTo("HUNT_CURSOR_EXPIRED");
    }
}
