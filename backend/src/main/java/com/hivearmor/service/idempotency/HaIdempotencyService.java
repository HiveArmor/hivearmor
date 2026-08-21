package com.hivearmor.service.idempotency;

import com.hivearmor.domain.HaIdempotencyKey;
import com.hivearmor.repository.HaIdempotencyKeyRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

/**
 * Service for managing idempotency keys stored in the {@code ha_idempotency_keys} table.
 *
 * <p>Provides lookup, storage, and scheduled cleanup of idempotency records.
 * Each record captures the full HTTP response (status + body) for configured
 * endpoints so that duplicate requests return the cached response.
 *
 * <p>Sprint 49 — HAR-003: Idempotency-Key extension for bulk operations.
 *
 * @see com.hivearmor.domain.HaIdempotencyKey
 * @see com.hivearmor.web.interceptor.HaIdempotencyInterceptor
 */
@Service
public class HaIdempotencyService {

    private static final Logger log = LoggerFactory.getLogger(HaIdempotencyService.class);
    private static final long TTL_SECONDS = 24 * 60 * 60; // 24 hours

    private final HaIdempotencyKeyRepository repository;

    public HaIdempotencyService(HaIdempotencyKeyRepository repository) {
        this.repository = repository;
    }

    /**
     * Looks up an existing idempotency key record by key and tenant ID.
     *
     * @param key      the client-provided idempotency key
     * @param tenantId the current tenant identifier
     * @return an Optional containing the record if found (may be expired — caller checks)
     */
    public Optional<HaIdempotencyKey> lookup(String key, String tenantId) {
        return repository.findByIdempotencyKeyAndTenantId(key, tenantId);
    }

    /**
     * Stores a new idempotency key record with the response details.
     *
     * @param key            the client-provided idempotency key
     * @param tenantId       the current tenant identifier
     * @param endpoint       the request endpoint (e.g., "/api/ha-alerts/queue/bulk/status")
     * @param requestHash    SHA-256 hash of the request body
     * @param responseStatus the HTTP response status code
     * @param responseBody   the serialized response body
     * @return the persisted entity
     */
    @Transactional
    public HaIdempotencyKey store(String key, String tenantId, String endpoint,
                                  String requestHash, int responseStatus, String responseBody) {
        HaIdempotencyKey record = new HaIdempotencyKey();
        record.setIdempotencyKey(key);
        record.setTenantId(tenantId);
        record.setEndpoint(endpoint);
        record.setRequestHash(requestHash);
        record.setResponseStatus(responseStatus);
        record.setResponseBody(responseBody);
        record.setCreatedAt(Instant.now());
        record.setExpiresAt(Instant.now().plusSeconds(TTL_SECONDS));
        HaIdempotencyKey saved = repository.save(record);
        log.debug("Stored idempotency key record: key={}, tenant={}, endpoint={}", key, tenantId, endpoint);
        return saved;
    }

    /**
     * Deletes all expired idempotency key records (expires_at before now).
     * Called by the scheduled cleanup task.
     */
    @Transactional
    public void cleanupExpired() {
        repository.deleteByExpiresAtBefore(Instant.now());
        log.debug("Cleaned up expired idempotency key records");
    }

    /**
     * Scheduled cleanup task that removes expired idempotency keys.
     * Runs every hour (3600000 ms).
     */
    @Scheduled(fixedRate = 3600000)
    public void scheduledCleanup() {
        cleanupExpired();
    }
}
