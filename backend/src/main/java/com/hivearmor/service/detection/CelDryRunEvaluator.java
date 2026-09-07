package com.hivearmor.service.detection;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

/**
 * Approximate in-process evaluator for HiveArmor detection expressions
 * ({@code equals}, {@code contains}, {@code oneOf}, {@code startsWith},
 * {@code endsWith}, boolean {@code &&}/{@code ||}/{@code !}).
 *
 * <p>This is <strong>not</strong> the Go CEL engine used by event-processor.
 * Honesty metadata always reports {@code evaluationMode=inject_dry_run},
 * {@code openSearchQueried=false}, {@code engineParity=approximate}.
 *
 * <p>DET-TEST-001 — STAGING CANDIDATE.
 */
public final class CelDryRunEvaluator {

    public static final String EVALUATION_MODE = "inject_dry_run";
    public static final String ENGINE_PARITY = "approximate";

    private CelDryRunEvaluator() {}

    /**
     * Result of an inject dry-run evaluation.
     */
    public record DryRunResult(
        boolean matched,
        List<String> matchedFields,
        String explanation,
        long durationMs,
        String evaluationMode,
        boolean openSearchQueried,
        String engineParity,
        boolean syntaxOk
    ) {
        public Map<String, Object> honestyMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("evaluationMode", evaluationMode);
            m.put("openSearchQueried", openSearchQueried);
            m.put("engineParity", engineParity);
            return m;
        }
    }

    /**
     * Evaluates a CEL-like expression against an injectable event map.
     *
     * @param expression rule expression (may be blank)
     * @param event      sample event (nested or flat map); null treated as empty
     */
    public static DryRunResult evaluate(String expression, Map<String, Object> event) {
        long start = System.currentTimeMillis();
        Map<String, Object> data = event != null ? event : Collections.emptyMap();

        if (expression == null || expression.isBlank()) {
            return result(false, List.of(), "No expression to evaluate", start, false);
        }

        try {
            Parser parser = new Parser(expression.trim(), data);
            EvalOutcome outcome = parser.parseExpression();
            parser.expectEof();
            long duration = System.currentTimeMillis() - start;
            String explanation = outcome.matched()
                ? "Inject dry-run matched. Contributing fields: " + outcome.matchedFields()
                : "Inject dry-run did not match. " + outcome.detail();
            return new DryRunResult(
                outcome.matched(),
                List.copyOf(outcome.matchedFields()),
                explanation,
                duration,
                EVALUATION_MODE,
                false,
                ENGINE_PARITY,
                true
            );
        } catch (ParseException e) {
            return result(false, List.of(),
                "Expression parse/evaluation error: " + e.getMessage(), start, false);
        } catch (RuntimeException e) {
            return result(false, List.of(),
                "Evaluation error: " + e.getMessage(), start, false);
        }
    }

    private static DryRunResult result(boolean matched, List<String> fields, String explanation,
                                       long start, boolean syntaxOk) {
        return new DryRunResult(
            matched,
            fields,
            explanation,
            System.currentTimeMillis() - start,
            EVALUATION_MODE,
            false,
            ENGINE_PARITY,
            syntaxOk
        );
    }

    // =========================================================================
    // Field resolution
    // =========================================================================

    static Object resolveField(Map<String, Object> event, String path) {
        if (event == null || path == null || path.isBlank()) {
            return null;
        }
        // Prefer exact key (flattened dotted keys used by some payloads)
        if (event.containsKey(path)) {
            return event.get(path);
        }
        String[] parts = path.split("\\.");
        Object current = event;
        for (String part : parts) {
            if (!(current instanceof Map<?, ?> map)) {
                return null;
            }
            if (!map.containsKey(part)) {
                return null;
            }
            current = map.get(part);
        }
        return current;
    }

    static String asString(Object value) {
        if (value == null) {
            return null;
        }
        return String.valueOf(value);
    }

    static boolean softEquals(Object actual, Object expected) {
        if (actual == null && expected == null) {
            return true;
        }
        if (actual == null || expected == null) {
            return false;
        }
        if (actual instanceof Number aNum && expected instanceof Number eNum) {
            return Double.compare(aNum.doubleValue(), eNum.doubleValue()) == 0;
        }
        if (actual instanceof Boolean || expected instanceof Boolean) {
            return Objects.equals(Boolean.valueOf(String.valueOf(actual)),
                Boolean.valueOf(String.valueOf(expected)));
        }
        return Objects.equals(String.valueOf(actual), String.valueOf(expected));
    }

    // =========================================================================
    // Parser
    // =========================================================================

    private record EvalOutcome(boolean matched, List<String> matchedFields, String detail) {}

    private static final class ParseException extends RuntimeException {
        ParseException(String message) {
            super(message);
        }
    }

    private enum TokenType {
        AND, OR, NOT, LPAREN, RPAREN, LBRACK, RBRACK, COMMA,
        STRING, NUMBER, BOOLEAN, IDENT, EOF
    }

    private record Token(TokenType type, String text) {}

    private static final class Lexer {
        private final String input;
        private int pos;

        Lexer(String input) {
            this.input = input;
        }

        Token next() {
            skipWhitespace();
            if (pos >= input.length()) {
                return new Token(TokenType.EOF, "");
            }
            char c = input.charAt(pos);
            if (c == '&' && peek() == '&') {
                pos += 2;
                return new Token(TokenType.AND, "&&");
            }
            if (c == '|' && peek() == '|') {
                pos += 2;
                return new Token(TokenType.OR, "||");
            }
            if (c == '!') {
                pos++;
                return new Token(TokenType.NOT, "!");
            }
            if (c == '(') {
                pos++;
                return new Token(TokenType.LPAREN, "(");
            }
            if (c == ')') {
                pos++;
                return new Token(TokenType.RPAREN, ")");
            }
            if (c == '[') {
                pos++;
                return new Token(TokenType.LBRACK, "[");
            }
            if (c == ']') {
                pos++;
                return new Token(TokenType.RBRACK, "]");
            }
            if (c == ',') {
                pos++;
                return new Token(TokenType.COMMA, ",");
            }
            if (c == '"' || c == '\'') {
                return readString(c);
            }
            if (Character.isDigit(c) || (c == '-' && Character.isDigit(peek()))) {
                return readNumber();
            }
            if (Character.isLetter(c) || c == '_') {
                return readIdentOrBoolean();
            }
            throw new ParseException("Unexpected character '" + c + "' at position " + pos);
        }

        private char peek() {
            return pos + 1 < input.length() ? input.charAt(pos + 1) : '\0';
        }

        private void skipWhitespace() {
            while (pos < input.length() && Character.isWhitespace(input.charAt(pos))) {
                pos++;
            }
        }

        private Token readString(char quote) {
            pos++; // consume opening quote
            StringBuilder sb = new StringBuilder();
            while (pos < input.length()) {
                char c = input.charAt(pos++);
                if (c == '\\' && pos < input.length()) {
                    sb.append(input.charAt(pos++));
                    continue;
                }
                if (c == quote) {
                    return new Token(TokenType.STRING, sb.toString());
                }
                sb.append(c);
            }
            throw new ParseException("Unterminated string literal");
        }

        private Token readNumber() {
            int start = pos;
            if (input.charAt(pos) == '-') {
                pos++;
            }
            while (pos < input.length() && (Character.isDigit(input.charAt(pos)) || input.charAt(pos) == '.')) {
                pos++;
            }
            return new Token(TokenType.NUMBER, input.substring(start, pos));
        }

        private Token readIdentOrBoolean() {
            int start = pos;
            while (pos < input.length()) {
                char c = input.charAt(pos);
                if (Character.isLetterOrDigit(c) || c == '_') {
                    pos++;
                } else {
                    break;
                }
            }
            String text = input.substring(start, pos);
            if ("true".equalsIgnoreCase(text) || "false".equalsIgnoreCase(text)) {
                return new Token(TokenType.BOOLEAN, text.toLowerCase(Locale.ROOT));
            }
            return new Token(TokenType.IDENT, text);
        }
    }

    private static final class Parser {
        private final Lexer lexer;
        private final Map<String, Object> event;
        private Token current;

        Parser(String expression, Map<String, Object> event) {
            this.lexer = new Lexer(expression);
            this.event = event;
            this.current = lexer.next();
        }

        EvalOutcome parseExpression() {
            return parseOr();
        }

        void expectEof() {
            if (current.type != TokenType.EOF) {
                throw new ParseException("Unexpected token after expression: " + current.text);
            }
        }

        private EvalOutcome parseOr() {
            EvalOutcome left = parseAnd();
            while (current.type == TokenType.OR) {
                advance();
                EvalOutcome right = parseAnd();
                List<String> fields = new ArrayList<>(left.matchedFields());
                fields.addAll(right.matchedFields());
                boolean matched = left.matched() || right.matched();
                left = new EvalOutcome(matched, fields,
                    matched ? "OR matched" : "OR both sides false");
            }
            return left;
        }

        private EvalOutcome parseAnd() {
            EvalOutcome left = parseNot();
            while (current.type == TokenType.AND) {
                advance();
                EvalOutcome right = parseNot();
                List<String> fields = new ArrayList<>();
                if (left.matched()) {
                    fields.addAll(left.matchedFields());
                }
                if (right.matched()) {
                    fields.addAll(right.matchedFields());
                }
                boolean matched = left.matched() && right.matched();
                left = new EvalOutcome(matched, fields,
                    matched ? "AND matched" : "AND failed ("
                        + (!left.matched() ? "left" : "right") + ")");
            }
            return left;
        }

        private EvalOutcome parseNot() {
            if (current.type == TokenType.NOT) {
                advance();
                EvalOutcome inner = parseNot();
                return new EvalOutcome(!inner.matched(), List.of(),
                    inner.matched() ? "NOT of true" : "NOT of false");
            }
            return parsePrimary();
        }

        private EvalOutcome parsePrimary() {
            if (current.type == TokenType.LPAREN) {
                advance();
                EvalOutcome inner = parseOr();
                expect(TokenType.RPAREN, ")");
                return inner;
            }
            if (current.type == TokenType.BOOLEAN) {
                boolean v = Boolean.parseBoolean(current.text);
                advance();
                return new EvalOutcome(v, List.of(), "literal " + v);
            }
            if (current.type == TokenType.IDENT) {
                return parseFunctionCall();
            }
            throw new ParseException("Expected expression, got '" + current.text + "'");
        }

        private EvalOutcome parseFunctionCall() {
            String name = current.text;
            advance();
            expect(TokenType.LPAREN, "(");
            List<Object> args = new ArrayList<>();
            if (current.type != TokenType.RPAREN) {
                args.add(parseArg());
                while (current.type == TokenType.COMMA) {
                    advance();
                    args.add(parseArg());
                }
            }
            expect(TokenType.RPAREN, ")");
            return invoke(name, args);
        }

        private Object parseArg() {
            if (current.type == TokenType.STRING) {
                String v = current.text;
                advance();
                return v;
            }
            if (current.type == TokenType.NUMBER) {
                String text = current.text;
                advance();
                if (text.contains(".")) {
                    return Double.parseDouble(text);
                }
                try {
                    return Long.parseLong(text);
                } catch (NumberFormatException e) {
                    return Double.parseDouble(text);
                }
            }
            if (current.type == TokenType.BOOLEAN) {
                boolean v = Boolean.parseBoolean(current.text);
                advance();
                return v;
            }
            if (current.type == TokenType.LBRACK) {
                return parseList();
            }
            throw new ParseException("Expected argument, got '" + current.text + "'");
        }

        private List<Object> parseList() {
            expect(TokenType.LBRACK, "[");
            List<Object> items = new ArrayList<>();
            if (current.type != TokenType.RBRACK) {
                items.add(parseArg());
                while (current.type == TokenType.COMMA) {
                    advance();
                    items.add(parseArg());
                }
            }
            expect(TokenType.RBRACK, "]");
            return items;
        }

        private EvalOutcome invoke(String name, List<Object> args) {
            String fn = name.toLowerCase(Locale.ROOT);
            return switch (fn) {
                case "equals" -> evalEquals(args, false);
                case "equalsignorecase" -> evalEquals(args, true);
                case "contains" -> evalContains(args);
                case "oneof" -> evalOneOf(args);
                case "startswith" -> evalAffix(args, true);
                case "endswith" -> evalAffix(args, false);
                case "exists" -> evalExists(args);
                default -> throw new ParseException(
                    "Unsupported function '" + name + "' in inject dry-run "
                        + "(engineParity=approximate; full Go CEL helpers not available)");
            };
        }

        private EvalOutcome evalEquals(List<Object> args, boolean ignoreCase) {
            requireArity(args, 2, ignoreCase ? "equalsIgnoreCase" : "equals");
            String field = String.valueOf(args.get(0));
            Object expected = args.get(1);
            Object actual = resolveField(event, field);
            boolean matched;
            if (ignoreCase) {
                String a = asString(actual);
                String e = asString(expected);
                matched = a != null && e != null && a.equalsIgnoreCase(e);
            } else {
                matched = softEquals(actual, expected);
            }
            return new EvalOutcome(matched,
                matched ? List.of(field) : List.of(),
                matched ? field + " equals " + expected
                    : field + "='" + asString(actual) + "' does not equal " + expected);
        }

        private EvalOutcome evalContains(List<Object> args) {
            requireArity(args, 2, "contains");
            String field = String.valueOf(args.get(0));
            Object needleArg = args.get(1);
            String haystack = asString(resolveField(event, field));
            boolean matched = false;
            if (haystack != null) {
                if (needleArg instanceof List<?> list) {
                    for (Object item : list) {
                        if (haystack.contains(String.valueOf(item))) {
                            matched = true;
                            break;
                        }
                    }
                } else {
                    matched = haystack.contains(String.valueOf(needleArg));
                }
            }
            return new EvalOutcome(matched,
                matched ? List.of(field) : List.of(),
                matched ? field + " contains " + needleArg
                    : field + " does not contain " + needleArg);
        }

        @SuppressWarnings("unchecked")
        private EvalOutcome evalOneOf(List<Object> args) {
            requireArity(args, 2, "oneOf");
            String field = String.valueOf(args.get(0));
            Object listArg = args.get(1);
            if (!(listArg instanceof List<?> candidates)) {
                throw new ParseException("oneOf second argument must be a list");
            }
            Object actual = resolveField(event, field);
            boolean matched = false;
            for (Object candidate : candidates) {
                if (softEquals(actual, candidate)) {
                    matched = true;
                    break;
                }
            }
            return new EvalOutcome(matched,
                matched ? List.of(field) : List.of(),
                matched ? field + " oneOf " + candidates
                    : field + "='" + asString(actual) + "' not in " + candidates);
        }

        private EvalOutcome evalAffix(List<Object> args, boolean starts) {
            String fn = starts ? "startsWith" : "endsWith";
            requireArity(args, 2, fn);
            String field = String.valueOf(args.get(0));
            String prefix = String.valueOf(args.get(1));
            String actual = asString(resolveField(event, field));
            boolean matched = actual != null && (starts ? actual.startsWith(prefix) : actual.endsWith(prefix));
            return new EvalOutcome(matched,
                matched ? List.of(field) : List.of(),
                matched ? field + " " + fn + " " + prefix
                    : field + " does not " + fn + " " + prefix);
        }

        private EvalOutcome evalExists(List<Object> args) {
            requireArity(args, 1, "exists");
            String field = String.valueOf(args.get(0));
            Object actual = resolveField(event, field);
            boolean matched = actual != null;
            return new EvalOutcome(matched,
                matched ? List.of(field) : List.of(),
                matched ? field + " exists" : field + " does not exist");
        }

        private void requireArity(List<Object> args, int expected, String fn) {
            if (args.size() != expected) {
                throw new ParseException(fn + " expects " + expected + " argument(s), got " + args.size());
            }
        }

        private void expect(TokenType type, String display) {
            if (current.type != type) {
                throw new ParseException("Expected '" + display + "', got '" + current.text + "'");
            }
            advance();
        }

        private void advance() {
            current = lexer.next();
        }
    }
}
