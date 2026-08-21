package com.hivearmor.service.hunt;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.repository.HaIdempotencyRepository;

/**
 * Source-compatible alias for Sprint 36 tests and extensions.
 *
 * <p>Not registered as a Spring bean; runtime injection uses
 * {@link HaHuntIdempotencyService}, whose distinct bean name avoids the platform-wide
 * idempotency service collision.
 */
@Deprecated(forRemoval = false)
public class HaIdempotencyService extends HaHuntIdempotencyService {

    public HaIdempotencyService(HaIdempotencyRepository repository, ObjectMapper objectMapper) {
        super(repository, objectMapper);
    }
}
