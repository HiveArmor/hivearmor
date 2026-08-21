package com.hivearmor.service.hunt;

import com.hivearmor.service.hunt.HaAlertKqlParser.KqlNode;
import com.hivearmor.service.hunt.HaAlertKqlParser.KqlParseException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for {@link HaAlertKqlParser}.
 *
 * <p>Validates:
 * <ul>
 *   <li>Simple terms parse correctly</li>
 *   <li>Quoted phrases parse correctly</li>
 *   <li>Field:value syntax parses correctly</li>
 *   <li>AND/OR/NOT operators parse correctly (case-insensitive)</li>
 *   <li>Wildcards in field:value are preserved</li>
 *   <li>Parentheses for grouping work</li>
 *   <li>Query exceeding 1024 chars returns KqlParseException with offset</li>
 *   <li>Unterminated quotes produce parse error</li>
 *   <li>Empty/blank queries produce MATCH_ALL</li>
 * </ul>
 *
 * <p>Satisfies: Sprint 36 Task 2 — S36-T01 (q parameter parsing, max length validation)
 */
@Tag("Feature: sprint-36-alert-queue-contracts")
class HaAlertKqlParserTest {

    // =========================================================================
    // Simple Terms
    // =========================================================================

    @Nested
    @DisplayName("Simple Terms")
    class SimpleTerms {

        @Test
        @DisplayName("single word parses as TERM")
        void singleWord() {
            HaAlertKqlParser parser = new HaAlertKqlParser("malware");
            KqlNode node = parser.parse();
            assertThat(node.type).isEqualTo(KqlNode.Type.TERM);
            assertThat(node.value).isEqualTo("malware");
        }

        @Test
        @DisplayName("empty input produces MATCH_ALL")
        void emptyInput() {
            HaAlertKqlParser parser = new HaAlertKqlParser("");
            KqlNode node = parser.parse();
            assertThat(node.type).isEqualTo(KqlNode.Type.MATCH_ALL);
        }

        @Test
        @DisplayName("blank input produces MATCH_ALL")
        void blankInput() {
            HaAlertKqlParser parser = new HaAlertKqlParser("   ");
            KqlNode node = parser.parse();
            assertThat(node.type).isEqualTo(KqlNode.Type.MATCH_ALL);
        }

        @Test
        @DisplayName("null input produces MATCH_ALL")
        void nullInput() {
            HaAlertKqlParser parser = new HaAlertKqlParser(null);
            KqlNode node = parser.parse();
            assertThat(node.type).isEqualTo(KqlNode.Type.MATCH_ALL);
        }
    }

    // =========================================================================
    // Quoted Phrases
    // =========================================================================

    @Nested
    @DisplayName("Quoted Phrases")
    class QuotedPhrases {

        @Test
        @DisplayName("quoted phrase parses as PHRASE")
        void quotedPhrase() {
            HaAlertKqlParser parser = new HaAlertKqlParser("\"lateral movement\"");
            KqlNode node = parser.parse();
            assertThat(node.type).isEqualTo(KqlNode.Type.PHRASE);
            assertThat(node.value).isEqualTo("lateral movement");
        }

        @Test
        @DisplayName("unterminated quote throws parse error")
        void unterminatedQuote() {
            HaAlertKqlParser parser = new HaAlertKqlParser("\"unterminated");
            assertThatThrownBy(parser::parse)
                .isInstanceOf(KqlParseException.class)
                .hasMessageContaining("Unterminated");
        }
    }

    // =========================================================================
    // Field:Value Syntax
    // =========================================================================

    @Nested
    @DisplayName("Field:Value Syntax")
    class FieldValue {

        @Test
        @DisplayName("field:value parses as FIELD_VALUE")
        void fieldValue() {
            HaAlertKqlParser parser = new HaAlertKqlParser("severity:critical");
            KqlNode node = parser.parse();
            assertThat(node.type).isEqualTo(KqlNode.Type.FIELD_VALUE);
            assertThat(node.field).isEqualTo("severity");
            assertThat(node.value).isEqualTo("critical");
        }

        @Test
        @DisplayName("field:\"quoted value\" parses as FIELD_PHRASE")
        void fieldQuotedValue() {
            HaAlertKqlParser parser = new HaAlertKqlParser("host:\"my server\"");
            KqlNode node = parser.parse();
            assertThat(node.type).isEqualTo(KqlNode.Type.FIELD_PHRASE);
            assertThat(node.field).isEqualTo("host");
            assertThat(node.value).isEqualTo("my server");
        }

        @Test
        @DisplayName("field:*wildcard* preserves wildcard")
        void fieldWildcard() {
            HaAlertKqlParser parser = new HaAlertKqlParser("name:*malware*");
            KqlNode node = parser.parse();
            assertThat(node.type).isEqualTo(KqlNode.Type.FIELD_VALUE);
            assertThat(node.field).isEqualTo("name");
            assertThat(node.value).isEqualTo("*malware*");
        }

        @Test
        @DisplayName("field with no value after colon throws")
        void fieldNoValue() {
            HaAlertKqlParser parser = new HaAlertKqlParser("severity:");
            assertThatThrownBy(parser::parse)
                .isInstanceOf(KqlParseException.class)
                .hasMessageContaining("Expected value");
        }
    }

    // =========================================================================
    // Boolean Operators
    // =========================================================================

    @Nested
    @DisplayName("Boolean Operators")
    class BooleanOperators {

        @Test
        @DisplayName("AND combines two terms")
        void andOperator() {
            HaAlertKqlParser parser = new HaAlertKqlParser("malware AND critical");
            KqlNode node = parser.parse();
            assertThat(node.type).isEqualTo(KqlNode.Type.AND);
            assertThat(node.left.type).isEqualTo(KqlNode.Type.TERM);
            assertThat(node.left.value).isEqualTo("malware");
            assertThat(node.right.type).isEqualTo(KqlNode.Type.TERM);
            assertThat(node.right.value).isEqualTo("critical");
        }

        @Test
        @DisplayName("OR combines two terms")
        void orOperator() {
            HaAlertKqlParser parser = new HaAlertKqlParser("malware OR phishing");
            KqlNode node = parser.parse();
            assertThat(node.type).isEqualTo(KqlNode.Type.OR);
            assertThat(node.left.value).isEqualTo("malware");
            assertThat(node.right.value).isEqualTo("phishing");
        }

        @Test
        @DisplayName("NOT negates a term")
        void notOperator() {
            HaAlertKqlParser parser = new HaAlertKqlParser("NOT benign");
            KqlNode node = parser.parse();
            assertThat(node.type).isEqualTo(KqlNode.Type.NOT);
            assertThat(node.left.type).isEqualTo(KqlNode.Type.TERM);
            assertThat(node.left.value).isEqualTo("benign");
        }

        @Test
        @DisplayName("operators are case-insensitive")
        void caseInsensitive() {
            HaAlertKqlParser parser = new HaAlertKqlParser("malware and critical or phishing");
            KqlNode node = parser.parse();
            // "and" has higher precedence than "or" in this grammar
            assertThat(node.type).isEqualTo(KqlNode.Type.OR);
        }

        @Test
        @DisplayName("complex expression: (a OR b) AND NOT c")
        void complexExpression() {
            HaAlertKqlParser parser = new HaAlertKqlParser("(malware OR phishing) AND NOT benign");
            KqlNode node = parser.parse();
            assertThat(node.type).isEqualTo(KqlNode.Type.AND);
            assertThat(node.left.type).isEqualTo(KqlNode.Type.OR);
            assertThat(node.right.type).isEqualTo(KqlNode.Type.NOT);
        }

        @Test
        @DisplayName("AND operator with field:value")
        void andWithFieldValue() {
            HaAlertKqlParser parser = new HaAlertKqlParser("severity:critical AND status:open");
            KqlNode node = parser.parse();
            assertThat(node.type).isEqualTo(KqlNode.Type.AND);
            assertThat(node.left.type).isEqualTo(KqlNode.Type.FIELD_VALUE);
            assertThat(node.left.field).isEqualTo("severity");
            assertThat(node.right.type).isEqualTo(KqlNode.Type.FIELD_VALUE);
            assertThat(node.right.field).isEqualTo("status");
        }
    }

    // =========================================================================
    // Parentheses / Grouping
    // =========================================================================

    @Nested
    @DisplayName("Parentheses")
    class Parentheses {

        @Test
        @DisplayName("parentheses override default precedence")
        void parenthesesPrecedence() {
            HaAlertKqlParser parser = new HaAlertKqlParser("a AND (b OR c)");
            KqlNode node = parser.parse();
            assertThat(node.type).isEqualTo(KqlNode.Type.AND);
            assertThat(node.right.type).isEqualTo(KqlNode.Type.OR);
        }

        @Test
        @DisplayName("unclosed parenthesis throws")
        void unclosedParen() {
            HaAlertKqlParser parser = new HaAlertKqlParser("(malware AND");
            assertThatThrownBy(parser::parse)
                .isInstanceOf(KqlParseException.class);
        }
    }

    // =========================================================================
    // Max Length Validation
    // =========================================================================

    @Nested
    @DisplayName("Max Length Validation")
    class MaxLength {

        @Test
        @DisplayName("query exceeding 1024 chars throws with offset")
        void exceedsMaxLength() {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 1100; i++) sb.append("a");
            String longQuery = sb.toString();

            HaAlertKqlParser parser = new HaAlertKqlParser(longQuery);
            assertThatThrownBy(parser::parse)
                .isInstanceOf(KqlParseException.class)
                .satisfies(e -> {
                    KqlParseException kpe = (KqlParseException) e;
                    assertThat(kpe.getOffset()).isEqualTo(1024);
                    assertThat(kpe.getMessage()).contains("1024");
                });
        }

        @Test
        @DisplayName("query at exactly 1024 chars parses successfully")
        void exactlyMaxLength() {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 1024; i++) sb.append("a");
            String maxQuery = sb.toString();

            HaAlertKqlParser parser = new HaAlertKqlParser(maxQuery);
            KqlNode node = parser.parse();
            assertThat(node.type).isEqualTo(KqlNode.Type.TERM);
        }
    }

    // =========================================================================
    // Query String Generation
    // =========================================================================

    @Nested
    @DisplayName("toQueryString")
    class ToQueryString {

        @Test
        @DisplayName("MATCH_ALL produces *")
        void matchAll() {
            KqlNode node = new KqlNode(KqlNode.Type.MATCH_ALL, "*");
            assertThat(HaAlertKqlParser.toQueryString(node)).isEqualTo("*");
        }

        @Test
        @DisplayName("TERM produces escaped term")
        void term() {
            KqlNode node = new KqlNode(KqlNode.Type.TERM, "malware");
            assertThat(HaAlertKqlParser.toQueryString(node)).isEqualTo("malware");
        }

        @Test
        @DisplayName("PHRASE produces quoted string")
        void phrase() {
            KqlNode node = new KqlNode(KqlNode.Type.PHRASE, "lateral movement");
            assertThat(HaAlertKqlParser.toQueryString(node)).isEqualTo("\"lateral movement\"");
        }

        @Test
        @DisplayName("FIELD_VALUE produces field:value")
        void fieldValue() {
            KqlNode node = new KqlNode(KqlNode.Type.FIELD_VALUE, "severity", "critical");
            assertThat(HaAlertKqlParser.toQueryString(node)).isEqualTo("severity:critical");
        }

        @Test
        @DisplayName("FIELD_VALUE with wildcard preserves wildcard")
        void fieldValueWildcard() {
            KqlNode node = new KqlNode(KqlNode.Type.FIELD_VALUE, "name", "*malware*");
            assertThat(HaAlertKqlParser.toQueryString(node)).isEqualTo("name:*malware*");
        }

        @Test
        @DisplayName("AND produces grouped expression")
        void andExpr() {
            KqlNode left = new KqlNode(KqlNode.Type.TERM, "a");
            KqlNode right = new KqlNode(KqlNode.Type.TERM, "b");
            KqlNode node = new KqlNode(KqlNode.Type.AND, left, right);
            assertThat(HaAlertKqlParser.toQueryString(node)).isEqualTo("(a AND b)");
        }

        @Test
        @DisplayName("OR produces grouped expression")
        void orExpr() {
            KqlNode left = new KqlNode(KqlNode.Type.TERM, "a");
            KqlNode right = new KqlNode(KqlNode.Type.TERM, "b");
            KqlNode node = new KqlNode(KqlNode.Type.OR, left, right);
            assertThat(HaAlertKqlParser.toQueryString(node)).isEqualTo("(a OR b)");
        }

        @Test
        @DisplayName("NOT produces negated expression")
        void notExpr() {
            KqlNode operand = new KqlNode(KqlNode.Type.TERM, "benign");
            KqlNode node = new KqlNode(KqlNode.Type.NOT, operand, null);
            assertThat(HaAlertKqlParser.toQueryString(node)).isEqualTo("(NOT benign)");
        }

        @Test
        @DisplayName("null node produces *")
        void nullNode() {
            assertThat(HaAlertKqlParser.toQueryString(null)).isEqualTo("*");
        }
    }

    // =========================================================================
    // Integration: parse → toQueryString round-trip
    // =========================================================================

    @Nested
    @DisplayName("Round-trip")
    class RoundTrip {

        @Test
        @DisplayName("complex query round-trips correctly")
        void complexRoundTrip() {
            String input = "severity:critical AND (name:*malware* OR \"lateral movement\") AND NOT status:closed";
            HaAlertKqlParser parser = new HaAlertKqlParser(input);
            KqlNode ast = parser.parse();
            String output = HaAlertKqlParser.toQueryString(ast);

            assertThat(output).contains("AND");
            assertThat(output).contains("OR");
            assertThat(output).contains("NOT");
            assertThat(output).contains("severity:critical");
            assertThat(output).contains("*malware*");
            assertThat(output).contains("\"lateral movement\"");
            // status:closed is parsed as a field:value node, output as field:value (no escape)
            assertThat(output).contains("status:closed");
        }
    }
}
