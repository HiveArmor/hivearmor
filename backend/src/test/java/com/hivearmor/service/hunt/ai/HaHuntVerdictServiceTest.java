package com.hivearmor.service.hunt.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.fasterxml.jackson.databind.ObjectMapper;

import com.hivearmor.ai.HaLlmService;
import com.hivearmor.ai.LlmNotConfiguredException;
import com.hivearmor.service.llm.ChatOptions;
import com.hivearmor.web.rest.hunt.ai.dto.AiCalibrationDTO;
import com.hivearmor.web.rest.hunt.ai.dto.HuntEventSample;
import com.hivearmor.web.rest.hunt.ai.dto.VerdictResponseDTO;

/**
 * Unit tests for {@link HaHuntVerdictService} — the AI verdict keystone.
 *
 * <p>Validates: structured-JSON parse into the contract DTO (verdict/confidence/reasoning
 * rowRefs/evidence), calibration is ALWAYS attached on a ready verdict (§2/§6), and the honest
 * non-ready states — insufficient_data (too few events) and unavailable (LLM throws / unparseable).
 */
@DisplayName("HaHuntVerdictService — verdict keystone")
class HaHuntVerdictServiceTest {

    private HaLlmService llm;
    private HaAiCalibrationService calibration;
    private HaHuntVerdictService service;

    @BeforeEach
    void setUp() {
        llm = mock(HaLlmService.class);
        calibration = mock(HaAiCalibrationService.class);
        service = new HaHuntVerdictService(llm, calibration, new ObjectMapper());
        ReflectionTestUtils.setField(service, "maxEvents", 120);
        when(calibration.calibrationFor(anyString()))
            .thenReturn(new AiCalibrationDTO(0.84, 212, "90d", "credential-access verdicts", "flat"));
        when(llm.activeProviderName()).thenReturn("ollama:foundation-sec-8b");
    }

    private static List<HuntEventSample> events(int n) {
        List<HuntEventSample> l = new ArrayList<>();
        for (int i = 1; i <= n; i++) {
            l.add(new HuntEventSample("evt-" + i, "2026-09-04T08:4" + i + ":00Z", "high",
                "authentication", "failure", "svc_backup", "45.83.220.11", "failed auth"));
        }
        return l;
    }

    @Test
    @DisplayName("insufficient_data when fewer than 3 events")
    void insufficient() {
        VerdictResponseDTO r = service.verdict("HUNT-1", events(2));
        assertThat(r.state()).isEqualTo("insufficient_data");
        assertThat(r.verdict()).isNull();
    }

    @Test
    @DisplayName("ready: parses structured JSON, attaches calibration, maps reasoning rowRefs + evidence")
    void readyParse() {
        String json = "{\"verdict\":\"suspicious\",\"confidence\":0.79,"
            + "\"title\":\"Credential-access cluster\",\"summary\":\"burst then success\","
            + "\"conclusion\":\"likely compromise\","
            + "\"mitre\":[{\"tactic\":\"Credential Access\",\"technique\":\"T1110\",\"subtechnique\":\"T1110.003\"}],"
            + "\"reasoning\":[{\"label\":\"Baseline deviation\",\"detail\":\"foreign ASNs\",\"rowRefs\":[\"evt-1\",\"evt-2\"]}],"
            + "\"evidence\":[{\"label\":\"Risk\",\"value\":\"91\",\"rowRef\":\"evt-3\",\"kind\":\"enrichment\"}]}";
        when(llm.chat(anyList(), any(ChatOptions.class))).thenReturn(json);

        VerdictResponseDTO r = service.verdict("HUNT-1", events(6));

        assertThat(r.state()).isEqualTo("ready");
        assertThat(r.verdict()).isEqualTo("suspicious");
        assertThat(r.confidence()).isEqualTo(0.79);
        assertThat(r.verdictId()).isEqualTo("VERDICT-HUNT-1");
        assertThat(r.totalConsidered()).isEqualTo(6);
        // calibration is ALWAYS present on a ready verdict (never a naked confidence)
        assertThat(r.calibration()).isNotNull();
        assertThat(r.calibration().agreementRate()).isEqualTo(0.84);
        // reasoning row-citations preserved (move 3)
        assertThat(r.reasoning()).hasSize(1);
        assertThat(r.reasoning().get(0).rowRefs()).containsExactly("evt-1", "evt-2");
        // enrichment evidence is provenance-lensed (move 2)
        assertThat(r.evidence().get(0).provenanceLensed()).isTrue();
        assertThat(r.mitre()).hasSize(1);
        assertThat(r.provenance()).isNotNull();
    }

    @Test
    @DisplayName("ready: tolerates ```json fenced output from the model")
    void fencedJson() {
        String fenced = "```json\n{\"verdict\":\"benign\",\"confidence\":0.3,\"summary\":\"noise\"}\n```";
        when(llm.chat(anyList(), any(ChatOptions.class))).thenReturn(fenced);

        VerdictResponseDTO r = service.verdict("HUNT-2", events(4));

        assertThat(r.state()).isEqualTo("ready");
        assertThat(r.verdict()).isEqualTo("benign");
    }

    @Test
    @DisplayName("unavailable when the LLM is not configured")
    void unavailableNotConfigured() {
        when(llm.chat(anyList(), any(ChatOptions.class))).thenThrow(new LlmNotConfiguredException("no provider"));
        VerdictResponseDTO r = service.verdict("HUNT-3", events(5));
        assertThat(r.state()).isEqualTo("unavailable");
        assertThat(r.verdict()).isNull();
    }

    @Test
    @DisplayName("unavailable when the model returns unparseable output")
    void unavailableUnparseable() {
        when(llm.chat(anyList(), any(ChatOptions.class))).thenReturn("I cannot help with that.");
        VerdictResponseDTO r = service.verdict("HUNT-4", events(5));
        assertThat(r.state()).isEqualTo("unavailable");
    }

    @Test
    @DisplayName("invalid verdict value is normalized to inconclusive; confidence clamped to 0..1")
    void normalizesJunk() {
        when(llm.chat(anyList(), any(ChatOptions.class)))
            .thenReturn("{\"verdict\":\"scary\",\"confidence\":5.0,\"summary\":\"x\"}");
        VerdictResponseDTO r = service.verdict("HUNT-5", events(3));
        assertThat(r.verdict()).isEqualTo("inconclusive");
        assertThat(r.confidence()).isBetween(0.0, 1.0);
    }
}
