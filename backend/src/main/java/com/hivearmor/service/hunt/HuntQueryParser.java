package com.hivearmor.service.hunt;

import org.opensearch.client.json.JsonData;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Bounded KQL-compatible hunt parser that emits typed OpenSearch DSL.
 *
 * <p>Supported syntax intentionally matches the advertised capability contract: field equality,
 * inequality and comparisons, quoted strings, bounded wildcards, EXISTS, parentheses, and
 * AND/OR/NOT with AND precedence over OR. No raw query-string fragments reach OpenSearch.
 */
@Component
public class HuntQueryParser {

    public static final int MAX_QUERY_LENGTH = 4096;
    public static final int MAX_CLAUSES = 64;
    public static final int MAX_DEPTH = 8;

    private final HuntFieldRegistry fieldRegistry;

    public HuntQueryParser(HuntFieldRegistry fieldRegistry) {
        this.fieldRegistry = fieldRegistry;
    }

    public Query parse(String source) {
        if (source == null || source.isBlank()) {
            throw new HuntQueryException("HUNT_QUERY_REQUIRED", "Query is required; use *:* to load the bounded default view", 0);
        }
        String query = source.trim();
        if (query.length() > MAX_QUERY_LENGTH) {
            throw new HuntQueryException("HUNT_QUERY_TOO_LONG", "Query exceeds " + MAX_QUERY_LENGTH + " characters", MAX_QUERY_LENGTH);
        }
        if ("*:*".equals(query) || "*".equals(query)) {
            return Query.of(q -> q.matchAll(m -> m));
        }
        Parser parser = new Parser(query);
        Query compiled = parser.parseExpression(0);
        parser.expect(TokenType.EOF, "Unexpected trailing input");
        return compiled;
    }

    private final class Parser {
        private final Lexer lexer;
        private Token current;
        private int clauses;

        private Parser(String source) {
            lexer = new Lexer(source);
            current = lexer.next();
        }

        private Query parseExpression(int depth) {
            return parseOr(depth);
        }

        private Query parseOr(int depth) {
            List<Query> alternatives = new ArrayList<>();
            alternatives.add(parseAnd(depth));
            while (match(TokenType.OR)) {
                alternatives.add(parseAnd(depth));
            }
            if (alternatives.size() == 1) return alternatives.get(0);
            countClause(current.offset());
            return Query.of(q -> q.bool(b -> b.should(alternatives).minimumShouldMatch("1")));
        }

        private Query parseAnd(int depth) {
            List<Query> requirements = new ArrayList<>();
            requirements.add(parseUnary(depth));
            while (match(TokenType.AND)) {
                requirements.add(parseUnary(depth));
            }
            if (requirements.size() == 1) return requirements.get(0);
            countClause(current.offset());
            return Query.of(q -> q.bool(b -> b.must(requirements)));
        }

        private Query parseUnary(int depth) {
            if (match(TokenType.NOT)) {
                Query child = parseUnary(depth);
                countClause(current.offset());
                return Query.of(q -> q.bool(b -> b.mustNot(child)));
            }
            if (match(TokenType.LPAREN)) {
                if (depth >= MAX_DEPTH) {
                    throw error("HUNT_QUERY_TOO_DEEP", "Query nesting exceeds " + MAX_DEPTH + " levels", current.offset());
                }
                Query nested = parseExpression(depth + 1);
                expect(TokenType.RPAREN, "Missing closing parenthesis");
                return nested;
            }
            return parseCondition();
        }

        private Query parseCondition() {
            Token left = current;
            if (left.type() != TokenType.VALUE && left.type() != TokenType.STRING) {
                throw error("HUNT_QUERY_EXPECTED_TERM", "Expected a field or search term", left.offset());
            }
            advance();

            TokenType operator = current.type();
            if (!isComparison(operator)) {
                countClause(left.offset());
                return Query.of(q -> q.multiMatch(m -> m
                    .query(left.text())
                    .fields(fieldRegistry.freeTextFields())
                    .lenient(false)));
            }
            advance();

            if (operator == TokenType.COLON && isRangeOperator(current.type())) {
                operator = current.type();
                advance();
            }

            Token value = current;
            if (value.type() != TokenType.VALUE && value.type() != TokenType.STRING) {
                throw error("HUNT_QUERY_EXPECTED_VALUE", "Expected a value after " + left.text(), value.offset());
            }
            advance();

            HuntFieldRegistry.FieldSpec field;
            try {
                field = fieldRegistry.require(left.text());
            } catch (HuntQueryException ex) {
                throw error(ex.getCode(), ex.getMessage(), left.offset());
            }
            countClause(left.offset());
            return compile(field, operator, value);
        }

        private Query compile(HuntFieldRegistry.FieldSpec field, TokenType operator, Token valueToken) {
            String value = valueToken.text();
            if (operator == TokenType.COLON && "EXISTS".equalsIgnoreCase(value)) {
                return Query.of(q -> q.exists(e -> e.field(field.name())));
            }
            if (operator == TokenType.NEQ) {
                Query equals = compileEquality(field, value, valueToken.offset());
                return Query.of(q -> q.bool(b -> b.mustNot(equals)));
            }
            if (isRangeOperator(operator)) {
                if (field.kind() != HuntFieldRegistry.FieldKind.NUMBER && field.kind() != HuntFieldRegistry.FieldKind.DATE) {
                    throw error("HUNT_OPERATOR_NOT_ALLOWED", "Comparison operator is not valid for " + field.name(), valueToken.offset());
                }
                Object typed = typedValue(field, value, valueToken.offset());
                return Query.of(q -> q.range(r -> {
                    r.field(field.name());
                    JsonData data = JsonData.of(typed);
                    return switch (operator) {
                        case GT -> r.gt(data);
                        case GTE -> r.gte(data);
                        case LT -> r.lt(data);
                        case LTE -> r.lte(data);
                        default -> r;
                    };
                }));
            }
            return compileEquality(field, value, valueToken.offset());
        }

        private Query compileEquality(HuntFieldRegistry.FieldSpec field, String value, int offset) {
            if (value.indexOf('*') >= 0 || value.indexOf('?') >= 0) {
                if (field.kind() == HuntFieldRegistry.FieldKind.IP) {
                    String cidr = ipv4WildcardToCidr(value);
                    if (cidr == null) {
                        throw error("HUNT_IP_WILDCARD_UNSUPPORTED", "Use a CIDR or a trailing octet wildcard for IP fields", offset);
                    }
                    return Query.of(q -> q.term(t -> t.field(field.name()).value(FieldValue.of(cidr))));
                }
                if (field.kind() == HuntFieldRegistry.FieldKind.NUMBER
                    || field.kind() == HuntFieldRegistry.FieldKind.DATE
                    || field.kind() == HuntFieldRegistry.FieldKind.BOOLEAN) {
                    throw error("HUNT_WILDCARD_NOT_ALLOWED", "Wildcards are not valid for " + field.name(), offset);
                }
                validateWildcard(value, offset);
                return Query.of(q -> q.wildcard(w -> w.field(field.name()).value(value).caseInsensitive(true)));
            }
            if (field.kind() == HuntFieldRegistry.FieldKind.TEXT) {
                return Query.of(q -> q.matchPhrase(m -> m.field(field.name()).query(value)));
            }
            Object typed = typedValue(field, value, offset);
            return Query.of(q -> q.term(t -> t.field(field.name()).value(toFieldValue(typed))));
        }

        private Object typedValue(HuntFieldRegistry.FieldSpec field, String value, int offset) {
            try {
                return switch (field.kind()) {
                    case NUMBER -> value.contains(".") ? Double.parseDouble(value) : Long.parseLong(value);
                    case BOOLEAN -> {
                        if (!"true".equalsIgnoreCase(value) && !"false".equalsIgnoreCase(value)) {
                            throw new IllegalArgumentException();
                        }
                        yield Boolean.parseBoolean(value);
                    }
                    default -> value;
                };
            } catch (IllegalArgumentException ex) {
                throw error("HUNT_VALUE_TYPE_MISMATCH", "Invalid " + field.kind().name().toLowerCase(Locale.ROOT)
                    + " value for " + field.name(), offset);
            }
        }

        private FieldValue toFieldValue(Object value) {
            if (value instanceof Long number) return FieldValue.of(number);
            if (value instanceof Double number) return FieldValue.of(number);
            if (value instanceof Boolean bool) return FieldValue.of(bool);
            return FieldValue.of(String.valueOf(value));
        }

        private void validateWildcard(String value, int offset) {
            long wildcardCount = value.chars().filter(c -> c == '*' || c == '?').count();
            String literal = value.replace("*", "").replace("?", "");
            if (wildcardCount > 4 || (value.startsWith("*") && literal.length() < 3)) {
                throw error("HUNT_WILDCARD_TOO_BROAD", "Wildcard query is too broad", offset);
            }
        }

        private String ipv4WildcardToCidr(String value) {
            String[] octets = value.split("\\.", -1);
            if (octets.length != 4) return null;
            int fixed = 0;
            StringBuilder address = new StringBuilder();
            boolean wildcardSeen = false;
            for (String octet : octets) {
                if (address.length() > 0) address.append('.');
                if ("*".equals(octet)) {
                    wildcardSeen = true;
                    address.append('0');
                } else {
                    if (wildcardSeen || octet.indexOf('?') >= 0 || octet.indexOf('*') >= 0) return null;
                    int parsed;
                    try { parsed = Integer.parseInt(octet); } catch (NumberFormatException ex) { return null; }
                    if (parsed < 0 || parsed > 255) return null;
                    fixed++;
                    address.append(parsed);
                }
            }
            return wildcardSeen ? address + "/" + (fixed * 8) : null;
        }

        private void countClause(int offset) {
            clauses++;
            if (clauses > MAX_CLAUSES) {
                throw error("HUNT_QUERY_TOO_COMPLEX", "Query exceeds " + MAX_CLAUSES + " clauses", offset);
            }
        }

        private boolean match(TokenType type) {
            if (current.type() != type) return false;
            advance();
            return true;
        }

        private void expect(TokenType type, String message) {
            if (!match(type)) throw error("HUNT_QUERY_SYNTAX", message, current.offset());
        }

        private void advance() {
            current = lexer.next();
        }
    }

    private static boolean isComparison(TokenType type) {
        return type == TokenType.COLON || type == TokenType.NEQ || isRangeOperator(type);
    }

    private static boolean isRangeOperator(TokenType type) {
        return type == TokenType.GT || type == TokenType.GTE || type == TokenType.LT || type == TokenType.LTE;
    }

    private static HuntQueryException error(String code, String message, int offset) {
        return new HuntQueryException(code, message, offset);
    }

    private enum TokenType { VALUE, STRING, COLON, NEQ, GT, GTE, LT, LTE, LPAREN, RPAREN, AND, OR, NOT, EOF }

    private record Token(TokenType type, String text, int offset) {}

    private static final class Lexer {
        private final String source;
        private int offset;

        private Lexer(String source) {
            this.source = source;
        }

        private Token next() {
            while (offset < source.length() && Character.isWhitespace(source.charAt(offset))) offset++;
            if (offset >= source.length()) return new Token(TokenType.EOF, "", offset);
            int start = offset;
            char c = source.charAt(offset++);
            return switch (c) {
                case '(' -> new Token(TokenType.LPAREN, "(", start);
                case ')' -> new Token(TokenType.RPAREN, ")", start);
                case ':' -> new Token(TokenType.COLON, ":", start);
                case '!' -> consumeEquals(TokenType.NEQ, start, "Expected !=");
                case '>' -> optionalEquals(TokenType.GT, TokenType.GTE, start);
                case '<' -> optionalEquals(TokenType.LT, TokenType.LTE, start);
                case '\'', '"' -> quoted(c, start);
                default -> word(start);
            };
        }

        private Token consumeEquals(TokenType type, int start, String message) {
            if (offset < source.length() && source.charAt(offset) == '=') {
                offset++;
                return new Token(type, source.substring(start, offset), start);
            }
            throw error("HUNT_QUERY_SYNTAX", message, start);
        }

        private Token optionalEquals(TokenType plain, TokenType equal, int start) {
            if (offset < source.length() && source.charAt(offset) == '=') {
                offset++;
                return new Token(equal, source.substring(start, offset), start);
            }
            return new Token(plain, source.substring(start, offset), start);
        }

        private Token quoted(char quote, int start) {
            StringBuilder value = new StringBuilder();
            boolean escaped = false;
            while (offset < source.length()) {
                char c = source.charAt(offset++);
                if (escaped) {
                    value.append(c);
                    escaped = false;
                } else if (c == '\\') {
                    escaped = true;
                } else if (c == quote) {
                    return new Token(TokenType.STRING, value.toString(), start);
                } else {
                    value.append(c);
                }
            }
            throw error("HUNT_QUERY_UNTERMINATED_STRING", "Unterminated quoted value", start);
        }

        private Token word(int start) {
            while (offset < source.length()) {
                char c = source.charAt(offset);
                if (Character.isWhitespace(c) || c == '(' || c == ')' || c == ':' || c == '!'
                    || c == '>' || c == '<' || c == '\'' || c == '"') break;
                offset++;
            }
            String value = source.substring(start, offset);
            String keyword = value.toUpperCase(Locale.ROOT);
            return switch (keyword) {
                case "AND" -> new Token(TokenType.AND, value, start);
                case "OR" -> new Token(TokenType.OR, value, start);
                case "NOT" -> new Token(TokenType.NOT, value, start);
                default -> new Token(TokenType.VALUE, value, start);
            };
        }
    }
}
