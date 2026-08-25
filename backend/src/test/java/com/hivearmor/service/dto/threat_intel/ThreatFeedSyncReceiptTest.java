package com.hivearmor.service.dto.threat_intel;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit tests for TI-004 thin sync receipt shaping (STAGING CANDIDATE).
 */
class ThreatFeedSyncReceiptTest {

    @Test
    void okReceiptHasNullFailedReasonAndOkStatus() {
        Instant at = Instant.parse("2026-08-25T03:30:00Z");
        ThreatFeedSyncReceipt receipt = ThreatFeedSyncReceipt.ok(7L, ThreatFeedSyncReceipt.SOURCE_TAXII, at, 12);

        assertNotNull(receipt.receiptId());
        assertEquals(7L, receipt.feedId());
        assertEquals(ThreatFeedSyncReceipt.SOURCE_TAXII, receipt.sourceType());
        assertEquals(at, receipt.lastSyncAt());
        assertEquals(ThreatFeedSyncReceipt.STATUS_OK, receipt.status());
        assertEquals(12, receipt.iocCount());
        assertNull(receipt.failedReason());
    }

    @Test
    void errorReceiptSanitizesUrlsAndCredentials() {
        Instant at = Instant.parse("2026-08-25T03:31:00Z");
        ThreatFeedSyncReceipt receipt = ThreatFeedSyncReceipt.error(
            3L,
            ThreatFeedSyncReceipt.SOURCE_MISP,
            at,
            "Connection refused to https://misp.example.com/attributes — Authorization: Bearer secret-token-value"
        );

        assertEquals(ThreatFeedSyncReceipt.STATUS_ERROR, receipt.status());
        assertEquals(0, receipt.iocCount());
        assertNotNull(receipt.failedReason());
        assertTrue(receipt.failedReason().contains("[redacted-url]"));
        assertTrue(receipt.failedReason().contains("Bearer [redacted]"));
        assertTrue(!receipt.failedReason().contains("secret-token-value"));
        assertTrue(!receipt.failedReason().contains("https://"));
    }

    @Test
    void sanitizeBlankFallsBackToGenericMessage() {
        assertEquals("Sync failed", ThreatFeedSyncReceipt.sanitizeFailureReason("  "));
        assertEquals("Sync failed", ThreatFeedSyncReceipt.sanitizeFailureReason(null));
    }
}
