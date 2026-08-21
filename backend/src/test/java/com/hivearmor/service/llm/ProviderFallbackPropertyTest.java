package com.hivearmor.service.llm;

import com.hivearmor.domain.UtmConfigurationParameter;
import com.hivearmor.repository.UtmConfigurationParameterRepository;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Property-based tests for {@link ProviderRegistry} and unknown-provider fallback
 * behavior in {@code HaLlmService.reload()}.
 *
 * <h3>Property 3: Unknown provider name falls back to Disabled</h3>
 * <p>For any string value stored under {@code LLM_PROVIDER} in
 * {@code hive_configuration_parameter} that is not one of {@code "disabled"},
 * {@code "openai"}, {@code "azure"}, or {@code "ollama"} — including absent, empty,
 * and null — {@code HaLlmService.reload} SHALL select {@link DisabledLlmProvider}
 * as the active provider.
 *
 * <p>This test file exercises the property through the {@link ProviderRegistry} API,
 * which is the direct implementation of the fallback logic.
 *
 * <p><strong>Validates: Requirements 2.2</strong>
 *
 * <p>Test strategy:
 * <ol>
 *   <li>Build a real {@link ProviderRegistry} from the four known provider stubs so
 *       the index is populated exactly as it would be in production (no mocking of
 *       the registry itself).</li>
 *   <li>Generate arbitrary strings that are not in {@code {"disabled", "openai",
 *       "azure", "ollama"}} using jqwik {@link Assume} filtering.</li>
 *   <li>Assert {@link ProviderRegistry#forName(String)} returns
 *       {@link Optional#empty()} — the contract used by {@code HaLlmService.reload()}
 *       before it calls {@link ProviderRegistry#disabled()} as fallback.</li>
 *   <li>Exercise null, empty, and blank strings in targeted example-based methods
 *       that guarantee those degenerate cases are always covered.</li>
 * </ol>
 *
 * <p>jqwik runs {@code @Property} methods in its own lifecycle. Mocks and the
 * registry are re-created before each trial via {@link BeforeTry} so every trial
 * starts from a clean state.
 */
class ProviderFallbackPropertyTest {

    // -------------------------------------------------------------------------
    // Known provider names — the only four strings that must NOT return empty
    // -------------------------------------------------------------------------
    private static final List<String> KNOWN_PROVIDERS =
            List.of("disabled", "openai", "azure", "ollama");

    // -------------------------------------------------------------------------
    // Test infrastructure — re-created before every jqwik trial
    // -------------------------------------------------------------------------

    private ProviderRegistry registry;

    @BeforeTry
    void setUp() {
        // Build a real ProviderRegistry with stub implementations of the four
        // known providers so the internal byName map is populated exactly as
        // it would be in the production Spring context.
        registry = buildRegistry();
    }

    // =========================================================================
    // Property 3: Unknown provider name falls back to Disabled
    // Validates: Requirements 2.2
    // =========================================================================

    /**
     * **Validates: Requirements 2.2**
     *
     * <p>For any arbitrary string that is not one of the four known provider names,
     * {@link ProviderRegistry#forName(String)} must return {@link Optional#empty()}.
     * This is the condition that causes {@code HaLlmService.reload()} to call
     * {@link ProviderRegistry#disabled()} and select {@link DisabledLlmProvider}
     * as the active provider.
     *
     * <p>The generator uses {@link Assume} to filter out the four known provider
     * names so that only genuinely unknown values reach the assertion.
     */
    @Property(tries = 200)
    void property3_unknownProviderName_registryReturnsEmpty(
            @ForAll("unknownProviderNames") String unknownName) {

        Optional<HaLlmProvider> result = registry.forName(unknownName);

        assertThat(result)
                .as("ProviderRegistry.forName('%s') must return Optional.empty() for any name "
                        + "that is not one of %s (Req 2.2)",
                        unknownName, KNOWN_PROVIDERS)
                .isEmpty();
    }

    /**
     * **Validates: Requirements 2.2**
     *
     * <p>When {@link ProviderRegistry#forName(String)} returns empty for an unknown
     * name, the caller's fallback path ({@code .orElseGet(registry::disabled)})
     * must resolve to the {@link DisabledLlmProvider} bean — not null and not any
     * other provider implementation.
     */
    @Property(tries = 200)
    void property3_unknownProviderName_fallbackResolvesToDisabledProvider(
            @ForAll("unknownProviderNames") String unknownName) {

        HaLlmProvider fallback = registry.forName(unknownName)
                .orElseGet(registry::disabled);

        assertThat(fallback)
                .as("Fallback from unknown provider name '%s' must be DisabledLlmProvider (Req 2.2)",
                        unknownName)
                .isNotNull()
                .isInstanceOf(DisabledLlmProvider.class);

        assertThat(fallback.providerName())
                .as("Fallback provider must report providerName 'disabled' (Req 2.2)")
                .isEqualTo("disabled");

        assertThat(fallback.isConfigured())
                .as("DisabledLlmProvider.isConfigured() must always return false (Req 2.2, 1.4)")
                .isFalse();
    }

    // =========================================================================
    // Edge cases: null, empty, and blank strings
    // =========================================================================

    /**
     * **Validates: Requirements 2.2**
     *
     * <p>{@code null} stored under {@code LLM_PROVIDER} must result in
     * {@link Optional#empty()} from {@link ProviderRegistry#forName(String)},
     * causing {@code HaLlmService.reload()} to fall back to disabled.
     */
    @Example
    void nullProviderName_returnsEmpty() {
        assertThat(registry.forName(null)).isEmpty();
    }

    /**
     * **Validates: Requirements 2.2**
     *
     * <p>An empty string ({@code ""}) stored under {@code LLM_PROVIDER} must result
     * in {@link Optional#empty()} from {@link ProviderRegistry#forName(String)}.
     */
    @Example
    void emptyStringProviderName_returnsEmpty() {
        assertThat(registry.forName("")).isEmpty();
    }

    /**
     * **Validates: Requirements 2.2**
     *
     * <p>A blank (whitespace-only) string stored under {@code LLM_PROVIDER} must
     * result in {@link Optional#empty()} from {@link ProviderRegistry#forName(String)}.
     */
    @Example
    void blankStringProviderName_returnsEmpty() {
        assertThat(registry.forName("   ")).isEmpty();
        assertThat(registry.forName("\t")).isEmpty();
        assertThat(registry.forName("\n")).isEmpty();
    }

    /**
     * **Validates: Requirements 2.2**
     *
     * <p>Sanity check: the four known provider names must each return a non-empty
     * {@link Optional} so the test does not produce false positives by
     * accidentally excluding them from the generator incorrectly.
     */
    @Example
    void knownProviderNames_eachReturnPresent() {
        for (String name : KNOWN_PROVIDERS) {
            assertThat(registry.forName(name))
                    .as("forName('%s') must return present for a known provider", name)
                    .isPresent();
        }
    }

    /**
     * **Validates: Requirements 2.2**
     *
     * <p>Case-sensitive check: upper-cased variants of known provider names
     * (e.g. {@code "DISABLED"}, {@code "OPENAI"}) are not in the registry and must
     * return empty, as the stored value must be an exact lowercase match.
     */
    @Example
    void uppercasedKnownProviderNames_returnEmpty() {
        for (String name : KNOWN_PROVIDERS) {
            assertThat(registry.forName(name.toUpperCase()))
                    .as("forName('%s') must return empty — provider names are case-sensitive (Req 2.2)",
                            name.toUpperCase())
                    .isEmpty();
        }
    }

    // =========================================================================
    // Arbitraries (generators)
    // =========================================================================

    /**
     * Generates arbitrary strings that are guaranteed not to be one of the four
     * known provider names: {@code "disabled"}, {@code "openai"}, {@code "azure"},
     * {@code "ollama"}.
     *
     * <p>The strategy uses a broad printable-ASCII alphabet and filters out the
     * four known names. Blank strings are excluded here because they are tested
     * separately as targeted edge-case examples (the property is about unknown but
     * non-blank names — blank/null are degenerate cases with their own assertions).
     */
    @Provide
    Arbitrary<String> unknownProviderNames() {
        return Arbitraries.strings()
                .withCharRange('a', 'z')
                .withCharRange('A', 'Z')
                .withCharRange('0', '9')
                .withChars("-_./")
                .ofMinLength(1)
                .ofMaxLength(64)
                .filter(s -> !s.isBlank())
                .filter(s -> !KNOWN_PROVIDERS.contains(s));
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Constructs a {@link ProviderRegistry} populated with minimal stub
     * implementations of the four known providers. The stubs only need to return
     * the correct {@link HaLlmProvider#providerName()} value — the rest of the
     * interface is irrelevant for fallback-lookup testing.
     *
     * <p>Using real (minimal) implementations rather than mocks keeps the test
     * free of Mockito ordering constraints and exercises the actual registry
     * indexing logic.
     */
    private static ProviderRegistry buildRegistry() {
        List<HaLlmProvider> providers = List.of(
                new DisabledLlmProvider(),
                stubProvider("openai"),
                stubProvider("azure"),
                stubProvider("ollama")
        );
        return new ProviderRegistry(providers);
    }

    /**
     * Returns a minimal {@link HaLlmProvider} stub that only implements
     * {@link HaLlmProvider#providerName()} — sufficient for
     * {@link ProviderRegistry} indexing and lookup tests.
     */
    private static HaLlmProvider stubProvider(String name) {
        return new HaLlmProvider() {
            @Override public String chat(java.util.List<ChatMessage> m, ChatOptions o) {
                throw new UnsupportedOperationException("stub");
            }
            @Override public reactor.core.publisher.Flux<String> streamChat(
                    java.util.List<ChatMessage> m, ChatOptions o) {
                throw new UnsupportedOperationException("stub");
            }
            @Override public boolean isConfigured() { return true; }
            @Override public String providerName()  { return name; }
        };
    }
}
