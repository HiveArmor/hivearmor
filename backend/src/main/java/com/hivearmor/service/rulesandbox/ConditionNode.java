package com.hivearmor.service.rulesandbox;

/**
 * Sealed AST hierarchy for the Sigma boolean condition grammar.
 *
 * <p>Every node type is a {@code record} so that pattern matching via
 * {@code instanceof} or a full {@code switch} expression covers the complete
 * type universe at compile time.
 *
 * <p>Operator precedence (highest first): {@code not} → {@code and} → {@code or}.
 * Left-to-right associativity for {@code and} and {@code or} means that the
 * expression {@code A and B and C} is shaped as {@code And(And(A, B), C)}.
 */
public sealed interface ConditionNode
        permits ConditionNode.Ident,
                ConditionNode.Not,
                ConditionNode.And,
                ConditionNode.Or {

    /**
     * A leaf node referencing a named Sigma selection block.
     *
     * @param name the identifier of the selection block in the {@code detection:} map
     */
    record Ident(String name) implements ConditionNode {}

    /**
     * A unary logical negation node.
     *
     * @param child the negated sub-expression
     */
    record Not(ConditionNode child) implements ConditionNode {}

    /**
     * A binary logical conjunction node (left-associative).
     *
     * @param left  the left-hand operand
     * @param right the right-hand operand
     */
    record And(ConditionNode left, ConditionNode right) implements ConditionNode {}

    /**
     * A binary logical disjunction node (left-associative).
     *
     * @param left  the left-hand operand
     * @param right the right-hand operand
     */
    record Or(ConditionNode left, ConditionNode right) implements ConditionNode {}
}
