package com.hivearmor.service.rulesandbox;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Evaluates a single Sigma selection block against a flat event map.
 *
 * <p>A selection block is a {@code Map<String, Object>} where each key is either a
 * bare field name ({@code CommandLine}) or a field name with a modifier suffix
 * ({@code CommandLine|contains}). The selection matches the event if and only if
 * <em>every</em> key/value criterion inside it matches — AND semantics across keys.
 *
 * <h2>Supported modifiers</h2>
 * <ul>
 *   <li>{@code contains} — {@link String#contains(CharSequence)}</li>
 *   <li>{@code startswith} — {@link String#startsWith(String)}</li>
 *   <li>{@code endswith} — {@link String#endsWith(String)}</li>
 *   <li><em>default (no modifier)</em> — string equality via {@link String#equals(Object)};
 *       numeric types are compared by {@link Object#toString()} equality as well</li>
 * </ul>
 *
 * <p>If the expected value is a {@link List}, any single entry matching is sufficient
 * (OR semantics within the list).
 *
 * <p>Matched fields are recorded as {@code fieldName=actualValue}. The caller is
 * responsible for prepending the selection name prefix ({@code selectionName.}) when
 * building the top-level {@code RuleTestResultDTO.matchedFields} list.
 */
public final class SelectionEvaluator {

    /**
     * The result of evaluating one named Sigma selection block.
     *
     * @param matched       true if all criteria in the selection matched the event
     * @param matchedFields list of {@code fieldName=actualValue} strings for each
     *                      field whose criterion matched; empty when {@code matched}
     *                      is false
     */
    public record SelectionResult(boolean matched, List<String> matchedFields) {}

    // Utility class — no instances.
    private SelectionEvaluator() {}

    /**
     * Evaluates one Sigma selection block against a flat event map.
     *
     * @param selectionName the name of this selection block (used only for context;
     *                      the caller prepends it to matched-field strings)
     * @param selection     the Sigma selection map: keys are plain or modifier-suffixed
     *                      field names; values are expected scalars or lists
     * @param event         the flat event map whose field values are tested
     * @return a {@link SelectionResult} indicating whether all criteria matched and
     *         which field/value pairs contributed
     */
    public static SelectionResult evaluate(
            String selectionName,
            Map<String, Object> selection,
            Map<String, Object> event) {

        List<String> matchedFields = new ArrayList<>();

        for (Map.Entry<String, Object> criterion : selection.entrySet()) {
            String rawKey   = criterion.getKey();
            Object expected = criterion.getValue();

            // Split field name from optional modifier, e.g. "CommandLine|contains"
            String fieldName;
            String modifier;
            int pipeIdx = rawKey.indexOf('|');
            if (pipeIdx >= 0) {
                fieldName = rawKey.substring(0, pipeIdx);
                modifier  = rawKey.substring(pipeIdx + 1).toLowerCase();
            } else {
                fieldName = rawKey;
                modifier  = "";
            }

            // Retrieve the actual value from the event
            Object actualObj = event.get(fieldName);
            String actualStr = (actualObj != null) ? actualObj.toString() : null;

            // Evaluate the criterion; a list-valued expected is OR across entries
            boolean criterionMatched = testCriterion(actualStr, expected, modifier);

            if (!criterionMatched) {
                // One failing criterion means the whole selection fails (AND semantics)
                return new SelectionResult(false, List.of());
            }

            // Record this field as contributing to the match
            matchedFields.add(fieldName + "=" + (actualStr != null ? actualStr : ""));
        }

        // All criteria passed
        return new SelectionResult(true, matchedFields);
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /**
     * Tests one criterion: a single actual string against one or more expected
     * values using the given modifier.
     *
     * <p>If {@code expected} is a {@link List}, the criterion passes when any
     * entry in the list satisfies the comparison (OR semantics).
     */
    private static boolean testCriterion(String actual, Object expected, String modifier) {
        if (expected instanceof List<?> expectedList) {
            for (Object entry : expectedList) {
                if (testSingle(actual, entry != null ? entry.toString() : null, modifier)) {
                    return true;
                }
            }
            return false;
        }
        return testSingle(actual, expected != null ? expected.toString() : null, modifier);
    }

    /**
     * Tests one actual string against one expected string using the given modifier.
     *
     * <p>When {@code actual} is null the comparison always returns false (the event
     * field is absent), matching Sigma's typical semantics.
     */
    private static boolean testSingle(String actual, String expectedStr, String modifier) {
        if (actual == null) {
            return false;
        }
        if (expectedStr == null) {
            // A null expected value only matches a null actual; since actual is non-null, fail.
            return false;
        }

        switch (modifier) {
            case "contains":
                return actual.contains(expectedStr);
            case "startswith":
                return actual.startsWith(expectedStr);
            case "endswith":
                return actual.endsWith(expectedStr);
            default:
                // Default: exact string equality.
                // Covers the no-modifier case as well as unrecognised modifiers
                // (treated as equality against the modifier-suffixed field name,
                // which is what SnakeYAML gives us anyway).
                return actual.equals(expectedStr);
        }
    }
}
