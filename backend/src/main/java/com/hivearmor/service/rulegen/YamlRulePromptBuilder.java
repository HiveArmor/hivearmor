package com.hivearmor.service.rulegen;

import com.hivearmor.service.rulegen.dto.GenerateRequest;
import com.hivearmor.service.rulegen.dto.SignalGroup;

import java.util.List;
import java.util.stream.Collectors;

/**
 * Builds the YAML-oriented system prompt sent to the LLM for rule generation.
 *
 * <p>The prompt instructs the LLM to produce a valid YAML document containing
 * the required top-level keys: {@code name}, {@code severity}, {@code dataTypes},
 * and {@code definition}. It also includes signal group context so the LLM can
 * base its suggestion on the analyst-recorded feedback patterns.
 *
 * <p>This class is stateless — all state is passed via method parameters.
 */
public final class YamlRulePromptBuilder {

    private YamlRulePromptBuilder() {
        // Utility class — not instantiable
    }

    /**
     * Builds the system prompt for rule generation.
     *
     * @param groups  the signal groups that have accumulated enough analyst feedback
     * @param request the generation request containing the signal key and options
     * @return the complete system prompt string
     */
    public static String build(List<SignalGroup> groups, GenerateRequest request) {
        StringBuilder sb = new StringBuilder();

        sb.append("You are a HiveArmor correlation rule author. ");
        sb.append("Generate a YAML correlation rule based on the analyst signal data below.\n\n");

        sb.append("The output MUST be a single valid YAML document with exactly these top-level keys:\n");
        sb.append("  - name: A short, descriptive rule name (string)\n");
        sb.append("  - severity: The severity level (one of: low, medium, high, critical)\n");
        sb.append("  - dataTypes: A list of data source types this rule applies to (list of strings)\n");
        sb.append("  - definition: The rule logic using CEL expressions (string)\n\n");

        sb.append("Do NOT include any other top-level keys. Do NOT wrap the YAML in markdown code fences.\n");
        sb.append("Output ONLY the raw YAML document.\n\n");

        sb.append("--- Signal Group Context ---\n");
        sb.append("Signal key: ").append(request.signalKey() != null ? request.signalKey() : "all").append("\n");
        sb.append("Signal groups meeting threshold:\n\n");

        if (groups == null || groups.isEmpty()) {
            sb.append("  (no signal groups available)\n");
        } else {
            for (SignalGroup g : groups) {
                sb.append("  - dataType: ").append(g.dataType() != null ? g.dataType() : "unknown").append("\n");
                sb.append("    signalType: ").append(g.signalType().name()).append("\n");
                sb.append("    count: ").append(g.count()).append("\n");
                sb.append("    firstSeen: ").append(g.firstSeen()).append("\n");
                sb.append("    lastSeen: ").append(g.lastSeen()).append("\n\n");
            }
        }

        sb.append("--- End Signal Context ---\n\n");
        sb.append("Generate a rule that detects the pattern indicated by the signal groups above. ");
        sb.append("Focus on the data types with the highest counts of true-positive signals.");

        return sb.toString();
    }
}
