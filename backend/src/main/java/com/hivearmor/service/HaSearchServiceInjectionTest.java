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
 * dependencies that are irrelevant to this property ({@link HaLlmService} and
 * {@link MsspIndexResolver}), and a real {@link ObjectMapper}.
 * The private {@code sanitizeNlQuery} method is exercised via the package-private
 * {@link HaSearchService#sanitizeNlQueryForTesting} accessor, avoiding reflection.
 */
@Label("Feature: sprint-26-nl-search, Property 2: NL sanitizer injection-trigger neutralization")
class HaSearchServiceInjectionTest {

    /**
     * The five injection triggers defined in {@link HaSearchService#INJECTION_TRIGGERS}.
     * Listed here explicitly so generators can embed each trigger independently.
     */
    private static final List<String> TRIGGERS = Arrays.asList(
        "ignore previous instructions",
        "ignore all previous",
        "system:",
        "assistant:",
        "<|"
    );

    private HaSearchService service;

    /** Construct a fresh service instance before each property try. */
    @BeforeTry
    void setUp() {
        service = new HaSearchService(
            mock(HaLlmService.class),
            new ObjectMapper(),
            mock(MsspIndexResolver.class)
        );
    }

    // =========================================================================
    // Property 2: injection trigger neutralization — single trigger per input
    // =========================================================================

    /**
     * For any arbitrary base string with a single trigger embedded at a random
     * position in a random casing:
     * <ul>
     *   <li>the sanitized output contains no case-insensitive occurrence of the trigger, and</li>
     *   <li>the sanitized output contains the literal {@code [filtered]}.</li>
     * </ul>
     *
     * <p><strong>Validates: Requirements 3.4</strong>
     */
    @Property(tries = 100)
    @Label("Property 2: trigger is neutralized and [filtered] is present regardless of position or casing")
    void property2_injectionTriggerNeutralizedCaseInsensitively(
            @ForAll("inputsWithSingleTrigger") InputWithTrigger sample) {

        String result = service.sanitizeNlQueryForTesting(sample.input);
        String resultLower = result.toLowerCase();

        SoftAssertions softly = new SoftAssertions();

        // Assertion 1: trigger (case-insensitive) must not survive sanitization.
        softly.assertThat(resultLower)
            .as("Sanitized output must not contain the trigger '%s' (case-insensitively).\n"
                + "  trigger=%s\n  input=%s\n  result=%s",
                sample.triggerLabel, sample.triggerLabel, sample.input, result)
            .doesNotContain(sample.triggerLabel.toLowerCase());

        // Assertion 2: [filtered] must appear in the result.
        softly.assertThat(result)
            .as("Sanitized output must contain '[filtered]' in place of trigger '%s'.\n"
                + "  trigger=%s\n  input=%s\n  result=%s",
                sample.triggerLabel, sample.triggerLabel, sample.input, result)
            .contains("[filtered]");

        softly.assertAll();
    }

    // =========================================================================
    // Property 2b: all five triggers neutralized simultaneously
    // =========================================================================

    /**
     * Same property tested across all five triggers simultaneously in a single
     * input (all triggers injected at once, each in a different random casing
     * and separated by an arbitrary filler string).
     *
     * <p><strong>Validates: Requirements 3.4</strong>
     */
    @Property(tries = 100)
    @Label("Property 2b: all five triggers neutralized when all are injected simultaneously")
    void property2b_allTriggersNeutralizedSimultaneously(
            @ForAll("inputsWithAllTriggers") String input) {

        String result = service.sanitizeNlQueryForTesting(input);
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
     *   <li>generating arbitrary short printable-ASCII prefix and suffix strings,</li>
     *   <li>inserting the randomly-cased trigger at a deterministic position derived
     *       from the prefix and suffix lengths.</li>
     * </ol>
     */
    @Provide
    Arbitrary<InputWithTrigger> inputsWithSingleTrigger() {
        // Pick one of the five triggers at random.
        Arbitrary<String> triggerArb = Arbitraries.of(TRIGGERS);

        // Generate a random boolean mask for casing (true = upper, false = lower).
        Arbitrary<Boolean[]> casingArb = Arbitraries.of(true, false)
            .array(Boolean[].class)
            .ofMinSize(1)
            .ofMaxSize(60);

        // Printable ASCII surrounding text (space to tilde), 0–80 chars each.
        Arbitrary<String> textArb = Arbitraries.strings()
            .withCharRange(' ', '~')
            .ofMinLength(0)
            .ofMaxLength(80);

        return Combinators.combine(triggerArb, casingArb, textArb, textArb)
            .as((trigger, casing, prefix, suffix) -> {
                String casedTrigger = applyCasing(trigger, casing);
                String envelope = prefix + suffix;
                // Derive insert position deterministically from lengths to avoid
                // needing an additional Arbitrary<Integer>.
                int insertAt = envelope.isEmpty()
                    ? 0
                    : Math.abs((prefix.length() * 31 + suffix.length()) % (envelope.length() + 1));
                String input = envelope.substring(0, insertAt)
                    + casedTrigger
                    + envelope.substring(insertAt);
                return new InputWithTrigger(input, trigger);
            });
    }

    /**
     * Produces a string that contains all five triggers, each in a randomly-cased
     * form, inserted in sequence separated by arbitrary printable-ASCII filler.
     */
    @Provide
    Arbitrary<String> inputsWithAllTriggers() {
        // One casing mask per trigger.
        Arbitrary<Boolean[]> casingArb = Arbitraries.of(true, false)
            .array(Boolean[].class)
            .ofMinSize(1)
            .ofMaxSize(60);

        Arbitrary<String> separatorArb = Arbitraries.strings()
            .withCharRange(' ', '~')
            .ofMinLength(1)
            .ofMaxLength(15);

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
     * Applies a per-character upper/lower casing mask to {@code s}.
     * The mask wraps around if shorter than the string.
     * Non-ASCII-letter characters are passed through unchanged.
     *
     * @param s      the string to case-mix
     * @param casing boolean mask; {@code true} = upper-case, {@code false} = lower-case
     * @return the case-mixed string
     */
    private static String applyCasing(String s, Boolean[] casing) {
        if (casing == null || casing.length == 0) {
            return s;
        }
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            boolean toUpper = casing[i % casing.length];
            sb.append(toUpper ? Character.toUpperCase(c) : Character.toLowerCase(c));
        }
        return sb.toString();
    }

    // =========================================================================
    // Data carrier
    // =========================================================================

    /**
     * Carries the generated input string and the canonical (lower-case) label of
     * the trigger embedded in it, for clear failure messages.
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
