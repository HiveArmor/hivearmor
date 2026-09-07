package com.hivearmor.service.detection;

import com.hivearmor.service.detection.CelDryRunEvaluator.DryRunResult;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link CelDryRunEvaluator} (DET-TEST-001).
 */
class CelDryRunEvaluatorTest {

    @Test
    void equals_nestedField_matches() {
        Map<String, Object> event = nestedAwsDeleteEvent();
        DryRunResult result = CelDryRunEvaluator.evaluate(
            "equals(\"log.eventSource\", \"iam.amazonaws.com\")", event);

        assertThat(result.matched()).isTrue();
        assertThat(result.matchedFields()).containsExactly("log.eventSource");
        assertThat(result.evaluationMode()).isEqualTo("inject_dry_run");
        assertThat(result.openSearchQueried()).isFalse();
        assertThat(result.engineParity()).isEqualTo("approximate");
        assertThat(result.syntaxOk()).isTrue();
    }

    @Test
    void equals_flattenedKey_matches() {
        Map<String, Object> event = Map.of("log.eventSource", "iam.amazonaws.com");
        DryRunResult result = CelDryRunEvaluator.evaluate(
            "equals(\"log.eventSource\", \"iam.amazonaws.com\")", event);
        assertThat(result.matched()).isTrue();
    }

    @Test
    void contains_substring_matches() {
        Map<String, Object> event = nestedAwsDeleteEvent();
        DryRunResult result = CelDryRunEvaluator.evaluate(
            "contains(\"log.eventName\", \"Delete\")", event);
        assertThat(result.matched()).isTrue();
        assertThat(result.matchedFields()).contains("log.eventName");
    }

    @Test
    void oneOf_list_matches() {
        Map<String, Object> event = nestedAwsDeleteEvent();
        DryRunResult result = CelDryRunEvaluator.evaluate(
            "oneOf(\"log.eventName\", [\"CreateUser\", \"DeleteUser\", \"DeleteAccessKey\"])", event);
        assertThat(result.matched()).isTrue();
    }

    @Test
    void oneOf_list_noMatch() {
        Map<String, Object> event = nestedAwsDeleteEvent();
        DryRunResult result = CelDryRunEvaluator.evaluate(
            "oneOf(\"log.eventName\", [\"CreateUser\", \"ListUsers\"])", event);
        assertThat(result.matched()).isFalse();
    }

    @Test
    void and_or_not_booleanLogic() {
        Map<String, Object> event = nestedAwsDeleteEvent();

        DryRunResult andMatch = CelDryRunEvaluator.evaluate(
            "equals(\"log.eventSource\", \"iam.amazonaws.com\") && contains(\"log.eventName\", \"Delete\")",
            event);
        assertThat(andMatch.matched()).isTrue();
        assertThat(andMatch.matchedFields()).contains("log.eventSource", "log.eventName");

        DryRunResult andFail = CelDryRunEvaluator.evaluate(
            "equals(\"log.eventSource\", \"iam.amazonaws.com\") && equals(\"log.eventName\", \"Nope\")",
            event);
        assertThat(andFail.matched()).isFalse();

        DryRunResult orMatch = CelDryRunEvaluator.evaluate(
            "equals(\"log.eventName\", \"Nope\") || contains(\"log.eventName\", \"Delete\")",
            event);
        assertThat(orMatch.matched()).isTrue();

        DryRunResult notMatch = CelDryRunEvaluator.evaluate(
            "!equals(\"log.eventName\", \"CreateUser\")", event);
        assertThat(notMatch.matched()).isTrue();

        DryRunResult notFail = CelDryRunEvaluator.evaluate(
            "!contains(\"log.eventName\", \"Delete\")", event);
        assertThat(notFail.matched()).isFalse();
    }

    @Test
    void startsWith_and_endsWith() {
        Map<String, Object> event = Map.of("process", Map.of("name", "powershell.exe"));
        assertThat(CelDryRunEvaluator.evaluate(
            "startsWith(\"process.name\", \"power\")", event).matched()).isTrue();
        assertThat(CelDryRunEvaluator.evaluate(
            "endsWith(\"process.name\", \".exe\")", event).matched()).isTrue();
        assertThat(CelDryRunEvaluator.evaluate(
            "startsWith(\"process.name\", \"cmd\")", event).matched()).isFalse();
    }

    @Test
    void compoundExpression_matchesAwsDelete() {
        Map<String, Object> event = nestedAwsDeleteEvent();
        String expr = "equals(\"log.eventSource\", \"iam.amazonaws.com\") "
            + "&& contains(\"log.eventName\", \"Delete\") "
            + "&& oneOf(\"log.eventName\", [\"DeleteUser\", \"DeleteAccessKey\"])";
        DryRunResult result = CelDryRunEvaluator.evaluate(expr, event);
        assertThat(result.matched()).isTrue();
        assertThat(result.matchedFields()).hasSizeGreaterThanOrEqualTo(2);
        assertThat(result.durationMs()).isGreaterThanOrEqualTo(0);
    }

    @Test
    void blankExpression_doesNotMatch() {
        DryRunResult result = CelDryRunEvaluator.evaluate("  ", Map.of());
        assertThat(result.matched()).isFalse();
        assertThat(result.syntaxOk()).isFalse();
        assertThat(result.explanation()).contains("No expression");
    }

    @Test
    void unsupportedFunction_reportsParseError() {
        DryRunResult result = CelDryRunEvaluator.evaluate(
            "regexMatch(\"field\", \".*\")", Map.of("field", "x"));
        assertThat(result.matched()).isFalse();
        assertThat(result.syntaxOk()).isFalse();
        assertThat(result.explanation()).containsIgnoringCase("Unsupported");
    }

    @Test
    void exists_helper() {
        Map<String, Object> event = nestedAwsDeleteEvent();
        assertThat(CelDryRunEvaluator.evaluate("exists(\"log.eventName\")", event).matched()).isTrue();
        assertThat(CelDryRunEvaluator.evaluate("exists(\"missing.path\")", event).matched()).isFalse();
    }

    @Test
    void parentheses_precedence() {
        Map<String, Object> event = nestedAwsDeleteEvent();
        DryRunResult result = CelDryRunEvaluator.evaluate(
            "(equals(\"log.eventSource\", \"s3.amazonaws.com\") || equals(\"log.eventSource\", \"iam.amazonaws.com\")) "
                + "&& contains(\"log.eventName\", \"Delete\")",
            event);
        assertThat(result.matched()).isTrue();
    }

    private static Map<String, Object> nestedAwsDeleteEvent() {
        Map<String, Object> log = new LinkedHashMap<>();
        log.put("eventSource", "iam.amazonaws.com");
        log.put("eventName", "DeleteUser");
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("log", log);
        return event;
    }
}
