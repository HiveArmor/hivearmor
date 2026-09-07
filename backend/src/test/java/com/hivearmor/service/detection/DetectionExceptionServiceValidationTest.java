package com.hivearmor.service.detection;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Persist-time validation for DET-FP-001 exception packs (EP operator allowlist).
 */
class DetectionExceptionServiceValidationTest {

    @Test
    void allowedOperators_matchEventProcessorAllowlist() {
        assertThat(DetectionExceptionService.ALLOWED_OPERATORS)
            .containsExactlyInAnyOrder("is", "is_not", "contains", "starts_with", "ends_with", "in");
        assertThat(DetectionExceptionService.isAllowedOperator("IS")).isTrue();
        assertThat(DetectionExceptionService.isAllowedOperator("equals")).isFalse();
        assertThat(DetectionExceptionService.isAllowedOperator("regex")).isFalse();
        assertThat(DetectionExceptionService.isAllowedOperator("")).isFalse();
    }

    @Test
    void requireValidRuleId_acceptsBaselineAndNumericKeys() {
        assertThat(DetectionExceptionService.requireValidRuleId("baseline:anomaly"))
            .isEqualTo("baseline:anomaly");
        assertThat(DetectionExceptionService.requireValidRuleId(" 42 ")).isEqualTo("42");
        assertThatThrownBy(() -> DetectionExceptionService.requireValidRuleId("../etc/passwd"))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> DetectionExceptionService.requireValidRuleId("x".repeat(65)))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> DetectionExceptionService.requireValidRuleId(" "))
            .isInstanceOf(IllegalArgumentException.class);
    }
}
