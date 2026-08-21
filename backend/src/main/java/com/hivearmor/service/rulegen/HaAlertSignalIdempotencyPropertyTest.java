package com.hivearmor.service.rulegen;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.rulegen.HaAlertSignal;
import com.hivearmor.repository.rulegen.HaAlertSignalRepository;
import com.hivearmor.service.HaAlertContextService;
import net.jqwik.api.*;
import net.jqwik.api.constraints.IntRange;
import net.jqwik.api.constraints.StringLength;
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
     * (N >= 1) results in exactly one persisted row for that combination.
     *
     * <p>The test simulates the repository's behavior: the first call to
     * {@code findByAlertIdAndSignalType} returns empty (no existing row), so the
     * service persists a new row. On subsequent calls, the repository returns the
     * previously saved entity, so the service short-circuits with a no-op.
     *
     * <p>We verify that {@code save} is called exactly once regardless of how many
     * times {@code recordSignal} is invoked with the same inputs.
     */
    @Property(tries = 100)
    @Label("Property 1: recordSignal N times => exactly one row persisted")
    void idempotentSignalRecording(
            @ForAll("alertIds") String alertId,
            @ForAll("signalTypes") HaAlertSignal.SignalType signalType,
            @ForAll @IntRange(min = 1, max = 20) int invocationCount) {

        // -- Arrange: mock collaborators --
        HaAlertSignalRepository signalRepo = mock(HaAlertSignalRepository.class);
        HaAlertContextService alertContext = mock(HaAlertContextService.class);
        ObjectMapper objectMapper = new ObjectMapper();
        Clock clock = Clock.fixed(Instant.parse("2026-07-25T10:00:00Z"), ZoneOffset.UTC);

        // Track saved entities to simulate repository state
        List<HaAlertSignal> savedEntities = new ArrayList<>();

        // Mock alertContext to return a valid JSON string
        when(alertContext.loadAlertAsJson(eq(alertId))).thenReturn(VALID_ALERT_JSON);

        // Mock findByAlertIdAndSignalType: returns empty on first call,
        // returns the saved entity on all subsequent calls
        when(signalRepo.findByAlertIdAndSignalType(eq(alertId), eq(signalType)))
            .thenAnswer((InvocationOnMock invocation) -> {
                if (savedEntities.isEmpty()) {
                    return Optional.empty();
                }
                return Optional.of(savedEntities.get(0));
            });

        // Mock save: captures the entity to simulate it being persisted
        when(signalRepo.save(any(HaAlertSignal.class))).thenAnswer((InvocationOnMock invocation) -> {
            HaAlertSignal entity = invocation.getArgument(0);
            entity.setId(1L); // simulate DB-assigned ID
            savedEntities.add(entity);
            return entity;
        });

        HaAlertSignalService service = new HaAlertSignalService(
            signalRepo, alertContext, objectMapper, clock);

        // -- Act: invoke recordSignal N times with the same (alertId, signalType) --
        for (int i = 0; i < invocationCount; i++) {
            service.recordSignal(alertId, signalType);
        }

        // -- Assert: exactly one row persisted --
        assertThat(savedEntities)
            .as("Exactly one row should be persisted for (alertId=%s, signalType=%s) " +
                "after %d invocations", alertId, signalType, invocationCount)
            .hasSize(1);

        // Verify save was called exactly once
        verify(signalRepo, times(1)).save(any(HaAlertSignal.class));

        // Verify the persisted row has the correct (alertId, signalType)
        HaAlertSignal persisted = savedEntities.get(0);
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
