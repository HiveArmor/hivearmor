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
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Property 2: Signal failures never bubble up.
 *
 * <p>For any thrown exception from {@link HaAlertSignalService#recordSignal},
 * {@link UtmAlertResource} still returns a successful HTTP response and
 * the alert status transition still commits.
 *
 * <p><strong>Validates: Requirements 2.5</strong>
 */
@Label("Feature: sprint-28-ueba-signals, Property 2: Signal failures never bubble up")
class UtmAlertResourceSignalIsolationPropertyTest {

    // -------------------------------------------------------------------------
    // Per-try state (re-created before every jqwik trial by @BeforeTry)
    // -------------------------------------------------------------------------

    private UtmAlertService utmAlertService;
    private ApplicationEventService applicationEventService;
    private AlertUtil alertUtil;
    private HaAlertSignalService haAlertSignalService;
    private MockMvc mockMvc;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeTry
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
    // Property 2: Signal failures never bubble up
    // =========================================================================

    /**
     * For any combination of exception type thrown by
     * {@link HaAlertSignalService#recordSignal} and any signal-triggering
     * alert status (TRUE_POSITIVE or FALSE_POSITIVE), the endpoint still
     * returns HTTP 200 and the alert status transition still commits.
     *
     * <p><strong>Validates: Requirements 2.5</strong>
     */
    @Property(tries = 100)
    @Label("Property 2: Signal failures never bubble up")
    void property2_signalFailuresNeverBubbleUp(
            @ForAll("signalTriggeringStatuses") int statusCode,
            @ForAll("signalExceptions") RuntimeException exception) throws Exception {

        // Configure the signal service to throw the generated exception
        doThrow(exception).when(haAlertSignalService)
            .recordSignal(anyString(), any(HaAlertSignal.SignalType.class));

        // Build request body
        UpdateAlertStatusRequestBody body = new UpdateAlertStatusRequestBody();
        body.setAlertIds(List.of("alert-001"));
        body.setStatus(statusCode);
        body.setStatusObservation("test observation");

        // Perform the request
        MvcResult result = mockMvc.perform(
            post("/api/ha-alerts/status")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(body))
        ).andReturn();

        // Assert HTTP 200 — exception never bubbled up
        assertThat(result.getResponse().getStatus())
            .as("Signal failure must not affect HTTP response status")
            .isEqualTo(200);

        // Assert the alert status update was still called (transition committed)
        verify(utmAlertService).updateStatus(
            eq(List.of("alert-001")), eq(statusCode), eq("test observation"));

        // Assert the signal service was indeed invoked (and threw)
        verify(haAlertSignalService).recordSignal(
            eq("alert-001"),
            eq(statusCode == AlertStatus.TRUE_POSITIVE.getCode()
                ? HaAlertSignal.SignalType.TRUE_POSITIVE
                : HaAlertSignal.SignalType.FALSE_POSITIVE));
    }

    /**
     * Verifies isolation with multiple alerts in a single request — if one
     * signal recording fails, subsequent alerts still get their signal
     * recording attempted (per-alert try/catch scoping).
     *
     * <p><strong>Validates: Requirements 2.5</strong>
     */
    @Property(tries = 50)
    @Label("Property 2b: Per-alert isolation — one failure does not skip remaining alerts")
    void property2b_perAlertIsolation(
            @ForAll("signalTriggeringStatuses") int statusCode,
            @ForAll("signalExceptions") RuntimeException exception) throws Exception {

        // First call throws, second call succeeds
        doThrow(exception)
            .doNothing()
            .when(haAlertSignalService)
            .recordSignal(anyString(), any(HaAlertSignal.SignalType.class));

        List<String> alertIds = List.of("alert-A", "alert-B");

        UpdateAlertStatusRequestBody body = new UpdateAlertStatusRequestBody();
        body.setAlertIds(alertIds);
        body.setStatus(statusCode);
        body.setStatusObservation("multi-alert test");

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
        HaAlertSignal.SignalType expectedType = (statusCode == AlertStatus.TRUE_POSITIVE.getCode())
            ? HaAlertSignal.SignalType.TRUE_POSITIVE
            : HaAlertSignal.SignalType.FALSE_POSITIVE;

        verify(haAlertSignalService).recordSignal(eq("alert-A"), eq(expectedType));
        verify(haAlertSignalService).recordSignal(eq("alert-B"), eq(expectedType));
    }

    // =========================================================================
    // Arbitraries
    // =========================================================================

    /**
     * Generates signal-triggering status codes: TRUE_POSITIVE (6) or FALSE_POSITIVE (7).
     */
    @Provide
    Arbitrary<Integer> signalTriggeringStatuses() {
        return Arbitraries.of(
            AlertStatus.TRUE_POSITIVE.getCode(),
            AlertStatus.FALSE_POSITIVE.getCode()
        );
    }

    /**
     * Generates various RuntimeException types with random messages that could
     * be thrown by {@link HaAlertSignalService#recordSignal}.
     *
     * <p>Uses {@code @ForAll}-style random message generation to exercise the
     * catch block with diverse failure modes and payloads.
     */
    @Provide
    Arbitrary<RuntimeException> signalExceptions() {
        Arbitrary<String> messages = Arbitraries.strings()
            .alpha()
            .ofMinLength(1)
            .ofMaxLength(80);

        Arbitrary<Integer> exceptionKind = Arbitraries.integers().between(0, 7);

        return Combinators.combine(messages, exceptionKind).as((msg, kind) -> {
            switch (kind) {
                case 0: return new RuntimeException(msg);
                case 1: return new NullPointerException(msg);
                case 2: return new IllegalStateException(msg);
                case 3: return new IllegalArgumentException(msg);
                case 4: return new UnsupportedOperationException(msg);
                case 5: return new ArrayIndexOutOfBoundsException(msg);
                case 6: return new ClassCastException(msg);
                default: return new java.util.ConcurrentModificationException(msg);
            }
        });
    }
}
