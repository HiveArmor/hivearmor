package com.hivearmor.service.detection;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Parity tests vs event-processor {@code TestExceptionCondMatch_Operators}.
 */
class DetectionExceptionMatcherTest {

    @Test
    void operators_matchGoExceptionCondMatch() {
        Map<String, Object> origin = new LinkedHashMap<>();
        origin.put("host", "approved-scanner");
        origin.put("ip", "10.99.1.5");
        origin.put("user", "svc-scan");
        Map<String, Object> event = Map.of("origin", origin);

        assertThat(DetectionExceptionMatcher.matches(
            List.of(cond("host.name", "is", "approved-scanner")), event)).isTrue();
        assertThat(DetectionExceptionMatcher.matches(
            List.of(cond("host.name", "is", "other")), event)).isFalse();
        assertThat(DetectionExceptionMatcher.matches(
            List.of(cond("host.name", "is_not", "other")), event)).isTrue();
        assertThat(DetectionExceptionMatcher.matches(
            List.of(cond("origin.host", "contains", "scanner")), event)).isTrue();
        assertThat(DetectionExceptionMatcher.matches(
            List.of(cond("source.ip", "starts_with", "10.99.")), event)).isTrue();
        assertThat(DetectionExceptionMatcher.matches(
            List.of(cond("origin.user", "ends_with", "scan")), event)).isTrue();
        assertThat(DetectionExceptionMatcher.matches(
            List.of(cond("host.name", "in", "a, approved-scanner, b")), event)).isTrue();
        assertThat(DetectionExceptionMatcher.matches(
            List.of(cond("host.name", "unknown_op", "approved-scanner")), event)).isFalse();
    }

    @Test
    void nestedHostName_matchesIsOperator() {
        Map<String, Object> event = Map.of("host", Map.of("name", "approved-scanner"));
        assertThat(DetectionExceptionMatcher.matches(
            List.of(cond("host.name", "is", "approved-scanner")), event)).isTrue();
        assertThat(DetectionExceptionMatcher.matches(
            List.of(cond("origin.host", "is", "approved-scanner")), event)).isTrue();
    }

    @Test
    void andConditions_requireAll() {
        Map<String, Object> event = Map.of(
            "host", Map.of("name", "approved-scanner"),
            "user", Map.of("name", "svc-scan")
        );
        List<Map<String, String>> both = List.of(
            cond("host.name", "is", "approved-scanner"),
            cond("user.name", "is", "svc-scan")
        );
        assertThat(DetectionExceptionMatcher.matches(both, event)).isTrue();
        assertThat(DetectionExceptionMatcher.matches(both,
            Map.of("host", Map.of("name", "approved-scanner"), "user", Map.of("name", "other")))
        ).isFalse();
    }

    @Test
    void allowedOperators_matchEventProcessorAllowlist() {
        assertThat(DetectionExceptionMatcher.ALLOWED_OPERATORS)
            .containsExactlyInAnyOrder("is", "is_not", "contains", "starts_with", "ends_with", "in");
        assertThat(DetectionExceptionMatcher.isAllowedOperator("IS")).isTrue();
        assertThat(DetectionExceptionMatcher.isAllowedOperator("equals")).isFalse();
        assertThat(DetectionExceptionMatcher.isAllowedOperator("")).isFalse();
        assertThat(DetectionExceptionMatcher.isAllowedOperator("regex")).isFalse();
        assertThat(DetectionExceptionService.requireValidRuleId("baseline:anomaly"))
            .isEqualTo("baseline:anomaly");
        assertThat(DetectionExceptionService.requireValidRuleId(" 42 "))
            .isEqualTo("42");
        org.assertj.core.api.Assertions.assertThatThrownBy(
            () -> DetectionExceptionService.requireValidRuleId("../etc/passwd")
        ).isInstanceOf(IllegalArgumentException.class);
        org.assertj.core.api.Assertions.assertThatThrownBy(
            () -> DetectionExceptionService.requireValidRuleId("x".repeat(65))
        ).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void emptyConditions_doNotMatch() {
        assertThat(DetectionExceptionMatcher.matches(List.of(), Map.of("host", Map.of("name", "x"))))
            .isFalse();
        assertThat(DetectionExceptionMatcher.matches(null, Map.of())).isFalse();
    }

    private static Map<String, String> cond(String field, String operator, String value) {
        Map<String, String> row = new LinkedHashMap<>();
        row.put("field", field);
        row.put("operator", operator);
        row.put("value", value);
        return row;
    }
}
