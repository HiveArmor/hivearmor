package com.hivearmor.service.rulesandbox;

import java.util.ArrayList;
import java.util.List;

/**
 * Tokenizer for the Sigma boolean condition grammar.
 *
 * <p>Processes a single-pass left-to-right scan of the condition string and
 * produces a flat list of typed tokens. Reserved keywords {@code and}, {@code or},
 * and {@code not} are recognised case-insensitively but only when they are not
 * surrounded by identifier characters — e.g. {@code notify} stays a single IDENT.
 *
 * <p>Grammar tokens produced:
 * <ul>
 *   <li>{@code AND} — the keyword {@code and} (case-insensitive, standalone)</li>
 *   <li>{@code OR}  — the keyword {@code or}  (case-insensitive, standalone)</li>
 *   <li>{@code NOT} — the keyword {@code not} (case-insensitive, standalone)</li>
 *   <li>{@code LPAREN} — literal {@code (}</li>
 *   <li>{@code RPAREN} — literal {@code )}</li>
 *   <li>{@code IDENT}  — an identifier {@code [A-Za-z_][A-Za-z0-9_]*} (greedy)</li>
 *   <li>{@code EOF}    — synthetic end-of-input sentinel</li>
 * </ul>
 */
public final class ConditionLexer {

    /** The set of token types the lexer can produce. */
    public enum Type {
        AND, OR, NOT, LPAREN, RPAREN, IDENT, EOF
    }

    /** An immutable lexer token carrying its type, raw text, and source position. */
    public record Token(Type type, String text, int position) {
        @Override
        public String toString() {
            return type + "(" + text + ")@" + position;
        }
    }

    // Private — utility class, no instances needed.
    private ConditionLexer() {}

    /**
     * Tokenizes a Sigma boolean condition string.
     *
     * <p>The returned list always ends with an {@link Type#EOF} token. The list
     * is never empty.
     *
     * @param source the condition string, for example {@code "selection and not filter"}
     * @return an ordered list of tokens
     * @throws IllegalArgumentException if the source contains an unexpected
     *         non-whitespace character that cannot start a valid token, carrying the
     *         offending character and its 0-based position in the message
     */
    public static List<Token> tokenize(String source) {
        List<Token> tokens = new ArrayList<>();
        int i = 0;
        int len = (source == null) ? 0 : source.length();

        while (i < len) {
            char c = source.charAt(i);

            // Skip Unicode whitespace
            if (Character.isWhitespace(c)) {
                i++;
                continue;
            }

            // Single-character structural tokens
            if (c == '(') {
                tokens.add(new Token(Type.LPAREN, "(", i));
                i++;
                continue;
            }
            if (c == ')') {
                tokens.add(new Token(Type.RPAREN, ")", i));
                i++;
                continue;
            }

            // Identifier or keyword
            if (isIdentStart(c)) {
                int start = i;
                StringBuilder sb = new StringBuilder();
                while (i < len && isIdentPart(source.charAt(i))) {
                    sb.append(source.charAt(i));
                    i++;
                }
                String word = sb.toString();
                Type kwType = classifyWord(word);
                tokens.add(new Token(kwType, word, start));
                continue;
            }

            // Anything else is a parse error
            throw new IllegalArgumentException(
                    "Evaluation error: unexpected character '" + c + "' at position " + i);
        }

        tokens.add(new Token(Type.EOF, "", len));
        return tokens;
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /**
     * Returns the keyword type for a matched word, or IDENT if it is not a
     * reserved keyword. Matching is case-insensitive.
     */
    private static Type classifyWord(String word) {
        switch (word.toLowerCase()) {
            case "and": return Type.AND;
            case "or":  return Type.OR;
            case "not": return Type.NOT;
            default:    return Type.IDENT;
        }
    }

    /** Returns true if {@code c} is a valid first character of an identifier. */
    private static boolean isIdentStart(char c) {
        return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c == '_';
    }

    /** Returns true if {@code c} can appear inside or at the end of an identifier. */
    private static boolean isIdentPart(char c) {
        return isIdentStart(c) || (c >= '0' && c <= '9');
    }
}
