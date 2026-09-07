package com.hivearmor.service.detection;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.service.detection.CelDryRunEvaluator.DryRunResult;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class DetectionRuleDryRunServiceExceptionPayloadTest {

    private final DetectionRuleDryRunService service = new DetectionRuleDryRunService(new ObjectMapper());

    @Test
    void toHonestyPayload_matchButSuppressed() {
        DryRunResult cel = CelDryRunEvaluator.evaluate(
            "equals(\"event.action\", \"powershell\")",
            Map.of("event", Map.of("action", "powershell")));
        assertThat(cel.matched()).isTrue();

        DetectionExceptionConsideration consideration = DetectionExceptionConsideration.suppressed(
            1, 9001L, "Approved scanner");
        Map<String, Object> payload = service.toHonestyPayload(cel, consideration);

        assertThat(payload.get("matched")).isEqualTo(true);
        assertThat(payload.get("suppressed")).isEqualTo(true);
        assertThat(payload.get("wouldAlert")).isEqualTo(false);
        assertThat(payload.get("exceptionsApplied")).isEqualTo(true);
        assertThat(payload.get("exceptionsSuppressedCount")).isEqualTo(1);
        assertThat(String.valueOf(payload.get("explanation"))).contains("Suppressed by exception #9001");
        assertThat(String.valueOf(payload.get("honesty"))).contains("exceptionsApplied=true");
    }

    @Test
    void toHonestyPayload_storeUnavailable_staysHonest() {
        DryRunResult cel = CelDryRunEvaluator.evaluate(
            "equals(\"event.action\", \"powershell\")",
            Map.of("event", Map.of("action", "powershell")));
        Map<String, Object> payload = service.toHonestyPayload(cel,
            DetectionExceptionConsideration.notApplied("Exception store unavailable: db down"));

        assertThat(payload.get("matched")).isEqualTo(true);
        assertThat(payload.get("suppressed")).isEqualTo(false);
        assertThat(payload.get("wouldAlert")).isEqualTo(true);
        assertThat(payload.get("exceptionsApplied")).isEqualTo(false);
        assertThat(String.valueOf(payload.get("honesty"))).contains("exceptionsApplied=false");
    }
}
