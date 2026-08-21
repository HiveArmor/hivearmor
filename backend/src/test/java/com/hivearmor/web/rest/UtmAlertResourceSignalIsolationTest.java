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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Property 2: Signal failures never bubble up.
 *
 * <p>For any thrown exception from {@link HaAlertSignalService#recordSignal},
 * {@link UtmAlertResource} still returns a successful HTTP response and the
 * alert status transition still commits.
 *
 * <p><strong>Validates: Requirements 2.5</strong>
 */
@DisplayName("Property 2: Signal failures never bubble up — UtmAlertResource exception isolation")
class UtmAlertResourceSignalIsolationTest {

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

    // =========================================================================
    // Exception type provider — various exceptions that recordSignal could throw
    // =========================================================================

    static Stream<RuntimeException> signalExceptions() {
        return Stream.of(
            new RuntimeException("database connection lost"),
            new NullPointerException("alertContext returned null"),
            new IllegalStateException("transaction already rolled back"),
            new DataIntegrityViolationException("constraint violation")
        );
    }

    // =========================================================================
    // Property 2: TRUE_POSITIVE status — signal exception does not bubble
    // =========================================================================

    /**
     * Validates: Requirements 2.5
     *
     * When recordSignal throws any exception during a TRUE_POSITIVE transition,
     * the HTTP response is still 200 and the alert status update was committed.
     */
    @ParameterizedTest(name = "TRUE_POSITIVE + {0}")
    @MethodSource("signalExceptions")
    @DisplayName("TRUE_POSITIVE: signal exception does not affect HTTP 200 response")
    void truePositive_signalFailure_stillReturnsHttp200(RuntimeException exception) throws Exception {
        doThrow(exception).when(haAlertSignalService)
            .recordSignal(anyString(), any(HaAlertSignal.SignalType.class));

        UpdateAlertStatusRequestBody body = new UpdateAlertStatusRequestBody();
        body.setAlertIds(List.of("alert-tp-001"));
        body.setStatus(AlertStatus.TRUE_POSITIVE.getCode());
        body.setStatusObservation("analyst confirmed");

        MvcResult result = mockMvc.perform(
            post("/api/ha-alerts/status")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(body))
        ).andReturn();

        // HTTP 200 — exception never propagated to the caller
        assertThat(result.getResponse().getStatus())
            .as("Signal failure must not affect HTTP response for TRUE_POSITIVE")
            .isEqualTo(200);

        // The alert status transition was still committed
        verify(utmAlertService).updateStatus(
            eq(List.of("alert-tp-001")),
            eq(AlertStatus.TRUE_POSITIVE.getCode()),
            eq("analyst confirmed"));

        // The signal service was invoked (confirming the try/catch path was hit)
        verify(haAlertSignalService).recordSignal(
            eq("alert-tp-001"),
            eq(HaAlertSignal.SignalType.TRUE_POSITIVE));
    }

    // =========================================================================
    // Property 2: FALSE_POSITIVE status — signal exception does not bubble
    // =========================================================================

    /**
     * Validates: Requirements 2.5
     *
     * When recordSignal throws any exception during a FALSE_POSITIVE transition,
     * the HTTP response is still 200 and the alert status update was committed.
     */
    @ParameterizedTest(name = "FALSE_POSITIVE + {0}")
    @MethodSource("signalExceptions")
    @DisplayName("FALSE_POSITIVE: signal exception does not affect HTTP 200 response")
    void falsePositive_signalFailure_stillReturnsHttp200(RuntimeException exception) throws Exception {
        doThrow(exception).when(haAlertSignalService)
            .recordSignal(anyString(), any(HaAlertSignal.SignalType.class));

        UpdateAlertStatusRequestBody body = new UpdateAlertStatusRequestBody();
        body.setAlertIds(List.of("alert-fp-002"));
        body.setStatus(AlertStatus.FALSE_POSITIVE.getCode());
        body.setStatusObservation("false alarm");

        MvcResult result = mockMvc.perform(
            post("/api/ha-alerts/status")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(body))
        ).andReturn();

        // HTTP 200 — exception never propagated
        assertThat(result.getResponse().getStatus())
            .as("Signal failure must not affect HTTP response for FALSE_POSITIVE")
            .isEqualTo(200);

        // The alert status transition was committed
        verify(utmAlertService).updateStatus(
            eq(List.of("alert-fp-002")),
            eq(AlertStatus.FALSE_POSITIVE.getCode()),
            eq("false alarm"));

        // The signal service was invoked
        verify(haAlertSignalService).recordSignal(
            eq("alert-fp-002"),
            eq(HaAlertSignal.SignalType.FALSE_POSITIVE));
    }

    // =========================================================================
    // Property 2b: Per-alert isolation — one failure does not skip remaining
    // =========================================================================

    /**
     * Validates: Requirements 2.5
     *
     * When multiple alerts are in the request and the first signal recording
     * fails, subsequent alerts still get their signal recording attempted
     * (per-alert try/catch scoping).
     */
    @ParameterizedTest(name = "Multi-alert isolation + {0}")
    @MethodSource("signalExceptions")
    @DisplayName("Per-alert isolation: one failure does not skip remaining alerts")
    void multiAlert_firstSignalFails_secondStillAttempted(RuntimeException exception) throws Exception {
        // First call throws, second call succeeds
        doThrow(exception)
            .doNothing()
            .when(haAlertSignalService)
            .recordSignal(anyString(), any(HaAlertSignal.SignalType.class));

        List<String> alertIds = List.of("alert-X", "alert-Y");

        UpdateAlertStatusRequestBody body = new UpdateAlertStatusRequestBody();
        body.setAlertIds(alertIds);
        body.setStatus(AlertStatus.TRUE_POSITIVE.getCode());
        body.setStatusObservation("batch triage");

        MvcResult result = mockMvc.perform(
            post("/api/ha-alerts/status")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(body))
        ).andReturn();

        // HTTP 200 despite the first alert's signal failure
        assertThat(result.getResponse().getStatus())
            .as("Signal failure for one alert must not affect HTTP response")
            .isEqualTo(200);

        // Both alerts had recordSignal called — the second was NOT skipped
        verify(haAlertSignalService).recordSignal(
            eq("alert-X"), eq(HaAlertSignal.SignalType.TRUE_POSITIVE));
        verify(haAlertSignalService).recordSignal(
            eq("alert-Y"), eq(HaAlertSignal.SignalType.TRUE_POSITIVE));
    }
}
