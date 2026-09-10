package com.hivearmor.service.rulegen;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.rulegen.HaAlertSignal;
import com.hivearmor.repository.rulegen.HaAlertSignalRepository;
import com.hivearmor.service.HaAlertContextService;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Property 1: Idempotent signal recording.
 *
 * <p>For any {@code (alertId, signalType)} pair, invoking {@link HaAlertSignalService#recordSignal}
 * N times (N &ge; 1) results in exactly one {@code save()} call on the repository — because
 * after the first insert, {@link HaAlertSignalRepository#findByAlertIdAndSignalType} returns
 * the existing row, and subsequent calls are no-ops.
 *
 * <p><strong>Validates: Requirements 2.3</strong>
 *
 * <p>Tests live in {@code src/main/java/} per the project convention (no {@code src/test/} directory).
 */
@Label("Feature: sprint-28-ueba-signals, Property 1: Idempotent signal recording")
class HaAlertSignalServicePropertyTest {

    private HaAlertSignalRepository mockRepo;
    private HaAlertContextService mockContextService;
    private ObjectMapper objectMapper;
    private Clock fixedClock;
    private HaAlertSignalService service;

    /**
     * Re-initialises mocks before every jqwik trial so that stub state from
     * one trial cannot leak into the next.
     */
    @BeforeTry
    void setUp() {
        mockRepo = mock(HaAlertSignalRepository.class);
        mockContextService = mock(HaAlertContextService.class);
        objectMapper = new ObjectMapper();
        fixedClock = Clock.fixed(Instant.parse("2026-07-25T10:00:00Z"), ZoneId.of("UTC"));
        service = new HaAlertSignalService(mockRepo, mockContextService, objectMapper, fixedClock);

        // Stub HaAlertContextService to return a minimal JSON context for any alert.
        when(mockContextService.loadAlertAsJson(any()))
            .thenReturn("{\"name\":\"Test Alert\",\"dataType\":\"generic\",\"severity\":3}");
    }

    // =========================================================================
    // Property 1: Idempotent signal recording
    // =========================================================================

    /**
     * <strong>Property 1: For any (alertId, signalType) pair, invoking recordSignal
     * N times results in at most one save() call on the repository.</strong>
     *
     * <p>The test simulates the idempotent behavior:
     * <ol>
     *   <li>First call: {@code findByAlertIdAndSignalType} returns {@code Optional.empty()},
     *       so {@code save()} is called and the saved entity is captured.</li>
     *   <li>Subsequent calls: the mock is updated to return the saved entity from
     *       {@code findByAlertIdAndSignalType}, so {@code save()} is NOT called again.</li>
     *   <li>Net result: exactly one {@code save()} invocation regardless of N.</li>
     * </ol>
     *
     * <p><strong>Validates: Requirements 2.3</strong>
     */
    @Property(tries = 100)
    @Label("Property 1: recordSignal N times for same (alertId, signalType) results in exactly one save()")
    void property1_idempotentSignalRecording(
            @ForAll("alertIds") String alertId,
            @ForAll("signalTypes") HaAlertSignal.SignalType signalType,
            @ForAll("repeatCounts") int n) {

        // Build a saved entity that will be returned after the first call.
        // We mock the entity since Lombok generates the setters/getters at compile-time
        // through the Maven annotation processor, and we only need the object as a
        // return value from the repository find method.
        HaAlertSignal savedEntity = mock(HaAlertSignal.class);

        // First call: findByAlertIdAndSignalType returns empty → save() is invoked
        when(mockRepo.findByAlertIdAndSignalType(eq(alertId), eq(signalType)))
            .thenReturn(Optional.empty());
        when(mockRepo.save(any(HaAlertSignal.class)))
            .thenReturn(savedEntity);

        // Execute the first call
        service.recordSignal(alertId, signalType);

        // After first call: mock now returns the existing entity for subsequent calls
        when(mockRepo.findByAlertIdAndSignalType(eq(alertId), eq(signalType)))
            .thenReturn(Optional.of(savedEntity));

        // Execute subsequent calls (n - 1 more times)
        for (int i = 1; i < n; i++) {
            service.recordSignal(alertId, signalType);
        }

        // Assert: save() was called exactly once regardless of N
        verify(mockRepo, times(1)).save(any(HaAlertSignal.class));
    }

    // =========================================================================
    // Arbitrary providers
    // =========================================================================

    /**
     * Generates random alert IDs as non-empty alphanumeric strings (1–64 chars),
     * matching the column constraint on {@code ha_alert_signal.alert_id}.
     */
    @Provide
    Arbitrary<String> alertIds() {
        return Arbitraries.strings()
            .withCharRange('a', 'z')
            .withCharRange('A', 'Z')
            .withCharRange('0', '9')
            .ofMinLength(1)
            .ofMaxLength(64);
    }

    /**
     * Generates both signal types uniformly.
     */
    @Provide
    Arbitrary<HaAlertSignal.SignalType> signalTypes() {
        return Arbitraries.of(HaAlertSignal.SignalType.TRUE_POSITIVE,
                              HaAlertSignal.SignalType.FALSE_POSITIVE);
    }

    /**
     * Generates the number of times to invoke {@code recordSignal} — always at least 1
     * and up to 20, covering both the single-call case and repeated-call scenarios.
     */
    @Provide
    Arbitrary<Integer> repeatCounts() {
        return Arbitraries.integers().between(1, 20);
    }
}
