package com.hivearmor.web.rest;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.rulegen.HaAlertSignal;
import com.hivearmor.service.UtmAlertService;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.incident.UtmIncidentService;
import com.hivearmor.service.dto.alert.UpdateAlertStatusRequestBody;
import com.hivearmor.service.rulegen.HaAlertSignalService;
import com.hivearmor.util.AlertUtil;
import com.hivearmor.util.enums.AlertStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Verification Check 1: Three TRUE_POSITIVE transitions produce three signal rows.
 *
 * <p>This integration-style test posts three alert status transitions to
 * {@link UtmAlertResource} with target status {@code TRUE_POSITIVE} for three
 * distinct alert IDs and verifies that {@link HaAlertSignalService#recordSignal}
 * is invoked exactly three times — once per distinct alert — with signal type
 * {@code TRUE_POSITIVE}.
 *
 * <p>The test simulates the database assertion
 * {@code SELECT COUNT(*) FROM ha_alert_signal WHERE signal_type = 'TRUE_POSITIVE'}
 * by capturing all invocations to {@code recordSignal} and asserting exactly three
 * calls with three distinct alert IDs.
 *
 * <p><strong>Validates: Requirement 7.1</strong>
 */
@DisplayName("Verification Check 1: three TRUE_POSITIVE transitions produce three signal rows")
class VerificationCheck1Test {

    private UtmAlertService utmAlertService;
    private ApplicationEventService applicationEventService;
    private AlertUtil alertUtil;
    private HaAlertSignalService haAlertSignalService;
    private MockMvc mockMvc;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        utmAlertService = mock(UtmAlertService.class);
        applicationEventService = mock(ApplicationEventService.class);
        alertUtil = mock(AlertUtil.class);
        haAlertSignalService = mock(HaAlertSignalService.class);

        UtmAlertResource controller = new UtmAlertResource(
            utmAlertService,
            mock(UtmIncidentService.class),
            applicationEventService,
            alertUtil,
            haAlertSignalService
        );

        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    /**
     * Posts three separate alert status transitions (each with one distinct alert ID)
     * to the TRUE_POSITIVE status and verifies that recordSignal is called exactly
     * three times with three distinct alert IDs and TRUE_POSITIVE signal type.
     *
     * <p>Validates: Requirement 7.1
     */
    @Test
    @DisplayName("Three individual TRUE_POSITIVE transitions produce three recordSignal calls with distinct alert IDs")
    void threeDistinctAlerts_truePositive_producesThreeSignalRows() throws Exception {
        // Three distinct alert IDs
        String alertId1 = "alert-check1-001";
        String alertId2 = "alert-check1-002";
        String alertId3 = "alert-check1-003";

        // Post three separate status transitions, each with one alert ID
        for (String alertId : List.of(alertId1, alertId2, alertId3)) {
            UpdateAlertStatusRequestBody body = new UpdateAlertStatusRequestBody();
            body.setAlertIds(List.of(alertId));
            body.setStatus(AlertStatus.TRUE_POSITIVE.getCode());
            body.setStatusObservation("analyst confirmed true positive");

            mockMvc.perform(
                post("/api/ha-alerts/status")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(mapper.writeValueAsString(body))
            ).andExpect(status().isOk());
        }

        // Capture all invocations to recordSignal
        ArgumentCaptor<String> alertIdCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<HaAlertSignal.SignalType> signalTypeCaptor =
            ArgumentCaptor.forClass(HaAlertSignal.SignalType.class);

        verify(haAlertSignalService, times(3))
            .recordSignal(alertIdCaptor.capture(), signalTypeCaptor.capture());

        // Assert exactly three signal recordings
        List<String> capturedAlertIds = alertIdCaptor.getAllValues();
        List<HaAlertSignal.SignalType> capturedTypes = signalTypeCaptor.getAllValues();

        assertThat(capturedAlertIds)
            .as("Exactly three signal rows should be recorded")
            .hasSize(3);

        assertThat(capturedAlertIds)
            .as("All three alert IDs should be distinct")
            .containsExactlyInAnyOrder(alertId1, alertId2, alertId3);

        assertThat(capturedTypes)
            .as("All three signals should be TRUE_POSITIVE")
            .containsOnly(HaAlertSignal.SignalType.TRUE_POSITIVE);
    }

    /**
     * Posts a single request containing three alert IDs in one batch transition
     * to TRUE_POSITIVE and verifies that recordSignal is called three times —
     * once for each alert ID in the batch.
     *
     * <p>Validates: Requirement 7.1
     */
    @Test
    @DisplayName("Batch TRUE_POSITIVE transition with three alert IDs produces three recordSignal calls")
    void batchThreeAlerts_truePositive_producesThreeSignalRows() throws Exception {
        // Three distinct alert IDs in a single batch request
        List<String> alertIds = List.of("alert-batch-001", "alert-batch-002", "alert-batch-003");

        UpdateAlertStatusRequestBody body = new UpdateAlertStatusRequestBody();
        body.setAlertIds(alertIds);
        body.setStatus(AlertStatus.TRUE_POSITIVE.getCode());
        body.setStatusObservation("batch triage confirmation");

        mockMvc.perform(
            post("/api/ha-alerts/status")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(body))
        ).andExpect(status().isOk());

        // Capture all invocations to recordSignal
        ArgumentCaptor<String> alertIdCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<HaAlertSignal.SignalType> signalTypeCaptor =
            ArgumentCaptor.forClass(HaAlertSignal.SignalType.class);

        verify(haAlertSignalService, times(3))
            .recordSignal(alertIdCaptor.capture(), signalTypeCaptor.capture());

        // Assert: SELECT COUNT(*) FROM ha_alert_signal WHERE signal_type = 'TRUE_POSITIVE'
        // simulated by verifying 3 calls with distinct IDs and TRUE_POSITIVE type
        List<String> capturedAlertIds = alertIdCaptor.getAllValues();
        List<HaAlertSignal.SignalType> capturedTypes = signalTypeCaptor.getAllValues();

        assertThat(capturedAlertIds)
            .as("Exactly three signal rows should be recorded (one per alert in the batch)")
            .hasSize(3)
            .containsExactlyInAnyOrder("alert-batch-001", "alert-batch-002", "alert-batch-003");

        assertThat(capturedTypes)
            .as("All three signals should have type TRUE_POSITIVE")
            .containsOnly(HaAlertSignal.SignalType.TRUE_POSITIVE);
    }

    /**
     * Verifies that non-TRUE_POSITIVE transitions do NOT produce signal rows,
     * confirming that only the TRUE_POSITIVE path triggers recording.
     *
     * <p>Validates: Requirement 7.1 (negative case — ensures signal rows only
     * appear for TRUE_POSITIVE transitions)
     */
    @Test
    @DisplayName("Non-TRUE_POSITIVE transition does not produce signal rows")
    void openStatus_doesNotProduceSignalRows() throws Exception {
        UpdateAlertStatusRequestBody body = new UpdateAlertStatusRequestBody();
        body.setAlertIds(List.of("alert-open-001", "alert-open-002", "alert-open-003"));
        body.setStatus(AlertStatus.OPEN.getCode());
        body.setStatusObservation("reopening alerts");

        mockMvc.perform(
            post("/api/ha-alerts/status")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(body))
        ).andExpect(status().isOk());

        // recordSignal should never be called for OPEN status
        verifyNoInteractions(haAlertSignalService);
    }
}
