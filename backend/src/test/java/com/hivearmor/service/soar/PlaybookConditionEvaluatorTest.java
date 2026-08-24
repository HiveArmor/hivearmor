package com.hivearmor.service.soar;

import com.hivearmor.service.dto.PlaybookExecuteRequestDTO;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class PlaybookConditionEvaluatorTest {

    @Test
    void eq_matchesSeverityFromInputs() {
        PlaybookExecuteRequestDTO ctx = new PlaybookExecuteRequestDTO();
        ctx.setInputs(Map.of("severity", "high"));
        var result = PlaybookConditionEvaluator.evaluate(
            Map.of("field", "severity", "op", "eq", "value", "high"), ctx);
        assertThat(result.passed()).isTrue();
        assertThat(result.onFalse()).isEqualTo(PlaybookConditionEvaluator.OnFalse.STOP_SUCCESS);
    }

    @Test
    void eq_failsAndHonorsOnFalseFail() {
        PlaybookExecuteRequestDTO ctx = new PlaybookExecuteRequestDTO();
        ctx.setInputs(Map.of("severity", "low"));
        var result = PlaybookConditionEvaluator.evaluate(
            Map.of("field", "severity", "op", "eq", "value", "high", "onFalse", "fail"), ctx);
        assertThat(result.passed()).isFalse();
        assertThat(result.onFalse()).isEqualTo(PlaybookConditionEvaluator.OnFalse.FAIL);
    }

    @Test
    void all_requiresEveryClause() {
        PlaybookExecuteRequestDTO ctx = new PlaybookExecuteRequestDTO();
        ctx.setAgentId("20");
        ctx.setInputs(Map.of("severity", "critical"));
        var result = PlaybookConditionEvaluator.evaluate(Map.of(
            "all", List.of(
                Map.of("field", "severity", "op", "eq", "value", "critical"),
                Map.of("field", "agentId", "op", "exists")
            )
        ), ctx);
        assertThat(result.passed()).isTrue();
    }

    @Test
    void in_matchesList() {
        PlaybookExecuteRequestDTO ctx = new PlaybookExecuteRequestDTO();
        ctx.setInputs(Map.of("severity", "high"));
        var result = PlaybookConditionEvaluator.evaluate(
            Map.of("field", "severity", "op", "in", "value", List.of("high", "critical")), ctx);
        assertThat(result.passed()).isTrue();
    }

    @Test
    void gt_comparesNumericInputs() {
        PlaybookExecuteRequestDTO ctx = new PlaybookExecuteRequestDTO();
        ctx.setInputs(Map.of("score", 90));
        var result = PlaybookConditionEvaluator.evaluate(
            Map.of("field", "score", "op", "gte", "value", 85), ctx);
        assertThat(result.passed()).isTrue();
    }
}
