package com.hivearmor.service.admin.api_key;

import net.jqwik.api.*;
import net.jqwik.api.constraints.IntRange;
import net.jqwik.api.lifecycle.BeforeTry;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Property-based tests for {@link HaApiKeyTokenGenerator}.
 *
 * <p><strong>Properties covered:</strong>
 * <ul>
 *   <li>Property 5: ApiKeyToken format regex
 *       — Validates: Requirements 5.2</li>
 * </ul>
 *
 * <p>Uses jqwik {@code @Property(tries=500)} to call {@link HaApiKeyTokenGenerator#generate()}
 * 500 times and assert every result matches the expected format, length, prefix, and
 * character-set constraints mandated by Requirement 5.2.
 */
class HaApiKeyTokenGeneratorPropertyTest {

    /** System under test — re-created fresh before every jqwik trial. */
    private HaApiKeyTokenGenerator generator;

    @BeforeTry
    void setUp() {
        generator = new HaApiKeyTokenGenerator();
    }

    // =========================================================================
    // Property 5: ApiKeyToken format regex
    // Validates: Requirements 5.2
    // =========================================================================

    /**
     * **Validates: Requirements 5.2**
     *
     * <p>For every token produced by {@link HaApiKeyTokenGenerator#generate()}:
     * <ul>
     *   <li>The token must match the regex {@code ^ha_[A-Za-z0-9_-]{40}$}.</li>
     *   <li>The total length must be exactly 43 characters ({@code "ha_"} = 3 + body = 40).</li>
     *   <li>The token must start with the literal prefix {@code "ha_"}.</li>
     *   <li>Every character at positions 3–42 (inclusive) must be in {@code [A-Za-z0-9_-]}.</li>
     * </ul>
     *
     * <p>The {@code @ForAll @IntRange} parameter is a dummy trigger that tells jqwik to
     * invoke the property method 500 times; the integer value is not used in assertions.
     */
    @Property(tries = 500)
    void property5_apiKeyTokenFormatRegex(
            @ForAll @IntRange(min = 1, max = 500) int ignored) {

        String token = generator.generate();

        // 1. Full regex match: ^ha_[A-Za-z0-9_-]{40}$
        assertThat(token)
                .as("Token must match ^ha_[A-Za-z0-9_-]{40}$ (Req 5.2)")
                .matches("^ha_[A-Za-z0-9_-]{40}$");

        // 2. Total length: "ha_" (3) + 40 body chars = 43
        assertThat(token)
                .as("Token must have exactly 43 characters: 'ha_' prefix + 40-char body (Req 5.2)")
                .hasSize(43);

        // 3. Must start with "ha_"
        assertThat(token)
                .as("Token must start with the 'ha_' prefix (Req 5.2)")
                .startsWith("ha_");

        // 4. Every body character (positions 3–42) must be in [A-Za-z0-9_-]
        String body = token.substring(3); // exactly 40 chars
        for (int i = 0; i < body.length(); i++) {
            char c = body.charAt(i);
            assertThat(isUrlSafeChar(c))
                    .as("Body character at index %d ('%c') must be in [A-Za-z0-9_-] (Req 5.2)", i, c)
                    .isTrue();
        }
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Returns {@code true} when the given character belongs to the URL-safe base64
     * alphabet {@code [A-Za-z0-9_-]} required by Requirement 5.2.
     */
    private static boolean isUrlSafeChar(char c) {
        return (c >= 'A' && c <= 'Z')
                || (c >= 'a' && c <= 'z')
                || (c >= '0' && c <= '9')
                || c == '_'
                || c == '-';
    }
}
