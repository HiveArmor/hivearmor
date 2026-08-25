package com.hivearmor.service.dto.threat_intel;

import java.time.Instant;
import java.util.UUID;

/**
 * Thin STAGING CANDIDATE sync receipt for TAXII/MISP manual sync (TI-004).
 *
 * Not a durable job ledger, Kafka consumer receipt, or governed audit event.
 * {@code failedReason} is sanitized (no URLs, tokens, or raw keys).
 */
public record ThreatFeedSyncReceipt(
    String receiptId,
    Long feedId,
    String sourceType,
    Instant lastSyncAt,
    String status,
    int iocCount,
    String failedReason
) {
    public static final String SOURCE_TAXII = "TAXII";
    public static final String SOURCE_MISP = "MISP";
    public static final String STATUS_OK = "OK";
    public static final String STATUS_ERROR = "ERROR";

    public static ThreatFeedSyncReceipt ok(Long feedId, String sourceType, Instant lastSyncAt, int iocCount) {
        return new ThreatFeedSyncReceipt(
            UUID.randomUUID().toString(),
            feedId,
            sourceType,
            lastSyncAt,
            STATUS_OK,
            iocCount,
            null
        );
    }

    public static ThreatFeedSyncReceipt error(
            Long feedId,
            String sourceType,
            Instant lastSyncAt,
            String failedReason
    ) {
        return new ThreatFeedSyncReceipt(
            UUID.randomUUID().toString(),
            feedId,
            sourceType,
            lastSyncAt,
            STATUS_ERROR,
            0,
            sanitizeFailureReason(failedReason)
        );
    }

    /**
     * Redacts URLs and credential-shaped substrings; truncates to 200 chars.
     */
    public static String sanitizeFailureReason(String raw) {
        if (raw == null || raw.isBlank()) {
            return "Sync failed";
        }
        String cleaned = raw
            .replaceAll("(?i)https?://\\S+", "[redacted-url]")
            .replaceAll("(?i)bearer\\s+\\S+", "Bearer [redacted]")
            .replaceAll("(?i)(authorization|api[_-]?key|token)\\s*[:=]\\s*\\S+", "$1=[redacted]");
        if (cleaned.length() > 200) {
            return cleaned.substring(0, 200);
        }
        return cleaned;
    }
}
