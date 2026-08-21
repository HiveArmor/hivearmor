package com.hivearmor.service.rulegen;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.rulegen.HaAlertSignal;
import com.hivearmor.repository.rulegen.HaAlertSignalRepository;
import com.hivearmor.service.HaAlertContextService;
import net.jqwik.api.*;
import net.jqwik.api.constraints.IntRange;
import net.jqwik.api.lifecycle.BeforeTry;
import org.mockito.invocation.InvocationOnMock;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Property-based test for signal recording idempotency.
 *
 * <p><strong>Property 1: Idempotent signal recording</strong><br>
 * For any {@code (alertId, signalType)} pair, invoking {@code recordSignal} N times
 * (N &ge; 1) results in exactly one row in {@code ha_alert_signal} — i.e., at most
 * one {@code save()} call on the repository.
 *
 * <p><strong>Validates: Requirements 2.3</strong>
 */
@Label("Feature: sprint-28-ueba-signals, Property 1: Idempotent signal recording")
class HaAlertSignalServiceIdempotencyPropertyTest {

    private static final String VALID_ALERT_JSON =
        "{\"name\":\"Test Alert\",\"dataType\":\"firewall\",\"severity\":3}";

    private HaAlertSignalRepository signalRepo;
    private HaAlertContextService alertContext;
    private ObjectMapper objectMapper;
    private Clock fixedClock;
    private List<HaAlertSignal> store;
    private HaAlertSignalService service;

    /**
     * Re-initialises mocks and in-memory store before every jqwik trial so that
     * state from one trial cannot leak into the next.
     */
    @BeforeTry
    void setUp() {
        signalRepo = mock(HaAlertSignalRepository.class);
        alertContext = mock(HaAlertContextService.class);
        objectMapper = new ObjectMapper();
        fixedClock = Clock.fixed(Instant.parse("2026-07-25T10:00:00Z"), ZoneOffset.UTC);
        store = new ArrayList<>();

        service = new HaAlertSignalService(signalRepo, alertContext, objectMapper, fixedClock);

        // Stub HaAlertContextService to return a minimal valid JSON for any alert.
        when(alertContext.loadAlertAsJson(any())).thenReturn(VALID_ALERT_JSON);
    }

    /**
     * <strong>Property 1: For any (alertId, signalType) pair, invoking recordSignal
     * N times results in exactly one save() call on the repository.</strong>
     *
     * <p>Behavior simulated:
     * <ol>
     *   <li>First call: {@code findByAlertIdAndSignalType} returns {@code Optional.empty()},
     *       so {@code save()} is called once.</li>
     *   <li>After first save: mock {@code findByAlertIdAndSignalType} to return the saved
     *       entity on subsequent calls.</li>
     *   <li>Net result: exactly one {@code save()} invocation regardless of N.</li>
     * </ol>
     *
     * <p><strong>Validates: Requirements 2.3</strong>
     */
    @Property(tries = 100)
    @Label("Property 1: recordSignal N times => exactly one save() call")
    void idempotentSignalRecording(
            @ForAll("alertIds") String alertId,
            @ForAll("signalTypes") HaAlertSignal.SignalType signalType,
            @ForAll @IntRange(min = 1, max = 20) int n) {

        // Mock findByAlertIdAndSignalType: dynamically checks the in-memory store
        when(signalRepo.findByAlertIdAndSignalType(eq(alertId), eq(signalType)))
            .thenAnswer((InvocationOnMock invocation) ->
                store.stream()
                    .filter(s -> alertId.equals(s.getAlertId())
                              && signalType.equals(s.getSignalType()))
                    .findFirst()
            );

        // Mock save: appends to the in-memory store (simulates actual insert)
        when(signalRepo.save(any(HaAlertSignal.class))).thenAnswer((InvocationOnMock invocation) -> {
            HaAlertSignal entity = invocation.getArgument(0);
            entity.setId((long) (store.size() + 1));
            store.add(entity);
            return entity;
        });

        // Act: invoke recordSignal N times with the same (alertId, signalType)
        for (int i = 0; i < n; i++) {
            service.recordSignal(alertId, signalType);
        }

        // Assert: save() was called exactly once regardless of N
        verify(signalRepo, times(1)).save(any(HaAlertSignal.class));

        // Assert: exactly one row exists in the simulated store for this combination
        long matchingRows = store.stream()
            .filter(s -> alertId.equals(s.getAlertId()) && signalType.equals(s.getSignalType()))
            .count();
        assertThat(matchingRows)
            .as("Exactly one row should exist for (alertId=%s, signalType=%s) after %d invocations",
                alertId, signalType, n)
            .isEqualTo(1L);

        // Assert: the persisted row has correct values
        HaAlertSignal persisted = store.get(0);
        assertThat(persisted.getAlertId()).isEqualTo(alertId);
        assertThat(persisted.getSignalType()).isEqualTo(signalType);
    }

    // =========================================================================
    // Arbitrary providers
    // =========================================================================

    /**
     * Generates arbitrary non-empty alert ID strings (1 to 64 chars, alphanumeric + hyphens).
     * Matches the {@code alert_id VARCHAR(64)} column constraint.
     */
    @Provide
    Arbitrary<String> alertIds() {
        return Arbitraries.strings()
            .withCharRange('a', 'z')
            .withCharRange('A', 'Z')
            .withCharRange('0', '9')
            .withChars('-', '_')
            .ofMinLength(1)
            .ofMaxLength(64);
    }

    /**
     * Generates one of the two {@link HaAlertSignal.SignalType} enum values.
     */
    @Provide
    Arbitrary<HaAlertSignal.SignalType> signalTypes() {
        return Arbitraries.of(HaAlertSignal.SignalType.values());
    }
}
