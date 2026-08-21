package com.hivearmor.service.rulegen;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.rulegen.HaAlertSignal;
import com.hivearmor.repository.rulegen.HaAlertSignalRepository;
import com.hivearmor.service.HaAlertContextService;
import net.jqwik.api.*;
import net.jqwik.api.constraints.IntRange;
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
 * results in exactly one row in {@code ha_alert_signal}.
 *
 * <p><strong>Validates: Requirements 2.3</strong>
 */
@Label("Feature: sprint-28-ueba-signals, Property 1: Idempotent signal recording")
class HaAlertSignalIdempotencyPropertyTest {

    private static final String VALID_ALERT_JSON =
        "{\"name\":\"Test Alert\",\"dataType\":\"firewall\",\"severity\":3}";

    /**
     * Property 1: For any (alertId, signalType) pair, invoking recordSignal N times
     * (N in [1..10]) results in exactly one persisted row for that combination.
     *
     * <p>The test uses an in-memory list to simulate the repository's storage behavior:
     * <ul>
     *   <li>{@code findByAlertIdAndSignalType} checks the list — returns empty when no row exists,
     *       returns the row once one has been saved.</li>
     *   <li>{@code save} appends to the list (simulating repeated inserts if the check-then-act
     *       logic is broken).</li>
     * </ul>
     *
     * <p>We verify that after N calls, exactly one row exists in the simulated store.
     *
     * <p><strong>Validates: Requirement 2.3</strong>
     */
    @Property(tries = 100)
    @Label("Property 1: recordSignal N times => exactly one row persisted")
    void idempotentSignalRecording(
            @ForAll("alertIds") String alertId,
            @ForAll("signalTypes") HaAlertSignal.SignalType signalType,
            @ForAll @IntRange(min = 1, max = 10) int invocationCount) {

        // -- Arrange: mock collaborators --
        HaAlertSignalRepository signalRepo = mock(HaAlertSignalRepository.class);
        HaAlertContextService alertContext = mock(HaAlertContextService.class);
        ObjectMapper objectMapper = new ObjectMapper();
        Clock clock = Clock.fixed(Instant.parse("2026-07-25T10:00:00Z"), ZoneOffset.UTC);

        // In-memory store simulating the ha_alert_signal table
        List<HaAlertSignal> store = new ArrayList<>();

        // Mock alertContext to return a valid JSON string
        when(alertContext.loadAlertAsJson(eq(alertId))).thenReturn(VALID_ALERT_JSON);

        // Mock findByAlertIdAndSignalType: checks the in-memory store
        when(signalRepo.findByAlertIdAndSignalType(eq(alertId), eq(signalType)))
            .thenAnswer((InvocationOnMock invocation) -> {
                // Search the store for a matching row
                return store.stream()
                    .filter(s -> alertId.equals(s.getAlertId()) && signalType.equals(s.getSignalType()))
                    .findFirst();
            });

        // Mock save: adds to the in-memory store (simulates an actual insert)
        when(signalRepo.save(any(HaAlertSignal.class))).thenAnswer((InvocationOnMock invocation) -> {
            HaAlertSignal entity = invocation.getArgument(0);
            entity.setId((long) (store.size() + 1)); // simulate DB-assigned ID
            store.add(entity);
            return entity;
        });

        HaAlertSignalService service = new HaAlertSignalService(
            signalRepo, alertContext, objectMapper, clock);

        // -- Act: invoke recordSignal N times with the same (alertId, signalType) --
        for (int i = 0; i < invocationCount; i++) {
            service.recordSignal(alertId, signalType);
        }

        // -- Assert: exactly one row persisted in the store --
        long matchingRows = store.stream()
            .filter(s -> alertId.equals(s.getAlertId()) && signalType.equals(s.getSignalType()))
            .count();

        assertThat(matchingRows)
            .as("Exactly one row should exist for (alertId=%s, signalType=%s) " +
                "after %d invocations", alertId, signalType, invocationCount)
            .isEqualTo(1L);

        // Verify the persisted row has the correct (alertId, signalType)
        HaAlertSignal persisted = store.get(0);
        assertThat(persisted.getAlertId()).isEqualTo(alertId);
        assertThat(persisted.getSignalType()).isEqualTo(signalType);
    }

    // =========================================================================
    // Generators
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
