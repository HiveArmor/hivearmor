package com.hivearmor.service.rulesandbox;

import java.util.List;

/**
 * Recursive-descent parser for the Sigma boolean condition grammar.
 *
 * <p>Grammar (operator precedence highest to lowest: {@code not} → {@code and} → {@code or}):
 * <pre>
 * or_expr   ::= and_expr ( "or"  and_expr )*
 * and_expr  ::= not_expr ( "and" not_expr )*
 * not_expr  ::= "not" not_expr | primary
 * primary   ::= identifier | "(" or_expr ")"
 * </pre>
 *
 * <p>Binary {@code and}/{@code or} nodes are left-associative:
 * {@code A and B and C} produces {@code And(And(A,B),C)}.
 * {@code not} is right-associative: {@code not not x} produces {@code Not(Not(x))}.
 *
 * <p>All parse errors throw {@link IllegalArgumentException} whose message starts
 * with {@code "Evaluation error: ..."} so callers can surface them as evaluation
 * failures without exposing parser internals.
 */
public final class ConditionParser {

    // -----------------------------------------------------------------------
    // State kept per parse invocation (instance is never exposed publicly)
    // -----------------------------------------------------------------------

    private final List<ConditionLexer.Token> tokens;
    private int pos; // index into tokens list

    private ConditionParser(List<ConditionLexer.Token> tokens) {
        this.tokens = tokens;
        this.pos = 0;
    }

    // -----------------------------------------------------------------------
    // Public entry point
    // -----------------------------------------------------------------------

    /**
     * Parses a list of tokens produced by {@link ConditionLexer#tokenize(String)}
     * into a {@link ConditionNode} AST.
     *
     * @param tokens the token list; must end with an {@code EOF} token
     * @return the root of the AST
     * @throws IllegalArgumentException on any parse error (empty input, unexpected
     *         token, unclosed parenthesis); the message always starts with
     *         {@code "Evaluation error: "}
     */
    public static ConditionNode parse(List<ConditionLexer.Token> tokens) {
        if (tokens == null || tokens.isEmpty()) {
            throw new IllegalArgumentException(
                    "Evaluation error: empty input — no tokens to parse");
        }

        ConditionParser parser = new ConditionParser(tokens);

        // Check for empty input (only an EOF token present)
        if (parser.peek().type() == ConditionLexer.Type.EOF) {
            throw new IllegalArgumentException(
                    "Evaluation error: empty condition — no tokens before EOF");
        }

        ConditionNode root = parser.parseOr();

        // After a complete expression there must be nothing left except EOF
        ConditionLexer.Token remaining = parser.peek();
        if (remaining.type() != ConditionLexer.Type.EOF) {
            throw new IllegalArgumentException(
                    "Evaluation error: unexpected token '" + remaining.text()
                    + "' at position " + remaining.position()
                    + " — expected end of input");
        }

        return root;
    }

    // -----------------------------------------------------------------------
    // Grammar productions
    // -----------------------------------------------------------------------

    /**
     * or_expr ::= and_expr ( "or" and_expr )*
     *
     * <p>Left-associative: successive OR operands fold left.
     */
    private ConditionNode parseOr() {
        ConditionNode left = parseAnd();

        while (peek().type() == ConditionLexer.Type.OR) {
            consume(); // eat "or"
            ConditionNode right = parseAnd();
            left = new ConditionNode.Or(left, right);
        }

        return left;
    }

    /**
     * and_expr ::= not_expr ( "and" not_expr )*
     *
     * <p>Left-associative: successive AND operands fold left.
     */
    private ConditionNode parseAnd() {
        ConditionNode left = parseNot();

        while (peek().type() == ConditionLexer.Type.AND) {
            consume(); // eat "and"
            ConditionNode right = parseNot();
            left = new ConditionNode.And(left, right);
        }

        return left;
    }

    /**
     * not_expr ::= "not" not_expr | primary
     *
     * <p>Right-associative via recursion: {@code not not x} → {@code Not(Not(x))}.
     */
    private ConditionNode parseNot() {
        if (peek().type() == ConditionLexer.Type.NOT) {
            consume(); // eat "not"
            ConditionNode child = parseNot(); // recurse for right-associativity
            return new ConditionNode.Not(child);
        }
        return parsePrimary();
    }

    /**
     * primary ::= identifier | "(" or_expr ")"
     */
    private ConditionNode parsePrimary() {
        ConditionLexer.Token token = peek();

        if (token.type() == ConditionLexer.Type.IDENT) {
            consume();
            return new ConditionNode.Ident(token.text());
        }

        if (token.type() == ConditionLexer.Type.LPAREN) {
            consume(); // eat "("
            ConditionNode inner = parseOr();

            ConditionLexer.Token closing = peek();
            if (closing.type() != ConditionLexer.Type.RPAREN) {
                throw new IllegalArgumentException(
                        "Evaluation error: unclosed parenthesis — expected ')'"
                        + " but found '" + closing.text()
                        + "' at position " + closing.position());
            }
            consume(); // eat ")"
            return inner;
        }

        // Anything else is an unexpected token
        if (token.type() == ConditionLexer.Type.EOF) {
            throw new IllegalArgumentException(
                    "Evaluation error: unexpected end of input — expected an identifier"
                    + " or '(' but reached EOF");
        }

        throw new IllegalArgumentException(
                "Evaluation error: unexpected token '" + token.text()
                + "' at position " + token.position()
                + " — expected an identifier or '('");
    }

    // -----------------------------------------------------------------------
    // Cursor helpers
    // -----------------------------------------------------------------------

    /** Returns the current token without advancing the cursor. */
    private ConditionLexer.Token peek() {
        return tokens.get(pos);
    }

    /** Advances the cursor past the current token. */
    private void consume() {
        pos++;
    }
}
