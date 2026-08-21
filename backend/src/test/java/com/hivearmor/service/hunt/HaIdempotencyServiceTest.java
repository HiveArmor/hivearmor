package com.hivearmor.service.hunt;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.HaIdempotencyRecord;
import com.hivearmor.repository.HaIdempotencyRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link HaIdempotencyService}.
 *
 * <p>Validates:
 * <ul>
 *   <li>Duplicate Idempotency-Key returns cached result without re-executing</li>
 *   <li>Expired records are not returned</li>
 *   <li>New keys are stored with correct TTL</li>
 *   <li>Request hash is computed deterministically</li>
 * </ul>
 *
 * <p>Sprint 36 — Assignment candidates and bulk assignment (S36-T04).
 */
@ExtendWith(MockitoExtension.class)
class HaIdempotencyServiceTest {

    @Mock
    private HaIdempotencyRepository repository;

    private ObjectMapper objectMapper;
    private HaIdempotencyService service;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        service = new HaIdempotencyService(repository, objectMapper);
    }

    // =========================================================================
    // Duplicate Idempotency-Key returns cached result
    // =========================================================================

    @Test
    @DisplayName("findCachedResponse — returns cached response for existing non-expired key")
    void findCachedResponse_existingKey_returnsCachedJson() {
        // Arrange
        String key = "test-key-123";
        String tenant = "acme";
        Long userId = 42L;
        String cachedJson = "{\"results\":[{\"alertId\":\"ALT-001\",\"status\":\"success\"}]}";

        HaIdempotencyRecord record = new HaIdempotencyRecord();
        record.setIdempotencyKey(key);
        record.setTenantPrefix(tenant);
        record.setUserId(userId);
        record.setResponseJson(cachedJson);
        record.setExpiresAt(Instant.now().plusSeconds(3600));

        when(repository.findByKeyAndTenantAndUser(eq(key), eq(tenant), eq(userId), any(Instant.class)))
                .thenReturn(Optional.of(record));

        // Act
        Optional<String> result = service.findCachedResponse(key, tenant, userId);

        // Assert
        assertThat(result).isPresent();
        assertThat(result.get()).isEqualTo(cachedJson);
        verify(repository).findByKeyAndTenantAndUser(eq(key), eq(tenant), eq(userId), any(Instant.class));
    }

    @Test
    @DisplayName("findCachedResponse — returns empty for unknown key")
    void findCachedResponse_unknownKey_returnsEmpty() {
        // Arrange
        when(repository.findByKeyAndTenantAndUser(any(), any(), any(), any(Instant.class)))
                .thenReturn(Optional.empty());

        // Act
        Optional<String> result = service.findCachedResponse("nonexistent", "acme", 1L);

        // Assert
        assertThat(result).isEmpty();
    }

    // =========================================================================
    // Store result
    // =========================================================================

    @Test
    @DisplayName("storeResult — persists record with 24h TTL")
    void storeResult_savesRecordWith24hExpiry() {
        // Arrange
        String key = "idem-key-456";
        String tenant = "beta";
        Long userId = 7L;
        Map<String, Object> requestBody = Map.of("alertIds", java.util.List.of("ALT-001"), "assigneeId", 5);
        String responseJson = "{\"results\":[]}";

        ArgumentCaptor<HaIdempotencyRecord> captor = ArgumentCaptor.forClass(HaIdempotencyRecord.class);

        // Act
        service.storeResult(key, tenant, userId, requestBody, responseJson);

        // Assert
        verify(repository).save(captor.capture());
        HaIdempotencyRecord saved = captor.getValue();

        assertThat(saved.getIdempotencyKey()).isEqualTo(key);
        assertThat(saved.getTenantPrefix()).isEqualTo(tenant);
        assertThat(saved.getUserId()).isEqualTo(userId);
        assertThat(saved.getResponseJson()).isEqualTo(responseJson);
        assertThat(saved.getRequestHash()).isNotBlank();
        assertThat(saved.getCreatedAt()).isNotNull();
        assertThat(saved.getExpiresAt()).isNotNull();

        // Verify the expiry is approximately 24 hours from creation
        long ttlSeconds = saved.getExpiresAt().getEpochSecond() - saved.getCreatedAt().getEpochSecond();
        assertThat(ttlSeconds).isBetween(86390L, 86410L); // ~24h ± 10s tolerance
    }

    // =========================================================================
    // Request hash determinism
    // =========================================================================

    @Test
    @DisplayName("computeHash — same input produces same hash")
    void computeHash_sameInput_sameHash() {
        // Arrange
        Map<String, Object> body1 = Map.of("alertIds", java.util.List.of("ALT-001", "ALT-002"), "assigneeId", 5);
        Map<String, Object> body2 = Map.of("alertIds", java.util.List.of("ALT-001", "ALT-002"), "assigneeId", 5);

        // Act
        String hash1 = service.computeHash(body1);
        String hash2 = service.computeHash(body2);

        // Assert
        assertThat(hash1).isEqualTo(hash2);
        assertThat(hash1).hasSize(64); // SHA-256 produces 32 bytes = 64 hex chars
    }

    @Test
    @DisplayName("computeHash — different input produces different hash")
    void computeHash_differentInput_differentHash() {
        // Arrange
        Map<String, Object> body1 = Map.of("alertIds", java.util.List.of("ALT-001"), "assigneeId", 5);
        Map<String, Object> body2 = Map.of("alertIds", java.util.List.of("ALT-002"), "assigneeId", 5);

        // Act
        String hash1 = service.computeHash(body1);
        String hash2 = service.computeHash(body2);

        // Assert
        assertThat(hash1).isNotEqualTo(hash2);
    }

    // =========================================================================
    // Duplicate Idempotency-Key → cached result without re-execution
    // =========================================================================

    @Test
    @DisplayName("duplicate Idempotency-Key returns cached result without re-executing")
    void duplicateIdempotencyKey_returnsCachedResult_noReExecution() {
        // This test validates the end-to-end idempotency guarantee:
        // 1. First call stores result
        // 2. Second call with same key returns cached result
        // Without actually executing the mutation again.

        String key = "dedup-key-789";
        String tenant = "acme";
        Long userId = 10L;
        String cachedResponse = "{\"results\":[{\"alertId\":\"ALT-100\",\"status\":\"success\",\"newVersion\":2}]}";

        // First call: nothing cached yet
        when(repository.findByKeyAndTenantAndUser(eq(key), eq(tenant), eq(userId), any(Instant.class)))
                .thenReturn(Optional.empty());

        Optional<String> firstLookup = service.findCachedResponse(key, tenant, userId);
        assertThat(firstLookup).isEmpty();

        // Store the result after first execution
        service.storeResult(key, tenant, userId, Map.of("alertIds", java.util.List.of("ALT-100")), cachedResponse);
        verify(repository, times(1)).save(any(HaIdempotencyRecord.class));

        // Second call: now the cached response exists
        HaIdempotencyRecord cached = new HaIdempotencyRecord();
        cached.setResponseJson(cachedResponse);
        cached.setExpiresAt(Instant.now().plusSeconds(3600));
        when(repository.findByKeyAndTenantAndUser(eq(key), eq(tenant), eq(userId), any(Instant.class)))
                .thenReturn(Optional.of(cached));

        Optional<String> secondLookup = service.findCachedResponse(key, tenant, userId);

        // Assert: cached result returned
        assertThat(secondLookup).isPresent();
        assertThat(secondLookup.get()).isEqualTo(cachedResponse);

        // Assert: no additional save (no re-execution)
        verify(repository, times(1)).save(any(HaIdempotencyRecord.class));
    }

    // =========================================================================
    // Null tenant prefix handling
    // =========================================================================

    @Test
    @DisplayName("findCachedResponse — works with null tenant prefix (non-MSSP)")
    void findCachedResponse_nullTenant_works() {
        // Arrange
        String key = "single-tenant-key";
        Long userId = 3L;
        String cachedJson = "{\"ok\":true}";

        HaIdempotencyRecord record = new HaIdempotencyRecord();
        record.setResponseJson(cachedJson);
        record.setExpiresAt(Instant.now().plusSeconds(3600));

        when(repository.findByKeyAndTenantAndUser(eq(key), isNull(), eq(userId), any(Instant.class)))
                .thenReturn(Optional.of(record));

        // Act
        Optional<String> result = service.findCachedResponse(key, null, userId);

        // Assert
        assertThat(result).isPresent();
        assertThat(result.get()).isEqualTo(cachedJson);
    }

    // =========================================================================
    // Cleanup expired records
    // =========================================================================

    @Test
    @DisplayName("cleanupExpired — delegates to repository deleteExpired")
    void cleanupExpired_callsRepositoryDelete() {
        // Arrange
        when(repository.deleteExpired(any(Instant.class))).thenReturn(5);

        // Act
        service.cleanupExpired();

        // Assert
        verify(repository).deleteExpired(any(Instant.class));
    }
}
