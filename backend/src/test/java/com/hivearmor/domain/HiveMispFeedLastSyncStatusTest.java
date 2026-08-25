package com.hivearmor.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TI-004 STAGING CANDIDATE — MISP lastSyncStatus field parity with TAXII.
 */
class HiveMispFeedLastSyncStatusTest {

    @Test
    void lastSyncStatusPersistsOkAndErrorValues() {
        HiveMispFeed feed = new HiveMispFeed();
        Instant at = Instant.parse("2026-08-25T06:00:00Z");

        feed.setLastSyncAt(at);
        feed.setLastSyncStatus("OK");
        feed.setLastSyncCount(12);

        assertThat(feed.getLastSyncAt()).isEqualTo(at);
        assertThat(feed.getLastSyncStatus()).isEqualTo("OK");
        assertThat(feed.getLastSyncCount()).isEqualTo(12);

        feed.setLastSyncStatus("ERROR");
        feed.setLastSyncCount(0);
        assertThat(feed.getLastSyncStatus()).isEqualTo("ERROR");
        assertThat(feed.getLastSyncCount()).isZero();
    }
}
