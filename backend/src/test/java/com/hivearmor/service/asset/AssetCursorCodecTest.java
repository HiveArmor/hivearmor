package com.hivearmor.service.asset;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AssetCursorCodecTest {

    private static final String SECRET = "asset-cursor-test-secret-with-at-least-32-characters";
    private final AssetCursorCodec codec = new AssetCursorCodec(new ObjectMapper().findAndRegisterModules(), SECRET);

    @Test
    void roundTripsScopeBoundKeyset() {
        Instant snapshot = Instant.parse("2026-08-10T07:30:00Z");
        AssetCursorCodec.CursorPayload payload = new AssetCursorCodec.CursorPayload(
            "analyst", "tenant-a", "filters", 82D, 44L, snapshot, Instant.now().plusSeconds(60));

        AssetCursorCodec.CursorPayload decoded = codec.decode(codec.encode(payload), "analyst", "tenant-a", "filters");

        assertThat(decoded.lastRiskScore()).isEqualTo(82D);
        assertThat(decoded.lastId()).isEqualTo(44L);
        assertThat(decoded.snapshotAt()).isEqualTo(snapshot);
    }

    @Test
    void rejectsChangedPrincipalTenantOrFilters() {
        AssetCursorCodec.CursorPayload payload = new AssetCursorCodec.CursorPayload(
            "analyst", "tenant-a", "filters", 82D, 44L, Instant.now(), Instant.now().plusSeconds(60));
        String cursor = codec.encode(payload);

        assertThatThrownBy(() -> codec.decode(cursor, "other", "tenant-a", "filters"))
            .isInstanceOf(AssetContractException.class)
            .hasMessageContaining("scope");
        assertThatThrownBy(() -> codec.decode(cursor, "analyst", "tenant-b", "filters"))
            .isInstanceOf(AssetContractException.class);
        assertThatThrownBy(() -> codec.decode(cursor, "analyst", "tenant-a", "changed"))
            .isInstanceOf(AssetContractException.class);
    }

    @Test
    void rejectsTamperingAndExpiry() {
        AssetCursorCodec.CursorPayload expired = new AssetCursorCodec.CursorPayload(
            "analyst", "tenant-a", "filters", 82D, 44L, Instant.now(), Instant.now().minusSeconds(1));
        String cursor = codec.encode(expired);

        assertThatThrownBy(() -> codec.decode(cursor + "x", "analyst", "tenant-a", "filters"))
            .isInstanceOf(AssetContractException.class);
        assertThatThrownBy(() -> codec.decode(cursor, "analyst", "tenant-a", "filters"))
            .isInstanceOf(AssetContractException.class)
            .hasMessageContaining("expired");
    }
}
