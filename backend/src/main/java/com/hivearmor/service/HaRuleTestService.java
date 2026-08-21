package com.hivearmor.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.service.dto.RuleTestResultDTO;
import com.hivearmor.service.rulesandbox.ConditionLexer;
import com.hivearmor.service.rulesandbox.ConditionNode;
import com.hivearmor.service.rulesandbox.ConditionParser;
import com.hivearmor.service.rulesandbox.SelectionEvaluator;
import com.hivearmor.service.rulesandbox.SelectionEvaluator.SelectionResult;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.Yaml;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Evaluates a Sigma YAML rule against a JSON event in memory.
 *
 * <p>No database, no OpenSearch, and no outbound HTTP calls are made — the
 * evaluation is purely in-process, making this safe in air-gap mode by
 * construction.
 *
 * <h2>Algorithm overview</h2>
 * <ol>
 *   <li>Parse {@code ruleYaml} with SnakeYAML and {@code eventJson} with Jackson.</li>
 *   <li>Extract the {@code detection} block from the parsed rule map.</li>
 *   <li>Separate named selection blocks from the reserved {@code condition} key;
 *       default condition is {@code "selection"} when the key is absent.</li>
 *   <li>Evaluate every named selection once via {@link SelectionEvaluator}; cache
 *       each {@link SelectionResult} by selection name.</li>
 *   <li>Tokenise and parse the condition string into an AST.</li>
 *   <li>Evaluate the AST against the boolean truth assignment from cached results;
 *       an identifier referencing an undefined selection yields
 *       {@code matched=false} with an explanation containing
 *       {@code unknown selection '<name>'}.</li>
 *   <li>Assemble the {@link RuleTestResultDTO}: on match, prefix every
 *       matched-field entry with {@code <selectionName>.}; on no-match, collect
 *       the failing selection names for the explanation.</li>
 * </ol>
 */
@Service
public class HaRuleTestService {

    private final ObjectMapper objectMapper;

    public HaRuleTestService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Tests a Sigma rule against an event.
     *
     * @param ruleYaml  the full Sigma rule in YAML format
     * @param eventJson the sample event as a flat JSON object
     * @return a {@link RuleTestResultDTO} describing the match result
     */
    public RuleTestResultDTO testRule(String ruleYaml, String eventJson) {

        // Stage 0 — parse inputs
        Map<String, Object> rule;
        try {
            Yaml yaml = new Yaml();
            Object parsed = yaml.load(ruleYaml);
            if (!(parsed instanceof Map)) {
                return evalError("rule YAML did not parse to a map");
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> castMap = (Map<String, Object>) parsed;
            rule = castMap;
        } catch (Exception e) {
            return evalError(e.getMessage());
        }

        Map<String, Object> event;
        try {
            event = objectMapper.readValue(eventJson, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            return evalError(e.getMessage());
        }

        // Stage 1 — extract detection block
        Object detectionObj = rule.get("detection");
        if (!(detectionObj instanceof Map)) {
            return evalError("rule YAML is missing a 'detection' map block");
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> detection = (Map<String, Object>) detectionObj;

        // Stage 2 — split condition key from named selections
        String conditionExpr = "selection"; // Sigma default when key is absent
        Object conditionVal = detection.get("condition");
        if (conditionVal != null) {
            conditionExpr = conditionVal.toString();
        }

        // Collect every key that is NOT "condition" as a named selection block
        Map<String, SelectionResult> results = new java.util.LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : detection.entrySet()) {
            if ("condition".equals(entry.getKey())) {
                continue;
            }
            Object block = entry.getValue();
            if (block instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> selectionMap = (Map<String, Object>) block;
                results.put(entry.getKey(),
                        SelectionEvaluator.evaluate(entry.getKey(), selectionMap, event));
            } else {
                // Non-map selection blocks (e.g. keyword lists) are not supported by
                // this sandbox; treat as a non-matching selection with no fields.
                results.put(entry.getKey(), new SelectionResult(false, List.of()));
            }
        }

        // Stage 3 — tokenise and parse the condition
        List<ConditionLexer.Token> tokens;
        try {
            tokens = ConditionLexer.tokenize(conditionExpr);
        } catch (IllegalArgumentException e) {
            return evalError(e.getMessage());
        }

        ConditionNode ast;
        try {
            ast = ConditionParser.parse(tokens);
        } catch (IllegalArgumentException e) {
            return evalError(e.getMessage());
        }

        // Stage 4 — evaluate the AST
        boolean matched;
        try {
            matched = evaluateAst(ast, results);
        } catch (UnknownSelectionException e) {
            return new RuleTestResultDTO(
                    false,
                    List.of(),
                    "Rule did not match. unknown selection '" + e.name + "'");
        }

        // Stage 5 — assemble the result DTO
        if (matched) {
            List<String> contributing = collectContributingSelections(ast, results);
            List<String> matchedFields = new ArrayList<>();
            for (String name : contributing) {
                SelectionResult sr = results.get(name);
                if (sr != null) {
                    for (String field : sr.matchedFields()) {
                        matchedFields.add(name + "." + field);
                    }
                }
            }
            String explanation = "Rule matched. Selections contributing: "
                    + String.join(", ", contributing);
            return new RuleTestResultDTO(true, matchedFields, explanation);
        } else {
            List<String> failing = collectFailingSelections(ast, results);
            String explanation = "Rule did not match. Selection(s) that failed: "
                    + String.join(", ", failing);
            return new RuleTestResultDTO(false, List.of(), explanation);
        }
    }

    // -----------------------------------------------------------------------
    // AST evaluation
    // -----------------------------------------------------------------------

    /**
     * Recursively evaluates a {@link ConditionNode} AST against the cached
     * selection results.
     *
     * @throws UnknownSelectionException when an {@link ConditionNode.Ident} names
     *                                   a selection that has no entry in
     *                                   {@code results}
     */
    private boolean evaluateAst(ConditionNode node, Map<String, SelectionResult> results) {
        if (node instanceof ConditionNode.Ident ident) {
            SelectionResult sr = results.get(ident.name());
            if (sr == null) {
                throw new UnknownSelectionException(ident.name());
            }
            return sr.matched();
        } else if (node instanceof ConditionNode.Not not) {
            return !evaluateAst(not.child(), results);
        } else if (node instanceof ConditionNode.And and) {
            return evaluateAst(and.left(), results) && evaluateAst(and.right(), results);
        } else if (node instanceof ConditionNode.Or or) {
            return evaluateAst(or.left(), results) || evaluateAst(or.right(), results);
        }
        // Should be unreachable given the sealed hierarchy
        throw new IllegalStateException("Unknown ConditionNode type: " + node.getClass());
    }

    // -----------------------------------------------------------------------
    // Contribution walkers
    // -----------------------------------------------------------------------

    /**
     * Collects the names of selections that contributed to a <em>true</em>
     * evaluation result.
     *
     * <ul>
     *   <li>{@code Or}  — short-circuits to the first true branch only.</li>
     *   <li>{@code And} — both branches contributed.</li>
     *   <li>{@code Not} of a false child — the child contributed (confirmed absent).</li>
     *   <li>{@code Ident} — the leaf selection itself.</li>
     * </ul>
     */
    private List<String> collectContributingSelections(
            ConditionNode node, Map<String, SelectionResult> results) {

        Set<String> contributors = new LinkedHashSet<>();
        collectContributing(node, results, contributors);
        return new ArrayList<>(contributors);
    }

    private void collectContributing(
            ConditionNode node,
            Map<String, SelectionResult> results,
            Set<String> out) {

        if (node instanceof ConditionNode.Ident ident) {
            // Only add if the selection is actually true (i.e. it contributed)
            SelectionResult sr = results.get(ident.name());
            if (sr != null && sr.matched()) {
                out.add(ident.name());
            }
            return;
        }

        if (node instanceof ConditionNode.Not not) {
            // Not-of-false contributes: the child selection was confirmed absent.
            // We only reach this walker if the Not node evaluated to true, meaning
            // its child evaluated to false.
            collectContributing(not.child(), results, out);
            return;
        }

        if (node instanceof ConditionNode.And and) {
            // Both branches must be true for And to be true; both contribute.
            collectContributing(and.left(), results, out);
            collectContributing(and.right(), results, out);
            return;
        }

        if (node instanceof ConditionNode.Or or) {
            // Or short-circuits: include only the branch(es) that are true.
            boolean leftTrue = safeEval(or.left(), results);
            if (leftTrue) {
                collectContributing(or.left(), results, out);
            } else {
                collectContributing(or.right(), results, out);
            }
        }
    }

    /**
     * Collects the names of selections that caused a <em>false</em> evaluation
     * result.
     *
     * <ul>
     *   <li>{@code Or}  — both branches failed; both contribute to the failure.</li>
     *   <li>{@code And} — the first false side (or both) contributes.</li>
     *   <li>{@code Not} of a true child — the child is the failure reason.</li>
     *   <li>{@code Ident} — the leaf selection itself.</li>
     * </ul>
     */
    private List<String> collectFailingSelections(
            ConditionNode node, Map<String, SelectionResult> results) {

        Set<String> failures = new LinkedHashSet<>();
        collectFailing(node, results, failures);
        return new ArrayList<>(failures);
    }

    private void collectFailing(
            ConditionNode node,
            Map<String, SelectionResult> results,
            Set<String> out) {

        if (node instanceof ConditionNode.Ident ident) {
            // Only add if the selection actually failed
            SelectionResult sr = results.get(ident.name());
            if (sr == null || !sr.matched()) {
                out.add(ident.name());
            }
            return;
        }

        if (node instanceof ConditionNode.Not not) {
            // Not-of-true is a failure: the child was true when it should be false.
            collectFailing(not.child(), results, out);
            return;
        }

        if (node instanceof ConditionNode.And and) {
            // And fails when at least one side is false; report all false sides.
            boolean leftTrue = safeEval(and.left(), results);
            boolean rightTrue = safeEval(and.right(), results);
            if (!leftTrue) {
                collectFailing(and.left(), results, out);
            }
            if (!rightTrue) {
                collectFailing(and.right(), results, out);
            }
            return;
        }

        if (node instanceof ConditionNode.Or or) {
            // Or fails when both branches are false; both contribute.
            collectFailing(or.left(), results, out);
            collectFailing(or.right(), results, out);
        }
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /**
     * Evaluates the AST silently (swallowing {@link UnknownSelectionException})
     * for use inside the contribution walkers where unknown selections have
     * already been handled by the main evaluation path.
     */
    private boolean safeEval(ConditionNode node, Map<String, SelectionResult> results) {
        try {
            return evaluateAst(node, results);
        } catch (UnknownSelectionException e) {
            return false;
        }
    }

    /** Constructs a parse/evaluation-error result DTO. */
    private static RuleTestResultDTO evalError(String detail) {
        String msg = (detail != null && detail.startsWith("Evaluation error"))
                ? detail
                : "Evaluation error: " + detail;
        return new RuleTestResultDTO(false, List.of(), msg);
    }

    // -----------------------------------------------------------------------
    // Internal exception — used to signal an unknown selection reference
    // -----------------------------------------------------------------------

    /** Thrown when the AST references a selection name not present in the detection block. */
    private static final class UnknownSelectionException extends RuntimeException {
        final String name;

        UnknownSelectionException(String name) {
            super("unknown selection '" + name + "'");
            this.name = name;
        }
    }
}
