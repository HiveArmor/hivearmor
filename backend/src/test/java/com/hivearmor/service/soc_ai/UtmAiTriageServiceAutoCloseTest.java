package com.hivearmor.service.soc_ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.config.Constants;
import com.hivearmor.domain.shared_types.alert.Side;
import com.hivearmor.domain.shared_types.alert.UtmAlert;
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
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
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
 * Unit tests for SOC-AI high-confidence FP auto-close and agentic FSM depth.
 *
 * <p>STAGING CANDIDATE — verifies ledger + OpenSearch status/tag wiring,
 * configurable confidence threshold, thin ENRICH metadata, and thin INVESTIGATE metadata.
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
        when(utmAlertService.getAlertsByIds(anyList())).thenReturn(List.of());

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

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<String>> tagsCaptor = ArgumentCaptor.forClass(List.class);
        verify(utmAlertService).updateTags(
            eq(List.of("alert-fp-1")), tagsCaptor.capture(), eq(false));
        assertThat(tagsCaptor.getValue()).contains(Constants.FALSE_POSITIVE_TAG);
    }

    @Test
    void saveResult_highConfidenceFp_preservesExistingTagsWhenAppendingFp() throws Exception {
        UtmAlert existing = new UtmAlert();
        existing.setId("alert-fp-tags");
        existing.setTags(List.of("noise", "scanner"));
        when(utmAlertService.getAlertsByIds(eq(List.of("alert-fp-tags"))))
            .thenReturn(List.of(existing));

        String rawJson = """
            {"classification":"fp","confidence":0.91,"reasoning":["noise"]}
            """;

        triageService.saveResult("alert-fp-tags", rawJson);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<String>> tagsCaptor = ArgumentCaptor.forClass(List.class);
        verify(utmAlertService).updateTags(
            eq(List.of("alert-fp-tags")), tagsCaptor.capture(), eq(false));
        assertThat(tagsCaptor.getValue())
            .containsExactly("noise", "scanner", Constants.FALSE_POSITIVE_TAG);
    }

    @Test
    void saveResult_highConfidenceFp_fsmEarlyExitsToEnd() {
        String rawJson = """
            {"classification":"false positive","confidence":0.90,"reasoning":["known scanner"]}
            """;

        UtmAiTriage result = triageService.saveResult("alert-fp-fsm", rawJson);

        assertThat(result.getStatus()).isEqualTo("AUTO_CLOSED_FP");
        assertThat(UtmAiTriageService.extractFsmPath(result.getNextSteps()))
            .containsExactly("AUTO_TRIAGE", "END");
        assertThat(result.getNextSteps())
            .doesNotContain("ENRICH")
            .doesNotContain("INVESTIGATE");
        assertThat(UtmAiTriageService.extractEnrichment(result.getNextSteps())).isEmpty();
        assertThat(UtmAiTriageService.extractInvestigate(result.getNextSteps())).isEmpty();
    }

    @Test
    void saveResult_belowThreshold_doesNotMutateAlert() throws Exception {
        String rawJson = """
            {"classification":"false positive","confidence":0.84,"reasoning":["borderline"]}
            """;

        UtmAiTriage result = triageService.saveResult("alert-fp-low", rawJson);

        assertThat(result.getStatus()).isEqualTo("COMPLETED");
        verify(utmAlertService, never()).updateStatus(anyList(), anyInt(), anyString());
        verify(utmAlertService, never()).updateTags(anyList(), anyList(), anyBoolean());
    }

    @Test
    void saveResult_nonFp_doesNotMutateAlert() throws Exception {
        String rawJson = """
            {"classification":"possible incident","confidence":0.99,"reasoning":["lateral movement"]}
            """;

        UtmAiTriage result = triageService.saveResult("alert-tp-1", rawJson);

        assertThat(result.getStatus()).isEqualTo("COMPLETED");
        verify(utmAlertService, never()).updateStatus(anyList(), anyInt(), anyString());
        verify(utmAlertService, never()).updateTags(anyList(), anyList(), anyBoolean());
    }

    @Test
    void saveResult_nonFp_fsmVisitsEnrichThenInvestigateThenEnd() throws Exception {
        String rawJson = """
            {"classification":"possible incident","confidence":0.99,"reasoning":["lateral movement"],
             "nextSteps":[{"action":"escalate","details":"page on-call"}]}
            """;

        UtmAiTriage result = triageService.saveResult("alert-tp-fsm", rawJson);

        assertThat(result.getStatus()).isEqualTo("COMPLETED");
        assertThat(UtmAiTriageService.extractFsmPath(result.getNextSteps()))
            .containsExactly("AUTO_TRIAGE", "ENRICH", "INVESTIGATE", "END");
        assertThat(result.getNextSteps())
            .contains("enrich stub")
            .contains("investigate stub")
            .contains("session linking deferred")
            .contains("escalate")
            .doesNotContain("Neo4j / entity enrichment deferred");
        assertThat(UtmAiTriageService.extractInvestigate(result.getNextSteps())).isPresent();
        verify(utmAlertService, never()).updateStatus(anyList(), anyInt(), anyString());
    }

    @Test
    void saveResult_enrichRecordsStructuredMetadataFromAlertPayload() {
        String rawJson = """
            {"classification":"possible incident","confidence":0.88,
             "alertPayload":{"source":{"ip":"10.0.0.1"},"host":{"name":"wkstn-01"},"sha256":"abc"},
             "iocs":[{"field":"threat.indicator.ip"},"cve"]}
            """;

        UtmAiTriage result = triageService.saveResult("alert-enrich-1", rawJson);

        Optional<Map<String, Object>> enrichment =
            UtmAiTriageService.extractEnrichment(result.getNextSteps());
        assertThat(enrichment).isPresent();
        Map<String, Object> meta = enrichment.orElseThrow();
        assertThat(meta.get("stub")).isEqualTo(true);
        assertThat(meta.get("relatedEntityCount")).isEqualTo(0);
        assertThat(meta.get("note").toString()).contains("no Neo4j");
        @SuppressWarnings("unchecked")
        List<String> iocKeys = (List<String>) meta.get("iocKeys");
        assertThat(iocKeys)
            .contains("source.ip", "host.name", "sha256", "threat.indicator.ip", "cve");
    }

    @Test
    void saveResult_enrichUsesOpenSearchAlertSidesWhenAvailable() throws Exception {
        UtmAlert alert = new UtmAlert();
        alert.setId("alert-enrich-os");
        Side adversary = new Side();
        adversary.setIp("198.51.100.10");
        adversary.setSha256("deadbeef");
        alert.setAdversary(adversary);
        when(utmAlertService.getAlertsByIds(eq(List.of("alert-enrich-os"))))
            .thenReturn(List.of(alert));

        String rawJson = """
            {"classification":"possible incident","confidence":0.87,"reasoning":["beacon"]}
            """;

        UtmAiTriage result = triageService.saveResult("alert-enrich-os", rawJson);

        Optional<Map<String, Object>> enrichment =
            UtmAiTriageService.extractEnrichment(result.getNextSteps());
        assertThat(enrichment).isPresent();
        @SuppressWarnings("unchecked")
        List<String> iocKeys = (List<String>) enrichment.orElseThrow().get("iocKeys");
        assertThat(iocKeys).contains("adversary.ip", "adversary.sha256");
    }

    @Test
    void saveResult_belowThresholdFp_stillRunsFullFsmPath() {
        String rawJson = """
            {"classification":"false positive","confidence":0.84,"reasoning":["borderline"]}
            """;

        UtmAiTriage result = triageService.saveResult("alert-fp-low-fsm", rawJson);

        assertThat(result.getStatus()).isEqualTo("COMPLETED");
        assertThat(UtmAiTriageService.extractFsmPath(result.getNextSteps()))
            .containsExactly("AUTO_TRIAGE", "ENRICH", "INVESTIGATE", "END");
        assertThat(UtmAiTriageService.extractEnrichment(result.getNextSteps())).isPresent();
        assertThat(UtmAiTriageService.extractInvestigate(result.getNextSteps())).isPresent();
    }

    @Test
    void saveResult_investigateRecordsStructuredMetadataWhenOsMisses() {
        // Default mock: getAlertsByIds not stubbed → soft load returns null → relatedAlertCount=0
        String rawJson = """
            {"classification":"possible incident","confidence":0.88,"reasoning":["beacon"]}
            """;

        UtmAiTriage result = triageService.saveResult("alert-inv-0", rawJson);

        Optional<Map<String, Object>> investigate =
            UtmAiTriageService.extractInvestigate(result.getNextSteps());
        assertThat(investigate).isPresent();
        Map<String, Object> meta = investigate.orElseThrow();
        assertThat(meta.get("stub")).isEqualTo(true);
        assertThat(meta.get("relatedAlertCount")).isEqualTo(0);
        assertThat(meta.get("openHypotheses")).isEqualTo(List.of());
        assertThat(meta.get("note").toString())
            .contains("investigation session linking deferred")
            .contains("no Neo4j");
        assertThat(result.getNextSteps()).contains("investigate stub");
    }

    @Test
    void saveResult_investigateUsesSoftOpenSearchCountWhenAlertResolvable() throws Exception {
        UtmAlert alert = new UtmAlert();
        alert.setId("alert-inv-os");
        when(utmAlertService.getAlertsByIds(eq(List.of("alert-inv-os"))))
            .thenReturn(List.of(alert));

        String rawJson = """
            {"classification":"possible incident","confidence":0.87,"reasoning":["lateral"]}
            """;

        UtmAiTriage result = triageService.saveResult("alert-inv-os", rawJson);

        Optional<Map<String, Object>> investigate =
            UtmAiTriageService.extractInvestigate(result.getNextSteps());
        assertThat(investigate).isPresent();
        assertThat(investigate.orElseThrow().get("relatedAlertCount")).isEqualTo(1);
        assertThat(investigate.orElseThrow().get("openHypotheses")).isEqualTo(List.of());
        // Soft OS load is shared with ENRICH — one getAlertsByIds call
        verify(utmAlertService).getAlertsByIds(eq(List.of("alert-inv-os")));
    }

    @Test
    void saveResult_highConfidenceFp_skipsInvestigateMetadata() {
        String rawJson = """
            {"classification":"false positive","confidence":0.90,"reasoning":["known scanner"]}
            """;

        UtmAiTriage result = triageService.saveResult("alert-fp-no-inv", rawJson);

        assertThat(result.getStatus()).isEqualTo("AUTO_CLOSED_FP");
        assertThat(UtmAiTriageService.extractInvestigate(result.getNextSteps())).isEmpty();
        assertThat(result.getNextSteps()).doesNotContain("investigate stub");
    }

    @Test
    void saveResult_alertMutationFailure_stillPersistsLedgerAutoClose() throws Exception {
        doThrow(new ElasticsearchIndexDocumentUpdateException("opensearch unavailable"))
            .when(utmAlertService).updateStatus(anyList(), anyInt(), anyString());
        doThrow(new ElasticsearchIndexDocumentUpdateException("opensearch unavailable"))
            .when(utmAlertService).updateTags(anyList(), anyList(), anyBoolean());

        String rawJson = """
            {"classification":"fp","confidence":0.92,"reasoning":["noise"]}
            """;

        UtmAiTriage result = triageService.saveResult("alert-fp-fail", rawJson);

        assertThat(result.getStatus()).isEqualTo("AUTO_CLOSED_FP");
        assertThat(UtmAiTriageService.extractFsmPath(result.getNextSteps()))
            .containsExactly("AUTO_TRIAGE", "END");
        verify(triageRepository).save(any(UtmAiTriage.class));
        verify(utmAlertService).updateStatus(
            eq(List.of("alert-fp-fail")),
            eq(AlertStatus.FALSE_POSITIVE.getCode()),
            anyString());
    }

    @Test
    void agenticTriageFsm_pathsMatchContract() {
        assertThat(AgenticTriageFsm.run(true))
            .containsExactly(AgenticTriageState.AUTO_TRIAGE, AgenticTriageState.END);
        assertThat(AgenticTriageFsm.run(false))
            .containsExactly(
                AgenticTriageState.AUTO_TRIAGE,
                AgenticTriageState.ENRICH,
                AgenticTriageState.INVESTIGATE,
                AgenticTriageState.END);
        assertThat(AgenticTriageFsm.detailFor(AgenticTriageState.ENRICH, false))
            .contains("IOC key inventory")
            .doesNotContain("attack-path product");
        assertThat(AgenticTriageFsm.detailFor(AgenticTriageState.INVESTIGATE, false))
            .contains("openHypotheses")
            .contains("deferred")
            .contains("no Neo4j");
    }

    @Test
    void triageEnrichmentStub_buildIsHonestPlaceholder() {
        Map<String, Object> enrichment = TriageEnrichmentStub.build(
            Map.of("alertPayload", Map.of("ip", "1.2.3.4")), null);
        assertThat(enrichment.get("stub")).isEqualTo(true);
        assertThat(enrichment.get("relatedEntityCount")).isEqualTo(0);
        assertThat(TriageEnrichmentStub.summarize(enrichment)).contains("placeholder");
    }

    @Test
    void triageInvestigateStub_buildIsHonestPlaceholder() {
        Map<String, Object> investigate = TriageInvestigateStub.build(0);
        assertThat(investigate.get("stub")).isEqualTo(true);
        assertThat(investigate.get("relatedAlertCount")).isEqualTo(0);
        assertThat(investigate.get("openHypotheses")).isEqualTo(List.of());
        assertThat(TriageInvestigateStub.summarize(investigate))
            .contains("session linking deferred")
            .contains("no Neo4j");

        UtmAlert present = new UtmAlert();
        present.setId("a1");
        assertThat(TriageInvestigateStub.build(present).get("relatedAlertCount")).isEqualTo(1);
        assertThat(TriageInvestigateStub.build((UtmAlert) null).get("relatedAlertCount"))
            .isEqualTo(0);
    }
}
