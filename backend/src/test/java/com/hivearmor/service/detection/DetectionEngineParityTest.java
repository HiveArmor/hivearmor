package com.hivearmor.service.detection;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.event_processor.EventProcessorManagerService;
import com.hivearmor.service.detection.CelDryRunEvaluator.DryRunResult;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * DET-TEST-002 — sequence/risk/graph use EP evaluate; never fake CEL hits.
 */
class DetectionEngineParityTest {

    private static final String SEQUENCE_YAML = """
        id: 9101
        name: SEQ-BRUTE-FORCE-THEN-SUCCESS
        sequence:
          - where: 'action == "failed_auth"'
            within: 15m
          - where: 'action == "authentication_success"'
            within: 30m
        """;

    @Test
    void classifyEngine_sequenceRiskGraph() {
        assertThat(DetectionRuleDryRunService.classifyEngineFromText(SEQUENCE_YAML))
            .isEqualTo(DetectionRuleDryRunService.ENGINE_SEQUENCE);
        assertThat(DetectionRuleDryRunService.classifyEngineFromText(
            "name: RISK\nriskScore: 25\nwhere: 'true'\n"))
            .isEqualTo(DetectionRuleDryRunService.ENGINE_RISK);
        assertThat(DetectionRuleDryRunService.classifyEngineFromText(
            "type: graph_offense\ncypherQuery: MATCH (n) RETURN n\n"))
            .isEqualTo(DetectionRuleDryRunService.ENGINE_GRAPH);
        assertThat(DetectionRuleDryRunService.classifyEngineFromText(
            "equals(\"event.action\", \"powershell\")"))
            .isEqualTo(DetectionRuleDryRunService.ENGINE_CEL);
    }

    @Test
    void sequence_whenEpReturnsGo_doesNotTreatStepAsHitUnlessComplete() {
        EventProcessorManagerService ep = mock(EventProcessorManagerService.class);
        when(ep.evaluateRule(any(), any(), eq("sequence"))).thenReturn(Map.of(
            "engine", "sequence",
            "engineParity", "go",
            "matched", false,
            "wouldAlert", false,
            "sequenceComplete", false,
            "explanation", "Go sequence engine: 1/2 steps matched; sequenceComplete=false.",
            "matchedFields", List.of(),
            "syntaxOk", true
        ));
        DetectionRuleDryRunService service = new DetectionRuleDryRunService(new ObjectMapper(), ep);

        DryRunResult result = service.evaluateRuleMap(
            Map.of("expression", SEQUENCE_YAML, "engine", "sequence"),
            Map.of("action", "failed_auth"));

        assertThat(result.engineParity()).isEqualTo("go");
        assertThat(result.matched()).isFalse();
        assertThat(result.evaluationMode()).isEqualTo("ep_evaluate");
        assertThat(result.explanation()).contains("sequenceComplete=false");
    }

    @Test
    void sequence_whenEpUnavailable_neverFallsBackToJavaCelMatch() {
        EventProcessorManagerService ep = mock(EventProcessorManagerService.class);
        when(ep.evaluateRule(any(), any(), eq("sequence")))
            .thenThrow(new IllegalStateException("event-processor evaluate unavailable: connection refused"));
        DetectionRuleDryRunService service = new DetectionRuleDryRunService(new ObjectMapper(), ep);

        DryRunResult result = service.evaluateExpression(SEQUENCE_YAML, Map.of("action", "failed_auth"));

        assertThat(result.engineParity()).isEqualTo("unavailable");
        assertThat(result.matched()).isFalse();
        assertThat(result.explanation()).contains("were not faked as Java CEL matches");
    }

    @Test
    void sequence_withoutEpClient_unavailableNotCel() {
        DetectionRuleDryRunService service = new DetectionRuleDryRunService(new ObjectMapper());
        DryRunResult result = service.evaluateExpression(SEQUENCE_YAML, Map.of("action", "failed_auth"));
        assertThat(result.engineParity()).isEqualTo("unavailable");
        assertThat(result.matched()).isFalse();
    }

    @Test
    void celWhere_stillUsesJavaApproximate() {
        EventProcessorManagerService ep = mock(EventProcessorManagerService.class);
        DetectionRuleDryRunService service = new DetectionRuleDryRunService(new ObjectMapper(), ep);

        DryRunResult result = service.evaluateExpression(
            "equals(\"event.action\", \"powershell\")",
            Map.of("event", Map.of("action", "powershell")));

        assertThat(result.engineParity()).isEqualTo("approximate");
        assertThat(result.matched()).isTrue();
        verify(ep, never()).evaluateRule(any(), any(), any());
    }

    @Test
    void honestyPayload_goVsUnavailable() {
        DetectionRuleDryRunService service = new DetectionRuleDryRunService(new ObjectMapper());
        DryRunResult go = new DryRunResult(
            false, List.of(), "sequenceComplete=false", 4,
            CelDryRunEvaluator.EVALUATION_MODE_EP, false,
            CelDryRunEvaluator.ENGINE_PARITY_GO, true);
        Map<String, Object> goPayload = service.toHonestyPayload(go);
        assertThat(goPayload.get("engineParity")).isEqualTo("go");
        assertThat(String.valueOf(goPayload.get("honesty"))).contains("engineParity=go");

        DryRunResult down = DetectionRuleDryRunService.unavailable("sequence", System.currentTimeMillis(), "down");
        Map<String, Object> downPayload = service.toHonestyPayload(down);
        assertThat(downPayload.get("matched")).isEqualTo(false);
        assertThat(downPayload.get("engineParity")).isEqualTo("unavailable");
        assertThat(String.valueOf(downPayload.get("honesty"))).contains("were not faked");
    }

    @Test
    void loadReportLists_requiresLoadedNamesNotReloadHttp() {
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("loaded", 12);
        report.put("loadedNames", List.of("PILOT-WIN-FAILED-LOGON"));
        assertThat(EventProcessorManagerService.loadedNamesContain(report, "PILOT-WIN-FAILED-LOGON")).isTrue();
        assertThat(EventProcessorManagerService.loadedNamesContain(report, "Sigma staged title")).isFalse();
        assertThat(EventProcessorManagerService.loadedNamesContain(Map.of("loaded", 12), "PILOT-WIN-FAILED-LOGON"))
            .isFalse();
        assertThat(EventProcessorManagerService.loadedNamesContain(null, "x")).isFalse();
    }
}
