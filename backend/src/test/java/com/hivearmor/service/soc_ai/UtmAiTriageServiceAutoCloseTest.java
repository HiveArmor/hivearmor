package com.hivearmor.service.soc_ai;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class UtmAiTriageServiceAutoCloseTest {

    @Test
    void highConfidenceFalsePositiveTriggersAutoClose() {
        assertThat(UtmAiTriageService.isHighConfidenceFalsePositive(
            "possible false positive", new BigDecimal("0.90"))).isTrue();
        assertThat(UtmAiTriageService.isHighConfidenceFalsePositive(
            "possible false positive", new BigDecimal("0.84"))).isFalse();
        assertThat(UtmAiTriageService.isHighConfidenceFalsePositive(
            "possible incident", new BigDecimal("0.99"))).isFalse();
        assertThat(UtmAiTriageService.isHighConfidenceFalsePositive(
            null, new BigDecimal("0.99"))).isFalse();
    }
}
