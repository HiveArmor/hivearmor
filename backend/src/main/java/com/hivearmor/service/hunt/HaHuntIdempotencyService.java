package com.hivearmor.service.hunt;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.HaIdempotencyRecord;
import com.hivearmor.repository.HaIdempotencyRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Optional;

/**
 * Service for managing idempotency of bulk mutation requests in the hunt/triage workflow.
 *
 * <p>Checks whether an Idempotency-Key has already been processed for the current
 * tenant + user. If so, returns the cached response. Otherwise, allows the caller
 * to proceed and stores the result.
 *
 * <p>Records expire after 24 hours. A scheduled cleanup job removes expired entries.
 *
 * <p>Sprint 36 — Bulk assignment idempotency (S36-T04).
 *
 * <p>Renamed from {@code HaIdempotencyService} to avoid bean name conflict with
 * the Sprint 49 {@link com.hivearmor.service.idempotency.HaIdempotencyService}.
 */
@Service
public class HaHuntIdempotencyService {

    private static final Logger log = LoggerFactory.getLogger(HaHuntIdempotencyService.class);
    private static final long TTL_SECONDS = 24 * 60 * 60; // 24 hours

    private final HaIdempotencyRepository repository;
    private final ObjectMapper objectMapper;

    public HaHuntIdempotencyService(HaIdempotencyRepository repository,
                                ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    /**
     * Checks if a request with the given idempotency key has already been processed.
     *
     * @param idempotencyKey the client-provided key
     * @param tenantPrefix   the current tenant (may be null)
     * @param userId         the authenticated user's ID
     * @return an Optional containing the cached response JSON if already processed
     */
    public Optional<String> findCachedResponse(String idempotencyKey, String tenantPrefix, Long userId) {
        return repository.findByKeyAndTenantAndUser(idempotencyKey, tenantPrefix, userId, Instant.now())
                .map(HaIdempotencyRecord::getResponseJson);
    }

    /**
     * Stores the result of a successful idempotent operation.
     *
     * @param idempotencyKey the client-provided key
     * @param tenantPrefix   the current tenant (may be null)
     * @param userId         the authenticated user's ID
     * @param requestBody    the request body (used to compute a hash for mismatch detection)
     * @param responseJson   the JSON response to cache
     */
    @Transactional
    public void storeResult(String idempotencyKey, String tenantPrefix, Long userId,
                            Object requestBody, String responseJson) {
        HaIdempotencyRecord record = new HaIdempotencyRecord();
        record.setIdempotencyKey(idempotencyKey);
        record.setTenantPrefix(tenantPrefix);
        record.setUserId(userId);
        record.setRequestHash(computeHash(requestBody));
        record.setResponseJson(responseJson);
        record.setCreatedAt(Instant.now());
        record.setExpiresAt(Instant.now().plusSeconds(TTL_SECONDS));
        repository.save(record);
        log.debug("Stored idempotency record: key={}, tenant={}, user={}", idempotencyKey, tenantPrefix, userId);
    }

    /**
     * Computes a SHA-256 hash of the request body for mismatch detection.
     */
    public String computeHash(Object requestBody) {
        try {
            String json = objectMapper.writeValueAsString(requestBody);
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(json.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < Math.min(hash.length, 32); i++) {
                sb.append(String.format("%02x", hash[i]));
            }
            return sb.toString();
        } catch (JsonProcessingException | NoSuchAlgorithmException e) {
            log.warn("Failed to compute request hash: {}", e.getMessage());
            return "unknown";
        }
    }

    /**
     * Scheduled cleanup job that removes expired idempotency records.
     * Runs every hour.
     */
    @Scheduled(fixedDelay = 3600000) // every hour
    @Transactional
    public void cleanupExpired() {
        int deleted = repository.deleteExpired(Instant.now());
        if (deleted > 0) {
            log.info("Cleaned up {} expired idempotency records", deleted);
        }
    }
}
