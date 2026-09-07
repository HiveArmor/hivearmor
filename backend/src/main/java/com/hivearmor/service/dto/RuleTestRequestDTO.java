package com.hivearmor.service.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Request body for rule test endpoints.
 *
 * <p>Two consumers share this DTO:
 * <ul>
 *   <li>{@code POST /api/ha-rules/test} — Sigma YAML + {@code eventJson} (validated by resource).</li>
 *   <li>{@code POST /api/correlation-rule/test} — {@code ruleId} + sample event
 *       ({@code eventJson} / {@code sampleEvent} / {@code testEventJson}).</li>
 * </ul>
 */
@Data
public class RuleTestRequestDTO {
    private Long ruleId;

    /** Legacy alias for the injectable sample event. */
    @Size(max = 65536)
    private String testEventJson;

    /** Sigma rule YAML (ha-rules/test). */
    @Size(max = 65536)
    private String ruleYaml;

    /** Preferred injectable sample event JSON. */
    @Size(max = 65536)
    private String eventJson;

    /** Alias for {@link #eventJson} (DET-TEST-001). */
    @Size(max = 65536)
    private String sampleEvent;

    /**
     * Resolves the injectable event payload from any accepted field name.
     *
     * @return first non-blank of eventJson, sampleEvent, testEventJson; or null
     */
    public String resolveEventJson() {
        if (eventJson != null && !eventJson.isBlank()) {
            return eventJson;
        }
        if (sampleEvent != null && !sampleEvent.isBlank()) {
            return sampleEvent;
        }
        if (testEventJson != null && !testEventJson.isBlank()) {
            return testEventJson;
        }
        return null;
    }
}
