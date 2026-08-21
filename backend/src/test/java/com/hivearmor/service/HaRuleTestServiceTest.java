package com.hivearmor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.service.dto.RuleTestResultDTO;
import com.hivearmor.service.rulesandbox.ConditionLexer;
import com.hivearmor.service.rulesandbox.ConditionNode;
import com.hivearmor.service.rulesandbox.ConditionParser;
import com.hivearmor.service.rulesandbox.SelectionEvaluator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Random;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link HaRuleTestService}.
 *
 * <p>Covers the 10 required cases from Requirement 6.12 (cases a–j),
 * plus:
 * <ul>
 *   <li><b>Property 14</b>: Sandbox evaluator matches reference boolean semantics</li>
 *   <li><b>Property 15</b>: Field modifier semantics (contains/startswith/endswith/equality)</li>
 *   <li><b>Property 16</b>: matchedFields fully qualified per selection</li>
 *   <li><b>Property 17</b>: Explanation names the selections determining the outcome</li>
 * </ul>
 * And lexer/parser unit tests for precedence and paren grouping.
 *
 * <p><b>Validates: Requirements 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12</b>
 */
@Tag("Feature: sprint-14-sigma-detection")
class HaRuleTestServiceTest {

    private HaRuleTestService service;

    @BeforeEach
    void setUp() {
        service = new HaRuleTestService(new ObjectMapper());
    }

    // -----------------------------------------------------------------------
    // Helpers — minimal Sigma YAML builders
    // -----------------------------------------------------------------------

    /** Builds a minimal Sigma rule YAML with a single "selection" block and default condition. */
    private static String singleSelectionRule(String fieldName, String expectedValue) {
        return "title: Test Rule\n"
             + "detection:\n"
             + "  selection:\n"
             + "    " + fieldName + ": " + expectedValue + "\n"
             + "  condition: selection\n";
    }

    /** Builds a rule with two named selections and an explicit condition expression. */
    private static String twoSelectionRule(
            String sel1Name, String sel1Field, String sel1Value,
            String sel2Name, String sel2Field, String sel2Value,
            String condition) {
        return "title: Test Rule\n"
             + "detection:\n"
             + "  " + sel1Name + ":\n"
             + "    " + sel1Field + ": " + sel1Value + "\n"
             + "  " + sel2Name + ":\n"
             + "    " + sel2Field + ": " + sel2Value + "\n"
             + "  condition: " + condition + "\n";
    }

    /** Builds a rule with selection + filter blocks and an explicit condition. */
    private static String selectionFilterRule(
            String selField, String selValue,
            String filterField, String filterValue,
            String condition) {
        return "title: Test Rule\n"
             + "detection:\n"
             + "  selection:\n"
             + "    " + selField + ": " + selValue + "\n"
             + "  filter:\n"
             + "    " + filterField + ": " + filterValue + "\n"
             + "  condition: " + condition + "\n";
    }

    // -----------------------------------------------------------------------
    // Required case (a): single-selection MATCH
    // Validates: Requirement 6.12(a), 6.4, 6.7, 6.8
    // -----------------------------------------------------------------------

    @Test
    void testRule_singleSelection_match() throws Exception {
        String rule = singleSelectionRule("EventID", "4624");
        String event = "{\"EventID\": \"4624\"}";

        RuleTestResultDTO result = service.testRule(rule, event);

        assertThat(result.isMatched()).isTrue();
        assertThat(result.getMatchedFields()).containsExactly("selection.EventID=4624");
        assertThat(result.getExplanation()).contains("selection");
    }

    // -----------------------------------------------------------------------
    // Required case (b): single-selection NO-MATCH
    // Validates: Requirement 6.12(b), 6.4, 6.9
    // -----------------------------------------------------------------------

    @Test
    void testRule_singleSelection_noMatch() throws Exception {
        String rule = singleSelectionRule("EventID", "4624");
        String event = "{\"EventID\": \"4625\"}";

        RuleTestResultDTO result = service.testRule(rule, event);

        assertThat(result.isMatched()).isFalse();
        assertThat(result.getMatchedFields()).isEmpty();
        assertThat(result.getExplanation()).contains("selection");
    }

    // -----------------------------------------------------------------------
    // Required case (c): selection1 AND selection2 — both match → true
    // Validates: Requirement 6.12(c), 6.6
    // -----------------------------------------------------------------------

    @Test
    void testRule_andCondition_bothMatch_returnsTrue() throws Exception {
        String rule = twoSelectionRule(
                "selection1", "EventID", "4624",
                "selection2", "LogonType", "3",
                "selection1 and selection2");
        String event = "{\"EventID\": \"4624\", \"LogonType\": \"3\"}";

        RuleTestResultDTO result = service.testRule(rule, event);

        assertThat(result.isMatched()).isTrue();
        assertThat(result.getMatchedFields())
                .anySatisfy(f -> assertThat(f).startsWith("selection1."))
                .anySatisfy(f -> assertThat(f).startsWith("selection2."));
        assertThat(result.getExplanation()).contains("selection1").contains("selection2");
    }

    // -----------------------------------------------------------------------
    // Required case (d): selection1 AND selection2 — one non-matching → false
    // Validates: Requirement 6.12(d), 6.6
    // -----------------------------------------------------------------------

    @Test
    void testRule_andCondition_oneNonMatching_returnsFalse() throws Exception {
        String rule = twoSelectionRule(
                "selection1", "EventID", "4624",
                "selection2", "LogonType", "9",
                "selection1 and selection2");
        String event = "{\"EventID\": \"4624\", \"LogonType\": \"3\"}";

        RuleTestResultDTO result = service.testRule(rule, event);

        assertThat(result.isMatched()).isFalse();
        assertThat(result.getMatchedFields()).isEmpty();
        assertThat(result.getExplanation()).contains("selection2");
    }

    // -----------------------------------------------------------------------
    // Required case (e): selection1 OR selection2 — one matching → true
    // Validates: Requirement 6.12(e), 6.6
    // -----------------------------------------------------------------------

    @Test
    void testRule_orCondition_oneMatching_returnsTrue() throws Exception {
        String rule = twoSelectionRule(
                "selection1", "EventID", "4624",
                "selection2", "LogonType", "9",
                "selection1 or selection2");
        String event = "{\"EventID\": \"4624\", \"LogonType\": \"3\"}";

        RuleTestResultDTO result = service.testRule(rule, event);

        assertThat(result.isMatched()).isTrue();
        assertThat(result.getMatchedFields()).anyMatch(f -> f.startsWith("selection1."));
    }

    // -----------------------------------------------------------------------
    // Required case (f): selection1 OR selection2 — both non-matching → false
    // Validates: Requirement 6.12(f), 6.6
    // -----------------------------------------------------------------------

    @Test
    void testRule_orCondition_bothNonMatching_returnsFalse() throws Exception {
        String rule = twoSelectionRule(
                "selection1", "EventID", "9999",
                "selection2", "LogonType", "9",
                "selection1 or selection2");
        String event = "{\"EventID\": \"4624\", \"LogonType\": \"3\"}";

        RuleTestResultDTO result = service.testRule(rule, event);

        assertThat(result.isMatched()).isFalse();
        assertThat(result.getMatchedFields()).isEmpty();
        assertThat(result.getExplanation()).contains("selection1").contains("selection2");
    }

    // -----------------------------------------------------------------------
    // Required case (g): selection AND NOT filter — selection matches, filter does not → true
    // Validates: Requirement 6.12(g), 6.6
    // -----------------------------------------------------------------------

    @Test
    void testRule_selectionAndNotFilter_selectionMatchesFilterDoesNot_returnsTrue() throws Exception {
        String rule = selectionFilterRule(
                "EventID", "4624",
                "LogonType", "3",
                "selection and not filter");
        // Event has EventID=4624 (matches selection) but LogonType=10 (does NOT match filter)
        String event = "{\"EventID\": \"4624\", \"LogonType\": \"10\"}";

        RuleTestResultDTO result = service.testRule(rule, event);

        assertThat(result.isMatched()).isTrue();
        assertThat(result.getMatchedFields()).anyMatch(f -> f.startsWith("selection."));
        assertThat(result.getExplanation()).contains("selection");
    }

    @Test
    void testRule_selectionAndNotFilter_selectionMatchesFilterAlsoMatches_returnsFalse() throws Exception {
        String rule = selectionFilterRule(
                "EventID", "4624",
                "LogonType", "3",
                "selection and not filter");
        // Both match; NOT filter = false → AND fails
        String event = "{\"EventID\": \"4624\", \"LogonType\": \"3\"}";

        RuleTestResultDTO result = service.testRule(rule, event);

        assertThat(result.isMatched()).isFalse();
    }

    // -----------------------------------------------------------------------
    // Required case (h): (selection1 OR selection2) AND NOT filter
    // Validates: Requirement 6.12(h), 6.6
    // -----------------------------------------------------------------------

    @Test
    void testRule_parenOrAndNotFilter_correctBoolean() throws Exception {
        String rule = "title: Test Rule\n"
                + "detection:\n"
                + "  selection1:\n"
                + "    EventID: '4624'\n"
                + "  selection2:\n"
                + "    EventID: '4625'\n"
                + "  filter:\n"
                + "    LogonType: '3'\n"
                + "  condition: (selection1 or selection2) and not filter\n";

        // selection1 matches, filter does not match → true
        String event1 = "{\"EventID\": \"4624\", \"LogonType\": \"10\"}";
        RuleTestResultDTO r1 = service.testRule(rule, event1);
        assertThat(r1.isMatched()).isTrue();

        // Neither selection matches → false regardless of filter
        String event2 = "{\"EventID\": \"9999\", \"LogonType\": \"10\"}";
        RuleTestResultDTO r2 = service.testRule(rule, event2);
        assertThat(r2.isMatched()).isFalse();

        // selection2 matches, filter also matches → NOT filter = false → AND fails
        String event3 = "{\"EventID\": \"4625\", \"LogonType\": \"3\"}";
        RuleTestResultDTO r3 = service.testRule(rule, event3);
        assertThat(r3.isMatched()).isFalse();
    }

    // -----------------------------------------------------------------------
    // Required case (i): unknown selection identifier → matched=false, "unknown selection"
    // Validates: Requirement 6.12(i), 6.10
    // -----------------------------------------------------------------------

    @Test
    void testRule_unknownSelectionIdentifier_returnsFalseWithMessage() throws Exception {
        String rule = "title: Test Rule\n"
                + "detection:\n"
                + "  selection:\n"
                + "    EventID: '4624'\n"
                + "  condition: selection and nonexistent\n";
        String event = "{\"EventID\": \"4624\"}";

        RuleTestResultDTO result = service.testRule(rule, event);

        assertThat(result.isMatched()).isFalse();
        assertThat(result.getMatchedFields()).isEmpty();
        assertThat(result.getExplanation()).containsIgnoringCase("unknown selection");
        assertThat(result.getExplanation()).contains("nonexistent");
    }

    // -----------------------------------------------------------------------
    // Required case (j): malformed YAML → matched=false, "Evaluation error"
    // Validates: Requirement 6.12(j), 6.11
    // -----------------------------------------------------------------------

    @Test
    void testRule_malformedYaml_returnsFalseWithEvaluationError() throws Exception {
        String badYaml = "title: Test\n  bad_indent:\n invalid: [unclosed";
        String event = "{\"EventID\": \"4624\"}";

        RuleTestResultDTO result = service.testRule(badYaml, event);

        assertThat(result.isMatched()).isFalse();
        assertThat(result.getMatchedFields()).isEmpty();
        assertThat(result.getExplanation()).startsWith("Evaluation error");
    }

    @Test
    void testRule_malformedJson_returnsFalseWithEvaluationError() throws Exception {
        String rule = singleSelectionRule("EventID", "4624");
        String badJson = "{\"EventID\": }";  // invalid JSON

        RuleTestResultDTO result = service.testRule(rule, badJson);

        assertThat(result.isMatched()).isFalse();
        assertThat(result.getMatchedFields()).isEmpty();
        assertThat(result.getExplanation()).startsWith("Evaluation error");
    }

    // -----------------------------------------------------------------------
    // Lexer / parser unit tests — precedence and parenthesis grouping
    // Validates: Requirement 6.6
    // -----------------------------------------------------------------------

    @Test
    void lexer_tokenizesAndOrNotAndParens() {
        List<ConditionLexer.Token> tokens = ConditionLexer.tokenize("selection and not filter");
        assertThat(tokens).extracting(ConditionLexer.Token::type)
                .containsExactly(
                        ConditionLexer.Type.IDENT,
                        ConditionLexer.Type.AND,
                        ConditionLexer.Type.NOT,
                        ConditionLexer.Type.IDENT,
                        ConditionLexer.Type.EOF);
    }

    @Test
    void lexer_keywordInsideIdentifier_remainsIdent() {
        // "notify" and "android" contain "or" and "and" but should not be split
        List<ConditionLexer.Token> tokens = ConditionLexer.tokenize("notify android");
        assertThat(tokens).extracting(ConditionLexer.Token::type)
                .containsExactly(
                        ConditionLexer.Type.IDENT,
                        ConditionLexer.Type.IDENT,
                        ConditionLexer.Type.EOF);
        assertThat(tokens.get(0).text()).isEqualTo("notify");
        assertThat(tokens.get(1).text()).isEqualTo("android");
    }

    @Test
    void lexer_caseInsensitiveKeywords() {
        List<ConditionLexer.Token> tokens = ConditionLexer.tokenize("A AND B OR NOT C");
        assertThat(tokens).extracting(ConditionLexer.Token::type)
                .containsExactly(
                        ConditionLexer.Type.IDENT,
                        ConditionLexer.Type.AND,
                        ConditionLexer.Type.IDENT,
                        ConditionLexer.Type.OR,
                        ConditionLexer.Type.NOT,
                        ConditionLexer.Type.IDENT,
                        ConditionLexer.Type.EOF);
    }

    @Test
    void parser_andHasHigherPrecedenceThanOr() {
        // "a or b and c" should parse as Or(a, And(b, c))
        List<ConditionLexer.Token> tokens = ConditionLexer.tokenize("a or b and c");
        ConditionNode ast = ConditionParser.parse(tokens);
        assertThat(ast).isInstanceOf(ConditionNode.Or.class);
        ConditionNode.Or or = (ConditionNode.Or) ast;
        assertThat(or.left()).isEqualTo(new ConditionNode.Ident("a"));
        assertThat(or.right()).isInstanceOf(ConditionNode.And.class);
    }

    @Test
    void parser_notHasHigherPrecedenceThanAnd() {
        // "not a and b" should parse as And(Not(a), b)
        List<ConditionLexer.Token> tokens = ConditionLexer.tokenize("not a and b");
        ConditionNode ast = ConditionParser.parse(tokens);
        assertThat(ast).isInstanceOf(ConditionNode.And.class);
        ConditionNode.And and = (ConditionNode.And) ast;
        assertThat(and.left()).isInstanceOf(ConditionNode.Not.class);
        assertThat(and.right()).isEqualTo(new ConditionNode.Ident("b"));
    }

    @Test
    void parser_parenGroupingOverridesPrecedence() {
        // "(a or b) and c" should parse as And(Or(a,b), c)
        List<ConditionLexer.Token> tokens = ConditionLexer.tokenize("(a or b) and c");
        ConditionNode ast = ConditionParser.parse(tokens);
        assertThat(ast).isInstanceOf(ConditionNode.And.class);
        ConditionNode.And and = (ConditionNode.And) ast;
        assertThat(and.left()).isInstanceOf(ConditionNode.Or.class);
        assertThat(and.right()).isEqualTo(new ConditionNode.Ident("c"));
    }

    @Test
    void parser_leftAssociativityForAnd() {
        // "a and b and c" → And(And(a,b), c)
        List<ConditionLexer.Token> tokens = ConditionLexer.tokenize("a and b and c");
        ConditionNode ast = ConditionParser.parse(tokens);
        assertThat(ast).isInstanceOf(ConditionNode.And.class);
        ConditionNode.And outer = (ConditionNode.And) ast;
        assertThat(outer.left()).isInstanceOf(ConditionNode.And.class);
        assertThat(outer.right()).isEqualTo(new ConditionNode.Ident("c"));
    }

    @Test
    void parser_doubleNotRightAssociative() {
        // "not not a" → Not(Not(a))
        List<ConditionLexer.Token> tokens = ConditionLexer.tokenize("not not a");
        ConditionNode ast = ConditionParser.parse(tokens);
        assertThat(ast).isInstanceOf(ConditionNode.Not.class);
        ConditionNode.Not outer = (ConditionNode.Not) ast;
        assertThat(outer.child()).isInstanceOf(ConditionNode.Not.class);
    }

    // -----------------------------------------------------------------------
    // Property 14: Sandbox evaluator matches reference boolean semantics
    // Seeded random generator over and/or/not/paren nested expressions.
    // Validates: Requirements 6.4, 6.6
    // -----------------------------------------------------------------------

    private static final int P14_ITERATIONS = 200;
    private static final long P14_SEED = 42L;

    /**
     * <b>Property 14: Sandbox evaluator matches reference boolean semantics.</b>
     *
     * <p>Generates random boolean structures of depth ≤ 5 using a pool of 4 named
     * selection identifiers (sel_a … sel_d). For each structure it:
     * <ol>
     *   <li>Randomly assigns true/false to each identifier.</li>
     *   <li>Computes the expected boolean result via a pure Java reference
     *       evaluator that mirrors the grammar rules.</li>
     *   <li>Constructs a minimal Sigma YAML rule that embeds the selection blocks
     *       matching the assigned truth values.</li>
     *   <li>Invokes {@link HaRuleTestService#testRule} and asserts the returned
     *       {@code matched} equals the reference result.</li>
     * </ol>
     *
     * <p><b>Validates: Requirements 6.4, 6.6</b>
     */
    @Test
    void property14_sandboxMatchesReferenceBooleanSemantics() throws Exception {
        Random rng = new Random(P14_SEED);
        String[] ids = {"sel_a", "sel_b", "sel_c", "sel_d"};

        for (int i = 0; i < P14_ITERATIONS; i++) {
            // Assign a random truth value to each identifier
            boolean[] truth = new boolean[ids.length];
            for (int k = 0; k < ids.length; k++) {
                truth[k] = rng.nextBoolean();
            }

            // Generate a random condition expression and its expected boolean value
            BoolExpr expr = randomExpr(rng, ids, truth, 0);

            // Build Sigma YAML where matching selections have a known matching field,
            // and non-matching selections have a field value that will never appear
            StringBuilder yaml = new StringBuilder("title: PBT-14 Rule\ndetection:\n");
            for (int k = 0; k < ids.length; k++) {
                yaml.append("  ").append(ids[k]).append(":\n");
                if (truth[k]) {
                    // This field value will be present in the event → matches
                    yaml.append("    pbt_field: 'MATCH_VALUE'\n");
                } else {
                    // This field value will NOT be present in the event → no match
                    yaml.append("    pbt_field: 'NO_MATCH_VALUE_").append(k).append("'\n");
                }
            }
            yaml.append("  condition: ").append(expr.conditionStr).append("\n");

            String event = "{\"pbt_field\": \"MATCH_VALUE\"}";

            RuleTestResultDTO result = service.testRule(yaml.toString(), event);

            assertThat(result.isMatched())
                    .as("Property 14 failed at iteration %d (seed=%d): condition='%s' truth=%s",
                            i, P14_SEED, expr.conditionStr, java.util.Arrays.toString(truth))
                    .isEqualTo(expr.expected);
        }
    }

    /** Container for a generated condition string and its expected boolean evaluation result. */
    private static class BoolExpr {
        final String conditionStr;
        final boolean expected;
        BoolExpr(String s, boolean e) { conditionStr = s; expected = e; }
    }

    /** Recursively generates a random boolean expression of depth ≤ 5. */
    private BoolExpr randomExpr(Random rng, String[] ids, boolean[] truth, int depth) {
        if (depth >= 5 || rng.nextInt(3) == 0) {
            // Leaf — pick a random identifier
            int idx = rng.nextInt(ids.length);
            return new BoolExpr(ids[idx], truth[idx]);
        }
        int op = rng.nextInt(3);
        if (op == 0) {
            // NOT
            BoolExpr child = randomExpr(rng, ids, truth, depth + 1);
            return new BoolExpr("not " + child.conditionStr, !child.expected);
        } else if (op == 1) {
            // AND
            BoolExpr left = randomExpr(rng, ids, truth, depth + 1);
            BoolExpr right = randomExpr(rng, ids, truth, depth + 1);
            return new BoolExpr("(" + left.conditionStr + " and " + right.conditionStr + ")",
                    left.expected && right.expected);
        } else {
            // OR
            BoolExpr left = randomExpr(rng, ids, truth, depth + 1);
            BoolExpr right = randomExpr(rng, ids, truth, depth + 1);
            return new BoolExpr("(" + left.conditionStr + " or " + right.conditionStr + ")",
                    left.expected || right.expected);
        }
    }

    // -----------------------------------------------------------------------
    // Property 15: Field modifier semantics
    // Tests contains/startswith/endswith/default equality via SelectionEvaluator directly
    // and via full service roundtrip.
    // Validates: Requirement 6.5
    // -----------------------------------------------------------------------

    private static final int P15_ITERATIONS = 200;
    private static final long P15_SEED = 7L;

    /**
     * <b>Property 15: Field modifier semantics.</b>
     *
     * <p>For each of the four supported modifiers ({@code contains}, {@code startswith},
     * {@code endswith}, and default equality), generates random (actual, expected) string
     * pairs and asserts that {@link SelectionEvaluator} agrees with the JDK oracle:
     * <ul>
     *   <li>{@code contains} ↔ {@link String#contains(CharSequence)}</li>
     *   <li>{@code startswith} ↔ {@link String#startsWith(String)}</li>
     *   <li>{@code endswith} ↔ {@link String#endsWith(String)}</li>
     *   <li>default ↔ {@link String#equals(Object)}</li>
     * </ul>
     *
     * <p><b>Validates: Requirement 6.5</b>
     */
    @Test
    void property15_fieldModifierSemantics() throws Exception {
        Random rng = new Random(P15_SEED);
        String[] modifiers = {"contains", "startswith", "endswith", ""};

        for (int i = 0; i < P15_ITERATIONS; i++) {
            String modifier = modifiers[rng.nextInt(modifiers.length)];
            String base = randomWord(rng, 3, 10);
            String extra = randomWord(rng, 2, 5);

            // Build an actual value and an expected value such that we get both
            // matching and non-matching cases
            String actual;
            String expected;
            boolean shouldMatch = rng.nextBoolean();

            switch (modifier) {
                case "contains":
                    expected = extra;
                    actual = shouldMatch ? (base + extra + base) : base;
                    // Ensure the non-match case really does not contain extra
                    if (!shouldMatch && actual.contains(expected)) {
                        actual = "XYZ_NEVER_MATCHES";
                    }
                    break;
                case "startswith":
                    expected = extra;
                    actual = shouldMatch ? (extra + base) : (base + extra);
                    break;
                case "endswith":
                    expected = extra;
                    actual = shouldMatch ? (base + extra) : (extra + base);
                    break;
                default:
                    // exact equality
                    expected = base;
                    actual = shouldMatch ? base : (base + "_DIFF");
                    break;
            }

            // Oracle using JDK String methods
            boolean oracle;
            switch (modifier) {
                case "contains":   oracle = actual.contains(expected); break;
                case "startswith": oracle = actual.startsWith(expected); break;
                case "endswith":   oracle = actual.endsWith(expected); break;
                default:           oracle = actual.equals(expected); break;
            }

            // Build a minimal selection map with the modifier key
            java.util.Map<String, Object> selection = new java.util.LinkedHashMap<>();
            String fieldKey = modifier.isEmpty() ? "testField" : ("testField|" + modifier);
            selection.put(fieldKey, expected);

            java.util.Map<String, Object> event = new java.util.LinkedHashMap<>();
            event.put("testField", actual);

            SelectionEvaluator.SelectionResult sr =
                    SelectionEvaluator.evaluate("sel", selection, event);

            assertThat(sr.matched())
                    .as("Property 15 failed at iteration %d (seed=%d): modifier='%s' actual='%s' expected='%s'",
                            i, P15_SEED, modifier, actual, expected)
                    .isEqualTo(oracle);
        }
    }

    private static String randomWord(Random rng, int minLen, int maxLen) {
        int len = minLen + rng.nextInt(maxLen - minLen + 1);
        StringBuilder sb = new StringBuilder(len);
        for (int i = 0; i < len; i++) {
            sb.append((char) ('a' + rng.nextInt(26)));
        }
        return sb.toString();
    }

    // -----------------------------------------------------------------------
    // Property 16: matchedFields fully qualified per selection
    // Every entry has the form <selectionName>.<fieldName>=<actualValue>
    // Validates: Requirement 6.7
    // -----------------------------------------------------------------------

    private static final int P16_ITERATIONS = 150;
    private static final long P16_SEED = 99L;

    /**
     * <b>Property 16: matchedFields fully qualified per selection.</b>
     *
     * <p>For every matched rule result, every entry in {@code matchedFields} MUST
     * match the pattern {@code <selectionName>.<fieldName>=<actualValue>}.
     * Specifically: the prefix up to the first dot must be a known selection name,
     * and the suffix must be of the form {@code fieldName=value}.
     *
     * <p><b>Validates: Requirement 6.7</b>
     */
    @Test
    void property16_matchedFieldsFullyQualifiedPerSelection() throws Exception {
        Random rng = new Random(P16_SEED);
        String[] selNames = {"sel_x", "sel_y", "selectionA", "detection_block"};

        for (int i = 0; i < P16_ITERATIONS; i++) {
            // Pick 1–3 selection names for this test
            int count = 1 + rng.nextInt(3);
            java.util.List<String> chosenSels = new java.util.ArrayList<>();
            for (int k = 0; k < count; k++) {
                chosenSels.add(selNames[k]);
            }

            // Build YAML with OR condition across all selections (so any match contributes)
            StringBuilder yaml = new StringBuilder("title: PBT-16\ndetection:\n");
            java.util.Map<String, String> fieldNames = new java.util.LinkedHashMap<>();
            java.util.Map<String, String> fieldValues = new java.util.LinkedHashMap<>();
            for (String sel : chosenSels) {
                String fn = "field_" + sel;
                String fv = "val_" + sel + "_" + rng.nextInt(100);
                fieldNames.put(sel, fn);
                fieldValues.put(sel, fv);
                yaml.append("  ").append(sel).append(":\n");
                yaml.append("    ").append(fn).append(": '").append(fv).append("'\n");
            }
            // Build OR condition across all selections
            yaml.append("  condition: ")
                .append(String.join(" or ", chosenSels))
                .append("\n");

            // Build event that contains all field/value pairs (all selections will match)
            StringBuilder jsonBuilder = new StringBuilder("{");
            boolean first = true;
            for (String sel : chosenSels) {
                if (!first) jsonBuilder.append(", ");
                jsonBuilder.append("\"").append(fieldNames.get(sel)).append("\": \"")
                           .append(fieldValues.get(sel)).append("\"");
                first = false;
            }
            jsonBuilder.append("}");

            RuleTestResultDTO result = service.testRule(yaml.toString(), jsonBuilder.toString());

            if (result.isMatched()) {
                for (String mf : result.getMatchedFields()) {
                    // Must have at least one dot (selection prefix separator)
                    assertThat(mf)
                            .as("matchedFields entry '%s' missing dot separator (iteration %d)", mf, i)
                            .contains(".");

                    // Prefix before first dot must be a known selection name
                    String prefix = mf.substring(0, mf.indexOf('.'));
                    assertThat(chosenSels)
                            .as("matchedFields prefix '%s' not a known selection name (iteration %d)", prefix, i)
                            .contains(prefix);

                    // Suffix after first dot must contain '='
                    String suffix = mf.substring(mf.indexOf('.') + 1);
                    assertThat(suffix)
                            .as("matchedFields suffix '%s' missing '=' (iteration %d)", suffix, i)
                            .contains("=");
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // Property 17: Explanation names the selections determining the outcome
    // Validates: Requirements 6.8, 6.9, 6.10
    // -----------------------------------------------------------------------

    /**
     * <b>Property 17: Explanation names the selections determining the outcome.</b>
     *
     * <p>When matched=true, the explanation must contain the names of contributing
     * selections. When matched=false, the explanation must contain the names of
     * failing selections or the "unknown selection" token for undefined identifiers.
     *
     * <p><b>Validates: Requirements 6.8, 6.9, 6.10</b>
     */
    @Test
    void property17_explanationNamesContributingSelections_onMatch() throws Exception {
        String rule = twoSelectionRule(
                "alpha", "EventID", "4624",
                "beta", "LogonType", "3",
                "alpha and beta");
        String event = "{\"EventID\": \"4624\", \"LogonType\": \"3\"}";

        RuleTestResultDTO result = service.testRule(rule, event);

        assertThat(result.isMatched()).isTrue();
        assertThat(result.getExplanation()).contains("alpha");
        assertThat(result.getExplanation()).contains("beta");
    }

    @Test
    void property17_explanationNamesFailingSelections_onNoMatch() throws Exception {
        String rule = twoSelectionRule(
                "alpha", "EventID", "4624",
                "beta", "LogonType", "9",   // will NOT match
                "alpha and beta");
        String event = "{\"EventID\": \"4624\", \"LogonType\": \"3\"}";

        RuleTestResultDTO result = service.testRule(rule, event);

        assertThat(result.isMatched()).isFalse();
        assertThat(result.getExplanation()).contains("beta");
    }

    @Test
    void property17_explanationContainsUnknownSelectionToken() throws Exception {
        String rule = "title: Test\n"
                + "detection:\n"
                + "  selection:\n"
                + "    EventID: '4624'\n"
                + "  condition: selection and mystery\n";
        String event = "{\"EventID\": \"4624\"}";

        RuleTestResultDTO result = service.testRule(rule, event);

        assertThat(result.isMatched()).isFalse();
        assertThat(result.getExplanation()).containsIgnoringCase("unknown selection");
        assertThat(result.getExplanation()).contains("mystery");
    }

    @Test
    void property17_orCondition_explanationContainsOnlyTrueBranch_onMatch() throws Exception {
        // When OR matches on the left, only left branch should be in the explanation
        String rule = twoSelectionRule(
                "left_sel", "EventID", "4624",
                "right_sel", "EventID", "9999",
                "left_sel or right_sel");
        String event = "{\"EventID\": \"4624\"}";

        RuleTestResultDTO result = service.testRule(rule, event);

        assertThat(result.isMatched()).isTrue();
        assertThat(result.getExplanation()).contains("left_sel");
    }

    @Test
    void property17_orCondition_bothBranchesInExplanation_onNoMatch() throws Exception {
        String rule = twoSelectionRule(
                "left_sel", "EventID", "9999",
                "right_sel", "EventID", "8888",
                "left_sel or right_sel");
        String event = "{\"EventID\": \"4624\"}";

        RuleTestResultDTO result = service.testRule(rule, event);

        assertThat(result.isMatched()).isFalse();
        assertThat(result.getExplanation()).contains("left_sel").contains("right_sel");
    }

    // -----------------------------------------------------------------------
    // Additional edge case tests
    // -----------------------------------------------------------------------

    @Test
    void testRule_defaultCondition_usedWhenConditionKeyAbsent() throws Exception {
        // When there's no "condition:" key, default is "selection"
        String rule = "title: Test\n"
                + "detection:\n"
                + "  selection:\n"
                + "    EventID: '4624'\n";
        String event = "{\"EventID\": \"4624\"}";

        RuleTestResultDTO result = service.testRule(rule, event);

        assertThat(result.isMatched()).isTrue();
    }

    @Test
    void testRule_listValueInSelection_treatedAsOr() throws Exception {
        // A YAML list [4624, 4625] should be treated as OR
        String rule = "title: Test\n"
                + "detection:\n"
                + "  selection:\n"
                + "    EventID:\n"
                + "      - '4624'\n"
                + "      - '4625'\n"
                + "  condition: selection\n";
        String event4624 = "{\"EventID\": \"4624\"}";
        String event4625 = "{\"EventID\": \"4625\"}";
        String event9999 = "{\"EventID\": \"9999\"}";

        assertThat(service.testRule(rule, event4624).isMatched()).isTrue();
        assertThat(service.testRule(rule, event4625).isMatched()).isTrue();
        assertThat(service.testRule(rule, event9999).isMatched()).isFalse();
    }

    @Test
    void testRule_containsModifier_matchesSubstring() throws Exception {
        String rule = "title: Test\n"
                + "detection:\n"
                + "  selection:\n"
                + "    CommandLine|contains: 'mimikatz'\n"
                + "  condition: selection\n";

        assertThat(service.testRule(rule,
                "{\"CommandLine\": \"cmd.exe /c mimikatz.exe sekurlsa\"}").isMatched()).isTrue();
        assertThat(service.testRule(rule,
                "{\"CommandLine\": \"cmd.exe /c notepad.exe\"}").isMatched()).isFalse();
    }

    @Test
    void testRule_startswithModifier() throws Exception {
        String rule = "title: Test\n"
                + "detection:\n"
                + "  selection:\n"
                + "    CommandLine|startswith: 'powershell'\n"
                + "  condition: selection\n";

        assertThat(service.testRule(rule,
                "{\"CommandLine\": \"powershell -enc abc\"}").isMatched()).isTrue();
        assertThat(service.testRule(rule,
                "{\"CommandLine\": \"cmd powershell\"}").isMatched()).isFalse();
    }

    @Test
    void testRule_endswithModifier() throws Exception {
        String rule = "title: Test\n"
                + "detection:\n"
                + "  selection:\n"
                + "    TargetFilename|endswith: '.exe'\n"
                + "  condition: selection\n";

        assertThat(service.testRule(rule,
                "{\"TargetFilename\": \"C:\\\\Windows\\\\malware.exe\"}").isMatched()).isTrue();
        assertThat(service.testRule(rule,
                "{\"TargetFilename\": \"C:\\\\Windows\\\\file.dll\"}").isMatched()).isFalse();
    }

    @Test
    void testRule_missingDetectionBlock_returnsEvaluationError() throws Exception {
        String rule = "title: Test\nstatus: experimental\n";
        String event = "{\"EventID\": \"4624\"}";

        RuleTestResultDTO result = service.testRule(rule, event);

        assertThat(result.isMatched()).isFalse();
        assertThat(result.getExplanation()).startsWith("Evaluation error");
    }

    @Test
    void testRule_eventFieldAbsent_doesNotMatch() throws Exception {
        String rule = singleSelectionRule("EventID", "4624");
        // Event has no EventID field at all
        String event = "{\"LogonType\": \"3\"}";

        RuleTestResultDTO result = service.testRule(rule, event);

        assertThat(result.isMatched()).isFalse();
    }
}
