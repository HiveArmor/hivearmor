package com.hivearmor.service.hunt;

import java.util.ArrayList;
import java.util.List;

/**
 * Parses a KQL-like (Kibana Query Language) grammar for the alert queue free-text
 * search parameter {@code q}.
 *
 * <p>Supported grammar:
 * <ul>
 *   <li>Boolean operators: AND, OR, NOT (case-insensitive)</li>
 *   <li>Quoted phrases: {@code "exact phrase"}</li>
 *   <li>Field:value syntax: {@code severity:critical}</li>
 *   <li>Wildcards: {@code name:*malware*}</li>
 *   <li>Grouping with parentheses: {@code (a OR b) AND c}</li>
 * </ul>
 *
 * <p>The parser produces an AST that is then translated into an OpenSearch
 * query_string-compatible expression. Max query length: 1024 chars.
 */
public class HaAlertKqlParser {

    /** Maximum allowed query length in characters. */
    public static final int MAX_QUERY_LENGTH = 1024;

    private final String input;
    private int pos;

    public HaAlertKqlParser(String input) {
        this.input = input;
        this.pos = 0;
    }

    /**
     * Parses the input and returns the root AST node.
     *
     * @throws KqlParseException if the input cannot be parsed
     */
    public KqlNode parse() {
        if (input == null || input.isBlank()) {
            return new KqlNode(KqlNode.Type.MATCH_ALL, "*");
        }
        if (input.length() > MAX_QUERY_LENGTH) {
            throw new KqlParseException(MAX_QUERY_LENGTH,
                "Query exceeds maximum length of " + MAX_QUERY_LENGTH + " characters",
                List.of());
        }

        KqlNode result = parseExpression();
        skipWhitespace();
        if (pos < input.length()) {
            throw new KqlParseException(pos,
                "Unexpected token at position " + pos,
                List.of("AND", "OR", "NOT", "EOF"));
        }
        return result;
    }

    /**
     * Converts a parsed KQL AST node into an OpenSearch query_string expression.
     */
    public static String toQueryString(KqlNode node) {
        if (node == null) return "*";

        switch (node.type) {
            case MATCH_ALL:
                return "*";
            case TERM:
                return escapeTerm(node.value);
            case PHRASE:
                return "\"" + node.value + "\"";
            case FIELD_VALUE:
                if (node.value.contains("*")) {
                    return node.field + ":" + node.value;
                }
                return node.field + ":" + escapeTerm(node.value);
            case FIELD_PHRASE:
                return node.field + ":\"" + node.value + "\"";
            case AND:
                return "(" + toQueryString(node.left) + " AND " + toQueryString(node.right) + ")";
            case OR:
                return "(" + toQueryString(node.left) + " OR " + toQueryString(node.right) + ")";
            case NOT:
                return "(NOT " + toQueryString(node.left) + ")";
            default:
                return "*";
        }
    }

    // =========================================================================
    // Grammar: expression = orExpression
    // =========================================================================

    private KqlNode parseExpression() {
        return parseOr();
    }

    private KqlNode parseOr() {
        KqlNode left = parseAnd();
        while (true) {
            skipWhitespace();
            if (matchKeyword("OR")) {
                KqlNode right = parseAnd();
                left = new KqlNode(KqlNode.Type.OR, left, right);
            } else {
                break;
            }
        }
        return left;
    }

    private KqlNode parseAnd() {
        KqlNode left = parseUnary();
        while (true) {
            skipWhitespace();
            if (matchKeyword("AND")) {
                KqlNode right = parseUnary();
                left = new KqlNode(KqlNode.Type.AND, left, right);
            } else {
                break;
            }
        }
        return left;
    }

    private KqlNode parseUnary() {
        skipWhitespace();
        if (matchKeyword("NOT")) {
            KqlNode operand = parseUnary();
            return new KqlNode(KqlNode.Type.NOT, operand, null);
        }
        return parsePrimary();
    }

    private KqlNode parsePrimary() {
        skipWhitespace();
        if (pos >= input.length()) {
            throw new KqlParseException(pos,
                "Unexpected end of query",
                List.of("term", "\"phrase\"", "field:value", "("));
        }

        char c = input.charAt(pos);

        // Grouping with parentheses
        if (c == '(') {
            pos++;
            KqlNode inner = parseExpression();
            skipWhitespace();
            if (pos >= input.length() || input.charAt(pos) != ')') {
                throw new KqlParseException(pos,
                    "Expected closing parenthesis",
                    List.of(")"));
            }
            pos++;
            return inner;
        }

        // Quoted phrase
        if (c == '"') {
            return parseQuotedPhrase(null);
        }

        // Term or field:value
        return parseTermOrField();
    }

    private KqlNode parseQuotedPhrase(String field) {
        pos++; // skip opening quote
        int start = pos;
        while (pos < input.length() && input.charAt(pos) != '"') {
            pos++;
        }
        if (pos >= input.length()) {
            throw new KqlParseException(pos,
                "Unterminated quoted phrase",
                List.of("\""));
        }
        String phrase = input.substring(start, pos);
        pos++; // skip closing quote

        if (field != null) {
            return new KqlNode(KqlNode.Type.FIELD_PHRASE, field, phrase);
        }
        return new KqlNode(KqlNode.Type.PHRASE, phrase);
    }

    private KqlNode parseTermOrField() {
        int start = pos;
        // Read until whitespace, colon, quote, paren, or end
        while (pos < input.length()) {
            char c = input.charAt(pos);
            if (c == ':' || c == ' ' || c == '\t' || c == '(' || c == ')' || c == '"') {
                break;
            }
            pos++;
        }

        String token = input.substring(start, pos);
        if (token.isEmpty()) {
            throw new KqlParseException(pos,
                "Expected term or field name",
                List.of("term", "field:value"));
        }

        // Check if this is a field:value pattern
        if (pos < input.length() && input.charAt(pos) == ':') {
            pos++; // skip colon
            String field = token;
            skipWhitespace();

            // Value can be quoted or unquoted
            if (pos < input.length() && input.charAt(pos) == '"') {
                return parseQuotedPhrase(field);
            }

            // Read unquoted value (may contain wildcards)
            int valueStart = pos;
            while (pos < input.length()) {
                char c = input.charAt(pos);
                if (c == ' ' || c == '\t' || c == '(' || c == ')') {
                    break;
                }
                pos++;
            }
            String value = input.substring(valueStart, pos);
            if (value.isEmpty()) {
                throw new KqlParseException(pos,
                    "Expected value after field '" + field + ":'",
                    List.of("value", "\"quoted value\"", "*wildcard*"));
            }
            return new KqlNode(KqlNode.Type.FIELD_VALUE, field, value);
        }

        // Check if token is a boolean keyword that should be treated as implicit AND
        // e.g., "term1 term2" is "term1 AND term2"
        return new KqlNode(KqlNode.Type.TERM, token);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private void skipWhitespace() {
        while (pos < input.length() && (input.charAt(pos) == ' ' || input.charAt(pos) == '\t')) {
            pos++;
        }
    }

    /**
     * Attempts to match a keyword (case-insensitive) followed by whitespace or end.
     * Only consumes the keyword if it is followed by a word boundary.
     */
    private boolean matchKeyword(String keyword) {
        int saved = pos;
        if (pos + keyword.length() > input.length()) return false;

        String candidate = input.substring(pos, pos + keyword.length());
        if (!candidate.equalsIgnoreCase(keyword)) return false;

        // Must be followed by whitespace, paren, quote, or end of input (word boundary)
        int after = pos + keyword.length();
        if (after < input.length()) {
            char next = input.charAt(after);
            if (next != ' ' && next != '\t' && next != '(' && next != '"') {
                return false;
            }
        }

        pos = after;
        return true;
    }

    private static String escapeTerm(String term) {
        // Escape special Lucene characters except wildcards
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < term.length(); i++) {
            char c = term.charAt(i);
            // Allow wildcards through
            if (c == '*' || c == '?') {
                sb.append(c);
                continue;
            }
            // Escape Lucene special chars
            if ("+-&|!(){}[]^\"~:\\/ ".indexOf(c) >= 0) {
                sb.append('\\');
            }
            sb.append(c);
        }
        return sb.toString();
    }

    // =========================================================================
    // AST Node
    // =========================================================================

    public static class KqlNode {
        public enum Type {
            MATCH_ALL, TERM, PHRASE, FIELD_VALUE, FIELD_PHRASE, AND, OR, NOT
        }

        public final Type type;
        public final String value;
        public final String field;
        public final KqlNode left;
        public final KqlNode right;

        /** Leaf node: MATCH_ALL, TERM, PHRASE */
        public KqlNode(Type type, String value) {
            this.type = type;
            this.value = value;
            this.field = null;
            this.left = null;
            this.right = null;
        }

        /** Field-value node: FIELD_VALUE, FIELD_PHRASE */
        public KqlNode(Type type, String field, String value) {
            this.type = type;
            this.field = field;
            this.value = value;
            this.left = null;
            this.right = null;
        }

        /** Binary node: AND, OR; or unary: NOT (right=null) */
        public KqlNode(Type type, KqlNode left, KqlNode right) {
            this.type = type;
            this.left = left;
            this.right = right;
            this.value = null;
            this.field = null;
        }
    }

    // =========================================================================
    // Parse Exception
    // =========================================================================

    public static class KqlParseException extends RuntimeException {
        private final int offset;
        private final List<String> expectedTokens;

        public KqlParseException(int offset, String message, List<String> expectedTokens) {
            super(message);
            this.offset = offset;
            this.expectedTokens = expectedTokens != null ? expectedTokens : new ArrayList<>();
        }

        public int getOffset() {
            return offset;
        }

        public List<String> getExpectedTokens() {
            return expectedTokens;
        }
    }
}
