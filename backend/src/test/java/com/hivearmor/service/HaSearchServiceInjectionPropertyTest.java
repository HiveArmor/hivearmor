package com.hivearmor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.multitenancy.MsspIndexResolver;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
import org.assertj.core.api.SoftAssertions;

import java.util.Arrays;
import java.util.List;

import static org.mockito.Mockito.mock;

/**
 * Property 2: NL sanitizer neutralizes every injection trigger case-insensitively.
 *
 * <p><strong>Property 2: NL sanitizer neutralizes every injection trigger
 * case-insensitively</strong><br>
 * For any input string that contains one or more of the five prompt-injection
 * triggers defined in {@link HaSearchService} — regardless of the surrounding
 * text, the position of the trigger within the string, or the mix of upper- and
 * lower-case letters used to spell the trigger — the output of
 * {@code sanitizeNlQuery} must:
 * <ol>
 *   <li>contain no case-insensitive match of any trigger, and</li>
 *   <li>contain the literal {@code [filtered]} in place of the trigger.</li>
 * </ol>
 *
 * <p><strong>Validates: Requirements 3.4</strong>
 *
 * <p>The service under test is constructed with Mockito mocks for the two
 * dependencies that are irrelevant to this property ({@code HaLlmService} and
 * {@code MsspIndexResolver}), and a real {@link ObjectMapper}.
 */
@Label("Feature: sprint-26-nl-search, Property 2: NL sanitizer injection-trigger neutralization")
class HaSearchServiceInjectionPropertyTest {

    /**
     * The five injection triggers defined in {@link HaSearchService#INJECTION_TRIGGERS}.
     * Duplicated here so the generators can embed each trigger independently without
     * accessing the private array via reflection.
     */
    private static final List<String> TRIGGERS = Arrays.asList(
        "ignore previous instructions",
        "ignore all previous",
        "system:",
        "assistant:",
        "<|"
    );

    private HaSearchService sut;

    @BeforeTry
    void setUp() {
        sut = new HaSearchService(
            mock(HaLlmService.class),
            new ObjectMapper(),
            mock(MsspIndexResolver.class)
        );
    }

    // =========================================================================
    // Property 2: injection trigger neutralization
    // =========================================================================

    /**
     * For any arbitrary base string {@code base} with a trigger embedded at a
     * random position in a random casing:
     * <ul>
     *   <li>the sanitized output contains no case-insensitive occurrence of the trigger, and</li>
     *   <li>the sanitized output contains the literal {@code [filtered]}.</li>
     * </ul>
     *
     * <p><strong>Validates: Requirements 3.4</strong>
     */
    @Property(tries = 200)
    @Label("Property 2: trigger is neutralized and [filtered] is present regardless of position or casing")
    void property2_injectionTriggerNeutralizedCaseInsensitively(
            @ForAll("inputsWithSingleTrigger") InputWithTrigger sample) {

        String result = sut.sanitizeNlQueryForTesting(sample.input);
        String resultLower = result.toLowerCase();

        SoftAssertions softly = new SoftAssertions();

        // Assertion 1: the trigger (case-insensitive) does not survive sanitization.
        softly.assertThat(resultLower)
            .as("Sanitized output must not contain the trigger '%s' (case-insensitively).\n"
                + "  trigger=%s\n  input=%s\n  result=%s",
                sample.triggerLabel, sample.triggerLabel, sample.input, result)
            .doesNotContain(sample.triggerLabel.toLowerCase());

        // Assertion 2: [filtered] appears in the result.
        softly.assertThat(result)
            .as("Sanitized output must contain '[filtered]' in place of trigger '%s'.\n"
                + "  trigger=%s\n  input=%s\n  result=%s",
                sample.triggerLabel, sample.triggerLabel, sample.input, result)
            .contains("[filtered]");

        softly.assertAll();
    }

    /**
     * Same property tested across all five triggers simultaneously in a single
     * input (all triggers injected at once, each in a different random casing
     * and position).
     *
     * <p><strong>Validates: Requirements 3.4</strong>
     */
    @Property(tries = 200)
    @Label("Property 2b: all five triggers neutralized when all are injected simultaneously")
    void property2b_allTriggersNeutralizedSimultaneously(
            @ForAll("inputsWithAllTriggers") String input) {

        String result = sut.sanitizeNlQueryForTesting(input);
        String resultLower = result.toLowerCase();

        SoftAssertions softly = new SoftAssertions();

        for (String trigger : TRIGGERS) {
            softly.assertThat(resultLower)
                .as("Sanitized output must not contain trigger '%s' (case-insensitively).\n"
                    + "  input=%s\n  result=%s", trigger, input, result)
                .doesNotContain(trigger.toLowerCase());
        }

        softly.assertThat(result)
            .as("Sanitized output must contain at least one '[filtered]' replacement.\n"
                + "  input=%s\n  result=%s", input, result)
            .contains("[filtered]");

        softly.assertAll();
    }

    // =========================================================================
    // Arbitrary providers
    // =========================================================================

    /**
     * Produces an {@link InputWithTrigger} by:
     * <ol>
     *   <li>picking one of the five triggers at random,</li>
     *   <li>applying random per-character upper/lower casing to the trigger,</li>
     *   <li>generating an arbitrary short ASCII prefix and suffix,</li>
     *   <li>inserting the cased trigger at a random position within the
     *       concatenated prefix+suffix string.</li>
     * </ol>
     */
    @Provide
    Arbitrary<InputWithTrigger> inputsWithSingleTrigger() {
        // Pick a trigger.
        Arbitrary<String> triggerArb = Arbitraries.of(TRIGGERS);

        // Generate a random casing of the trigger.
        Arbitrary<Boolean[]> casingArb = Arbitraries.of(true, false)
            .array(Boolean[].class).ofMinSize(1).ofMaxSize(60);

        // Prefix and suffix: printable ASCII, 0..80 chars each.
        Arbitrary<String> textArb = Arbitraries.strings()
            .withCharRange(' ', '~')
            .ofMinLength(0)
            .ofMaxLength(80);

        return Combinators.combine(triggerArb, casingArb, textArb, textArb)
            .as((trigger, casing, prefix, suffix) -> {
                String casedTrigger = applyCasing(trigger, casing);
                // Insert the cased trigger at a random position in prefix+suffix.
                String envelope = prefix + suffix;
                int insertAt = envelope.isEmpty() ? 0 : Math.abs(
                    (prefix.length() + suffix.length()) % (envelope.length() + 1));
                String input = envelope.substring(0, insertAt) + casedTrigger
                    + envelope.substring(insertAt);
                return new InputWithTrigger(input, trigger);
            });
    }

    /**
     * Produces a string that contains all five triggers, each in a randomly-cased
     * form, inserted at different positions in a short benign envelope.
     */
    @Provide
    Arbitrary<String> inputsWithAllTriggers() {
        Arbitrary<Boolean[]> casingArb = Arbitraries.of(true, false)
            .array(Boolean[].class).ofMinSize(1).ofMaxSize(60);

        Arbitrary<String> separatorArb = Arbitraries.strings()
            .withCharRange(' ', '~')
            .ofMinLength(1)
            .ofMaxLength(20);

        return Combinators.combine(
            casingArb, casingArb, casingArb, casingArb, casingArb,
            separatorArb
        ).as((c0, c1, c2, c3, c4, sep) -> {
            StringBuilder sb = new StringBuilder();
            sb.append(sep);
            sb.append(applyCasing(TRIGGERS.get(0), c0)).append(sep);
            sb.append(applyCasing(TRIGGERS.get(1), c1)).append(sep);
            sb.append(applyCasing(TRIGGERS.get(2), c2)).append(sep);
            sb.append(applyCasing(TRIGGERS.get(3), c3)).append(sep);
            sb.append(applyCasing(TRIGGERS.get(4), c4)).append(sep);
            return sb.toString();
        });
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Applies per-character upper/lower casing to {@code s} using the boolean
     * array as a mask. If the mask is shorter than the string, it wraps around.
     * Non-ASCII-letter characters are preserved as-is.
     *
     * @param s      the string to case-mix
     * @param casing boolean mask; {@code true} = upper, {@code false} = lower
     * @return the case-mixed string
     */
    private static String applyCasing(String s, Boolean[] casing) {
        if (casing == null || casing.length == 0) {
            return s;
        }
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            boolean upper = casing[i % casing.length];
            sb.append(upper ? Character.toUpperCase(c) : Character.toLowerCase(c));
        }
        return sb.toString();
    }

    // =========================================================================
    // Data carrier
    // =========================================================================

    /**
     * Carries the generated input string and the canonical (lower-case) label of
     * the trigger that was injected into it, for clear failure messages.
     */
    static final class InputWithTrigger {
        final String input;
        final String triggerLabel;

        InputWithTrigger(String input, String triggerLabel) {
            this.input = input;
            this.triggerLabel = triggerLabel;
        }
    }
}
