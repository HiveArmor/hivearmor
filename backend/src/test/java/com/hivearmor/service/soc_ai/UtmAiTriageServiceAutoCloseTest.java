package com.hivearmor.service.soc_ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.soc_ai.UtmAiTriage;
import com.hivearmor.repository.soc_ai.UtmAiTriageRepository;
import com.hivearmor.service.UtmAlertService;
import com.hivearmor.util.enums.AlertStatus;
import com.hivearmor.util.exceptions.ElasticsearchIndexDocumentUpdateException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Unit tests for SOC-AI high-confidence FP auto-close.
 *
 * <p>STAGING CANDIDATE — verifies ledger + {@link UtmAlertService#updateStatus} wiring.
 * Not PRODUCTION READY.
 */
@ExtendWith(MockitoExtension.class)
class UtmAiTriageServiceAutoCloseTest {

    private static final BigDecimal DEFAULT_THRESHOLD = new BigDecimal("0.85");

    @Mock
    private UtmAiTriageRepository triageRepository;

    @Mock
    private UtmAlertService utmAlertService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private UtmAiTriageService triageService;

    @BeforeEach
    void setUp() {
        triageService = new UtmAiTriageService(
            triageRepository, objectMapper, utmAlertService, DEFAULT_THRESHOLD);
        // Lenient: static threshold tests never call save.
        org.mockito.Mockito.lenient().when(triageRepository.save(any(UtmAiTriage.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void highConfidenceFalsePositiveTriggersAutoClose() {
        assertThat(UtmAiTriageService.isHighConfidenceFalsePositive(
            "possible false positive", new BigDecimal("0.90"), DEFAULT_THRESHOLD)).isTrue();
        assertThat(UtmAiTriageService.isHighConfidenceFalsePositive(
            "possible false positive", new BigDecimal("0.84"), DEFAULT_THRESHOLD)).isFalse();
        assertThat(UtmAiTriageService.isHighConfidenceFalsePositive(
            "possible incident", new BigDecimal("0.99"), DEFAULT_THRESHOLD)).isFalse();
        assertThat(UtmAiTriageService.isHighConfidenceFalsePositive(
            null, new BigDecimal("0.99"), DEFAULT_THRESHOLD)).isFalse();
    }

    @Test
    void configurableThresholdIsHonored() {
        BigDecimal raised = new BigDecimal("0.95");
        assertThat(UtmAiTriageService.isHighConfidenceFalsePositive(
            "fp", new BigDecimal("0.90"), raised)).isFalse();
        assertThat(UtmAiTriageService.isHighConfidenceFalsePositive(
            "fp", new BigDecimal("0.95"), raised)).isTrue();
        assertThat(UtmAiTriageService.isHighConfidenceFalsePositive(
            "benign", new BigDecimal("0.80"), new BigDecimal("0.80"))).isTrue();
    }

    @Test
    void saveResult_highConfidenceFp_mutatesAlertViaUtmAlertService() throws Exception {
        String rawJson = """
            {"classification":"false positive","confidence":0.90,"reasoning":["known scanner"]}
            """;

        UtmAiTriage result = triageService.saveResult("alert-fp-1", rawJson);

        assertThat(result.getStatus()).isEqualTo("AUTO_CLOSED_FP");
        assertThat(result.getConfidenceScore()).isEqualByComparingTo("0.9");

        ArgumentCaptor<String> observationCaptor = ArgumentCaptor.forClass(String.class);
        verify(utmAlertService).updateStatus(
            eq(List.of("alert-fp-1")),
            eq(AlertStatus.FALSE_POSITIVE.getCode()),
            observationCaptor.capture());
        assertThat(observationCaptor.getValue())
            .contains("system actor")
            .contains("0.9");
    }

    @Test
    void saveResult_belowThreshold_doesNotMutateAlert() throws Exception {
        String rawJson = """
            {"classification":"false positive","confidence":0.84,"reasoning":["borderline"]}
            """;

        UtmAiTriage result = triageService.saveResult("alert-fp-low", rawJson);

        assertThat(result.getStatus()).isEqualTo("COMPLETED");
        verify(utmAlertService, never()).updateStatus(anyList(), anyInt(), anyString());
    }

    @Test
    void saveResult_nonFp_doesNotMutateAlert() throws Exception {
        String rawJson = """
            {"classification":"possible incident","confidence":0.99,"reasoning":["lateral movement"]}
            """;

        UtmAiTriage result = triageService.saveResult("alert-tp-1", rawJson);

        assertThat(result.getStatus()).isEqualTo("COMPLETED");
        verifyNoInteractions(utmAlertService);
    }

    @Test
    void saveResult_alertMutationFailure_stillPersistsLedgerAutoClose() throws Exception {
        doThrow(new ElasticsearchIndexDocumentUpdateException("opensearch unavailable"))
            .when(utmAlertService).updateStatus(anyList(), anyInt(), anyString());

        String rawJson = """
            {"classification":"fp","confidence":0.92,"reasoning":["noise"]}
            """;

        UtmAiTriage result = triageService.saveResult("alert-fp-fail", rawJson);

        assertThat(result.getStatus()).isEqualTo("AUTO_CLOSED_FP");
        verify(triageRepository).save(any(UtmAiTriage.class));
        verify(utmAlertService).updateStatus(
            eq(List.of("alert-fp-fail")),
            eq(AlertStatus.FALSE_POSITIVE.getCode()),
            anyString());
    }
}
