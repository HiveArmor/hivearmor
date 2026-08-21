package com.hivearmor.service.correlation;

import com.hivearmor.domain.FindingIdempotency;
import com.hivearmor.repository.FindingIdempotencyRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

/**
 * Idempotency key management for correlated finding lifecycle mutations (COR-004).
 *
 * <p>Wraps {@link FindingIdempotencyRepository} with check/store/cleanup operations.
 * Records expire after 5 minutes and are cleaned up by a scheduled job every 5 minutes.
 *
 * <p>Sprint 44 — Correlated Findings.
 */
@Service
public class FindingIdempotencyStore {

    private static final Logger log = LoggerFactory.getLogger(FindingIdempotencyStore.class);
    private static final String CLASSNAME = "FindingIdempotencyStore";

    /** Default TTL for idempotency records: 5 minutes. */
    private static final long TTL_SECONDS = 5 * 60;

    private final FindingIdempotencyRepository repository;

    public FindingIdempotencyStore(FindingIdempotencyRepository repository) {
        this.repository = repository;
    }

    /**
     * Checks if an idempotency key already exists and has not expired.
     *
     * @param idempotencyKey the client-provided key
     * @return Optional containing the cached response body if key exists and is valid
     */
    @Transactional(readOnly = true)
    public Optional<String> check(String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            return Optional.empty();
        }

        Optional<FindingIdempotency> existing = repository.findByIdempotencyKey(idempotencyKey);
        if (existing.isPresent()) {
            FindingIdempotency record = existing.get();
            if (record.getExpiresAt().isAfter(Instant.now())) {
                // Not expired — return cached response
                return Optional.of(record.getResponseBody());
            }
            // Expired — remove it
            repository.delete(record);
        }

        return Optional.empty();
    }

    /**
     * Stores a new idempotency record with a 5-minute TTL.
     *
     * @param idempotencyKey the client-provided key
     * @param findingId      the finding identifier
     * @param responseBody   the serialized response to cache
     * @param tenantId       the tenant identifier
     */
    @Transactional
    public void store(String idempotencyKey, String findingId, String responseBody, Long tenantId) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            return;
        }

        FindingIdempotency record = new FindingIdempotency();
        record.setIdempotencyKey(idempotencyKey);
        record.setFindingId(findingId);
        record.setResponseBody(responseBody);
        record.setTenantId(tenantId);
        record.setCreatedAt(Instant.now());
        record.setExpiresAt(Instant.now().plusSeconds(TTL_SECONDS));

        repository.save(record);
    }

    /**
     * Scheduled cleanup: every 5 minutes, delete all expired idempotency records.
     */
    @Scheduled(fixedRate = 300_000) // 5 minutes
    @Transactional
    public void cleanup() {
        int deleted = repository.deleteByExpiresAtBefore(Instant.now());
        if (deleted > 0) {
            log.debug("{}: cleaned up {} expired idempotency records", CLASSNAME, deleted);
        }
    }
}
