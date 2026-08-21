package com.hivearmor.service.rulegen;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.rulegen.HaAlertSignal;
import com.hivearmor.repository.rulegen.HaAlertSignalRepository;
import com.hivearmor.service.HaAlertContextService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link HaAlertSignalService}.
 *
 * <p>Covers:
 * <ul>
 *   <li>New-row insertion with metadata resolution</li>
 *   <li>Duplicate suppression (idempotent no-op)</li>
 *   <li>Metadata resolution via mocked {@link HaAlertContextService}</li>
 *   <li>Race condition handling (DataIntegrityViolationException treated as no-op)</li>
 *   <li>Null alertId/signalType validation</li>
 * </ul>
 *
 * <p>Requirements: 2.1, 2.2, 2.3
 */
@ExtendWith(MockitoExtension.class)
class HaAlertSignalServiceTest {

    private static final Instant FIXED_NOW = Instant.parse("2026-07-25T10:00:00Z");
    private static final String ALERT_ID = "alert-001";
    private static final HaAlertSignal.SignalType SIGNAL_TYPE = HaAlertSignal.SignalType.TRUE_POSITIVE;

    @Mock
    private HaAlertSignalRepository signalRepo;

    @Mock
    private HaAlertContextService alertContext;

    @Mock
    private ObjectMapper objectMapper;

    private final Clock clock = Clock.fixed(FIXED_NOW, ZoneOffset.UTC);

    private HaAlertSignalService service;

    @BeforeEach
    void setUp() {
        // Use the real ObjectMapper for JSON parsing in most tests
        service = new HaAlertSignalService(signalRepo, alertContext, new ObjectMapper(), clock);
    }

    // ---- Test 1: New row insertion ----

    @Test
    void recordSignal_newSignal_savesRowWithMetadata() {
        // Given: no existing signal, and alert context returns valid JSON
        when(signalRepo.findByAlertIdAndSignalType(ALERT_ID, SIGNAL_TYPE))
            .thenReturn(Optional.empty());
        when(alertContext.loadAlertAsJson(ALERT_ID))
            .thenReturn("{\"name\":\"Brute Force SSH\",\"dataType\":\"linux\",\"severity\":3}");

        // When
        service.recordSignal(ALERT_ID, SIGNAL_TYPE);

        // Then: a new row is saved with extracted metadata
        ArgumentCaptor<HaAlertSignal> captor = ArgumentCaptor.forClass(HaAlertSignal.class);
        verify(signalRepo).save(captor.capture());

        HaAlertSignal saved = captor.getValue();
        assertThat(saved.getAlertId()).isEqualTo(ALERT_ID);
        assertThat(saved.getSignalType()).isEqualTo(SIGNAL_TYPE);
        assertThat(saved.getAlertName()).isEqualTo("Brute Force SSH");
        assertThat(saved.getDataType()).isEqualTo("linux");
        assertThat(saved.getSeverity()).isEqualTo(3);
        assertThat(saved.getRecordedAt()).isEqualTo(FIXED_NOW);
    }

    // ---- Test 2: Duplicate suppression ----

    @Test
    void recordSignal_duplicateSignal_returnsEarlyWithoutSaving() {
        // Given: a signal already exists for this (alertId, signalType)
        HaAlertSignal existing = new HaAlertSignal();
        existing.setId(42L);
        existing.setAlertId(ALERT_ID);
        existing.setSignalType(SIGNAL_TYPE);
        when(signalRepo.findByAlertIdAndSignalType(ALERT_ID, SIGNAL_TYPE))
            .thenReturn(Optional.of(existing));

        // When
        service.recordSignal(ALERT_ID, SIGNAL_TYPE);

        // Then: no save is invoked, no context service call
        verify(signalRepo, never()).save(any());
        verify(alertContext, never()).loadAlertAsJson(any());
    }

    // ---- Test 3: Metadata resolution ----

    @Test
    void recordSignal_callsAlertContextServiceForMetadata() {
        // Given: no existing signal
        when(signalRepo.findByAlertIdAndSignalType(ALERT_ID, SIGNAL_TYPE))
            .thenReturn(Optional.empty());
        when(alertContext.loadAlertAsJson(ALERT_ID))
            .thenReturn("{\"name\":\"Lateral Movement\",\"dataType\":\"windows\",\"severity\":4}");

        // When
        service.recordSignal(ALERT_ID, SIGNAL_TYPE);

        // Then: loadAlertAsJson was called with the correct alertId
        verify(alertContext).loadAlertAsJson(ALERT_ID);

        // And metadata fields are extracted correctly
        ArgumentCaptor<HaAlertSignal> captor = ArgumentCaptor.forClass(HaAlertSignal.class);
        verify(signalRepo).save(captor.capture());
        HaAlertSignal saved = captor.getValue();
        assertThat(saved.getAlertName()).isEqualTo("Lateral Movement");
        assertThat(saved.getDataType()).isEqualTo("windows");
        assertThat(saved.getSeverity()).isEqualTo(4);
    }

    @Test
    void recordSignal_nullAlertJson_savesWithNullMetadata() {
        // Given: alert context returns null (alert not found)
        when(signalRepo.findByAlertIdAndSignalType(ALERT_ID, SIGNAL_TYPE))
            .thenReturn(Optional.empty());
        when(alertContext.loadAlertAsJson(ALERT_ID)).thenReturn(null);

        // When
        service.recordSignal(ALERT_ID, SIGNAL_TYPE);

        // Then: row is still saved, but metadata fields are null
        ArgumentCaptor<HaAlertSignal> captor = ArgumentCaptor.forClass(HaAlertSignal.class);
        verify(signalRepo).save(captor.capture());
        HaAlertSignal saved = captor.getValue();
        assertThat(saved.getAlertName()).isNull();
        assertThat(saved.getDataType()).isNull();
        assertThat(saved.getSeverity()).isNull();
    }

    @Test
    void recordSignal_malformedAlertJson_savesWithNullMetadata() {
        // Given: alert context returns invalid JSON
        when(signalRepo.findByAlertIdAndSignalType(ALERT_ID, SIGNAL_TYPE))
            .thenReturn(Optional.empty());
        when(alertContext.loadAlertAsJson(ALERT_ID)).thenReturn("not-json{{{");

        // When
        service.recordSignal(ALERT_ID, SIGNAL_TYPE);

        // Then: row is still saved with null metadata (exception is caught internally)
        ArgumentCaptor<HaAlertSignal> captor = ArgumentCaptor.forClass(HaAlertSignal.class);
        verify(signalRepo).save(captor.capture());
        HaAlertSignal saved = captor.getValue();
        assertThat(saved.getAlertName()).isNull();
        assertThat(saved.getDataType()).isNull();
        assertThat(saved.getSeverity()).isNull();
    }

    // ---- Test 4: Race condition handling ----

    @Test
    void recordSignal_dataIntegrityViolation_treatedAsNoOp() {
        // Given: no existing signal found, but save throws DataIntegrityViolationException
        // (another thread inserted first)
        when(signalRepo.findByAlertIdAndSignalType(ALERT_ID, SIGNAL_TYPE))
            .thenReturn(Optional.empty());
        when(alertContext.loadAlertAsJson(ALERT_ID))
            .thenReturn("{\"name\":\"Test Alert\",\"dataType\":\"generic\",\"severity\":2}");
        when(signalRepo.save(any(HaAlertSignal.class)))
            .thenThrow(new DataIntegrityViolationException("unique constraint violation"));

        // When / Then: no exception propagates
        service.recordSignal(ALERT_ID, SIGNAL_TYPE);

        // The method completes normally — race condition handled gracefully
        verify(signalRepo).save(any(HaAlertSignal.class));
    }

    // ---- Test 5: Null alertId/signalType ----

    @Test
    void recordSignal_nullAlertId_throwsNullPointerException() {
        assertThatThrownBy(() -> service.recordSignal(null, SIGNAL_TYPE))
            .isInstanceOf(NullPointerException.class)
            .hasMessageContaining("alertId");
    }

    @Test
    void recordSignal_nullSignalType_throwsNullPointerException() {
        assertThatThrownBy(() -> service.recordSignal(ALERT_ID, null))
            .isInstanceOf(NullPointerException.class)
            .hasMessageContaining("signalType");
    }
}
