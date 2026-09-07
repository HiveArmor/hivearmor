package com.hivearmor.service.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Result DTO for rule testing (Sigma sandbox and correlation inject dry-run).
 *
 * <p>Supports two usage patterns:
 * <ol>
 *   <li>Full construction via the 7-field constructor (legacy admin).</li>
 *   <li>Compact 3-field construction via {@code RuleTestResultDTO(boolean, List, String)}
 *       used by {@code HaRuleTestService}.</li>
 * </ol>
 *
 * <p>Honesty fields ({@code evaluationMode}, {@code openSearchQueried},
 * {@code engineParity}) are set by DET-TEST-001 inject dry-run paths.
 */
@Schema(description = "Result of testing a detection rule against a sample event")
@Data
@NoArgsConstructor
public class RuleTestResultDTO {
    // --- legacy / admin fields ---
    @Schema(description = "Rule ID (legacy admin field)", example = "101")
    private Long ruleId;

    @Schema(description = "Rule display name (legacy admin field)", example = "Brute Force Detection")
    private String ruleName;

    @Schema(description = "Whether the rule expression/YAML syntax is valid", example = "true")
    private boolean syntaxOk;

    @Schema(description = "Number of named variables (selections) in the rule", example = "3")
    private int variableCount;

    @Schema(description = "Number of simulated event matches", example = "1")
    private int simulatedMatchCount;

    @Schema(description = "Evaluation note providing context on the test outcome")
    private String evaluationNote;

    @Schema(description = "Duration of the rule evaluation in milliseconds", example = "12")
    private long durationMs;

    // --- match result fields (used by HaRuleTestService and its tests) ---
    @Schema(description = "Whether the rule matched the test event", example = "true", requiredMode = Schema.RequiredMode.REQUIRED)
    private boolean matched;

    @Schema(description = "Human-readable explanation of why the rule matched or failed", example = "Rule matched. Selections contributing: selection1")
    private String explanation;

    @Schema(description = "List of field paths that contributed to the match", example = "[\"selection1.EventID\", \"selection1.LogonType\"]")
    private List<String> matchedFields;

    // --- honesty metadata (DET-TEST-001) ---
    @Schema(description = "Evaluation mode", example = "inject_dry_run")
    private String evaluationMode;

    @Schema(description = "Whether OpenSearch was queried", example = "false")
    private boolean openSearchQueried;

    @Schema(description = "Engine parity vs event-processor Go CEL", example = "approximate")
    private String engineParity;

    @Schema(description = "Whether the CEL expression matched the sample event")
    private Boolean expressionMatched;

    @Schema(description = "Whether an active exception would suppress the alert")
    private Boolean suppressed;

    @Schema(description = "Whether the engine would create an alert (matched and not suppressed)")
    private Boolean wouldAlert;

    @Schema(description = "True when active exceptions were loaded and considered")
    private Boolean exceptionsApplied;

    @Schema(description = "Matching exception id when suppressed")
    private Long matchingExceptionId;

    @Schema(description = "Matching exception title when suppressed")
    private String matchingExceptionTitle;

    /**
     * Full constructor for legacy admin usage (7 primary fields).
     */
    public RuleTestResultDTO(Long ruleId, String ruleName, boolean syntaxOk,
                              int variableCount, int simulatedMatchCount,
                              String evaluationNote, long durationMs) {
        this.ruleId = ruleId;
        this.ruleName = ruleName;
        this.syntaxOk = syntaxOk;
        this.variableCount = variableCount;
        this.simulatedMatchCount = simulatedMatchCount;
        this.evaluationNote = evaluationNote;
        this.durationMs = durationMs;
    }

    /**
     * Compact constructor used by {@code HaRuleTestService} for inline match results.
     *
     * @param matched     whether the rule matched
     * @param matchedFields matched field names (may be empty)
     * @param explanation human-readable explanation
     */
    public RuleTestResultDTO(boolean matched, List<String> matchedFields, String explanation) {
        this.matched = matched;
        this.syntaxOk = matched;
        this.matchedFields = matchedFields;
        this.explanation = explanation;
        this.evaluationNote = explanation;
        this.simulatedMatchCount = matchedFields != null ? matchedFields.size() : 0;
    }
}
