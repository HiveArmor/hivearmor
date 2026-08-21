package com.hivearmor.service.llm;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.UtmConfigurationParameter;
import com.hivearmor.repository.UtmConfigurationParameterRepository;
import net.jqwik.api.*;
import net.jqwik.api.constraints.IntRange;
import net.jqwik.api.lifecycle.BeforeTry;
import org.assertj.core.api.SoftAssertions;
import org.springframework.http.ResponseEntity;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.lang.reflect.Field;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Property 10: Health probe cached for 30 seconds.
 *
 * <p><strong>Property 10: Health probe cached for 30 seconds</strong><br>
 * For any burst of {@code N >= 2} calls to {@link OllamaLlmProvider#isConfigured()}
 * occurring within a 30-second window at wall-clock time, exactly one upstream
 * HTTP GET to the health endpoint SHALL be made. The next call issued more than
 * 30 seconds after the last successful probe SHALL trigger exactly one new
 * upstream GET.
 *
 * <p>Three sub-properties are exercised per trial:
 * <ol>
 *   <li><strong>Within TTL</strong>: N calls within 30 s → exactly 1 upstream GET.</li>
 *   <li><strong>After TTL</strong>: 1 call more than 30 s after the previous probe →
 *       exactly 1 new upstream GET (2 total from a cold start).</li>
 *   <li><strong>Boundary — exactly 29 s after probe</strong>: still within TTL →
 *       still only 1 upstream GET.</li>
 * </ol>
 *
 * <p>The {@link Clock} field in {@link OllamaLlmProvider} is injectable via
 * constructor, which allows simulating time advancement without any real-time sleep.
 * A mock {@link WebClient} is injected via reflection to intercept and count upstream
 * HTTP calls without requiring WireMock or a network.
 *
 * <p>Tests live in {@code src/test/java/} per the project convention.
 *
 * <p><strong>Validates: Requirements 3.5</strong>
 */
@Label("Feature: sprint-27-ollama, Task 3.11 — Property 10: Health probe cached for 30 seconds")
class HealthProbeCachePropertyTest {

    // ─── Constants ────────────────────────────────────────────────────────────

    /** Fixed base URL so isConfigured() does not short-circuit before the cache check. */
    private static final String STUB_BASE_URL = "http://ollama-test:11434";

    /** Cache TTL used in the implementation — must match OllamaLlmProvider.HEALTH_CACHE_TTL. */
    private static final long CACHE_TTL_SECONDS = 30L;

    // ─── Per-trial state (re-created by @BeforeTry) ───────────────────────────

    /**
     * Counts the number of times {@link WebClient#get()} is called, which corresponds
     * to one upstream health probe per call chain invocation.
     */
    private AtomicInteger probeCount;

    /** Mockable wall-clock injected into {@link OllamaLlmProvider}. */
    private MutableClock mutableClock;

    /** The provider under test. */
    private OllamaLlmProvider provider;

    /**
     * Re-creates all state before every jqwik trial so no mutable state leaks
     * between iterations.
     */
    @BeforeTry
    void setUp() throws Exception {
        probeCount   = new AtomicInteger(0);
        mutableClock = new MutableClock(Instant.EPOCH);

        UtmConfigurationParameterRepository configRepo =
            mock(UtmConfigurationParameterRepository.class);

        // Stub the four config keys that loadConfig() reads.
        stubConfigParam(configRepo, OllamaLlmProvider.KEY_BASE_URL,    STUB_BASE_URL);
        stubConfigParam(configRepo, OllamaLlmProvider.KEY_MODEL,       "llama3.2:3b");
        stubConfigParam(configRepo, OllamaLlmProvider.KEY_TEMPERATURE, null);
        stubConfigParam(configRepo, OllamaLlmProvider.KEY_MAX_TOKENS,  null);

        ObjectMapper mapper = new ObjectMapper();

        // Build provider with the mutable clock.
        provider = new OllamaLlmProvider(mapper, mutableClock, configRepo);

        // Inject a mock WebClient that counts GET calls and returns a successful response.
        injectMockWebClient(provider, probeCount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Property 10-A: N calls within 30s → exactly 1 upstream GET
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * <strong>Property 10-A: burst within TTL window → exactly 1 upstream probe</strong>
     *
     * <p>For any {@code N} in [2, 10], invoking {@code isConfigured()} N times while
     * the clock stays within the 30-second TTL window must result in exactly one
     * upstream HTTP GET to the health endpoint.
     *
     * <p><strong>Validates: Requirements 3.5</strong>
     */
    @Property(tries = 100)
    @Label("Property 10-A: N calls within 30 s window produce exactly 1 upstream GET")
    void property10a_burstWithinTtl_exactlyOneProbe(
            @ForAll @IntRange(min = 2, max = 10) int n) {

        // Clock starts at EPOCH; all N calls happen within [0, 29] seconds.
        // Advance clock by at most floor(29/n) seconds between calls so the total
        // never reaches the 30-second TTL.
        long stepSeconds = 29L / n; // integer division — total < 30 s always
        for (int i = 0; i < n; i++) {
            mutableClock.advance(stepSeconds);
            provider.isConfigured();
        }

        SoftAssertions softly = new SoftAssertions();

        softly.assertThat(probeCount.get())
            .as("N=%d calls within 30-second TTL must trigger exactly 1 upstream GET", n)
            .isEqualTo(1);

        // One more call — clock has advanced at most 29s total, still within TTL.
        provider.isConfigured();

        softly.assertThat(probeCount.get())
            .as("Additional isConfigured() within TTL must NOT trigger a second probe (n=%d)", n)
            .isEqualTo(1);

        // isConfigured must return true (the stub WebClient succeeded).
        boolean result = provider.isConfigured();
        softly.assertThat(result)
            .as("isConfigured() must return true when the health probe succeeded (n=%d)", n)
            .isTrue();

        softly.assertAll();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Property 10-B: call > 30s after last probe → 1 new upstream GET
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * <strong>Property 10-B: call after TTL expiry triggers exactly 1 new upstream GET</strong>
     *
     * <p>After an initial probe, advancing the clock by more than 30 seconds and
     * calling {@code isConfigured()} again must trigger exactly one new upstream
     * GET (2 total for the lifetime of the provider instance).
     *
     * <p><strong>Validates: Requirements 3.5</strong>
     */
    @Property(tries = 100)
    @Label("Property 10-B: call after 30 s expiry triggers exactly 1 new upstream GET (2 total)")
    void property10b_callAfterTtlExpiry_triggersNewProbe(
            @ForAll("postExpirOffsets") long offsetSeconds) {

        SoftAssertions softly = new SoftAssertions();

        // ── Phase 1: initial probe (probe count = 1) ──────────────────────────
        provider.isConfigured();

        softly.assertThat(probeCount.get())
            .as("Initial call must trigger exactly 1 upstream GET (offset=%ds)", offsetSeconds)
            .isEqualTo(1);

        // ── Phase 2: advance clock past TTL and call again ────────────────────
        mutableClock.advance(offsetSeconds);  // offsetSeconds > 30
        provider.isConfigured();

        softly.assertThat(probeCount.get())
            .as("Call after %ds (> 30s TTL) must trigger a second upstream GET", offsetSeconds)
            .isEqualTo(2);

        // ── Phase 3: additional call immediately after — still within new TTL ─
        provider.isConfigured();

        softly.assertThat(probeCount.get())
            .as("Subsequent call immediately after re-probe must NOT trigger a third GET (offset=%ds)",
                offsetSeconds)
            .isEqualTo(2);

        softly.assertAll();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Property 10-C: call at exactly TTL boundary (29s) stays cached
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * <strong>Property 10-C: call at 29 s after probe stays within TTL → no new GET</strong>
     *
     * <p>A call at 29 seconds (strictly less than the 30-second TTL) must NOT
     * trigger a new upstream GET. The cache must still serve the previous result.
     *
     * <p><strong>Validates: Requirements 3.5</strong>
     */
    @Example
    @Label("Property 10-C: call at 29 s after probe is still within TTL — no new upstream GET")
    void property10c_callAtTtlBoundaryMinus1_noCacheExpiry() {

        // Initial probe.
        provider.isConfigured();
        int afterFirst = probeCount.get();

        // Advance to 29 seconds — strictly less than CACHE_TTL_SECONDS (30s).
        mutableClock.advance(CACHE_TTL_SECONDS - 1L);
        provider.isConfigured();

        SoftAssertions softly = new SoftAssertions();

        softly.assertThat(afterFirst)
            .as("Initial isConfigured() must produce exactly 1 upstream GET")
            .isEqualTo(1);

        softly.assertThat(probeCount.get())
            .as("Call at 29 s (< 30 s TTL) must NOT trigger a new upstream GET; count must stay at 1")
            .isEqualTo(1);

        softly.assertAll();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Property 10-D: blank base URL short-circuits before any HTTP call
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * <strong>Property 10-D: blank base URL returns false with zero upstream GETs</strong>
     *
     * <p>When {@code LLM_BASE_URL} is blank or absent, {@code isConfigured()} must
     * return {@code false} without making any upstream HTTP call. This is a
     * pre-condition guard in the implementation that ensures no spurious probes occur.
     *
     * <p><strong>Validates: Requirements 3.5</strong>
     */
    @Example
    @Label("Property 10-D: blank base URL returns false with zero upstream GETs")
    void property10d_blankBaseUrl_noProbeAndReturnsFalse() throws Exception {
        // Build a provider with a blank base URL.
        UtmConfigurationParameterRepository configRepo =
            mock(UtmConfigurationParameterRepository.class);
        stubConfigParam(configRepo, OllamaLlmProvider.KEY_BASE_URL,    "");
        stubConfigParam(configRepo, OllamaLlmProvider.KEY_MODEL,       "llama3.2:3b");
        stubConfigParam(configRepo, OllamaLlmProvider.KEY_TEMPERATURE, null);
        stubConfigParam(configRepo, OllamaLlmProvider.KEY_MAX_TOKENS,  null);

        AtomicInteger blankProbeCount = new AtomicInteger(0);
        OllamaLlmProvider blankProvider =
            new OllamaLlmProvider(new ObjectMapper(), mutableClock, configRepo);
        injectMockWebClient(blankProvider, blankProbeCount);

        SoftAssertions softly = new SoftAssertions();

        for (int i = 0; i < 5; i++) {
            boolean result = blankProvider.isConfigured();
            softly.assertThat(result)
                .as("isConfigured() must return false when base URL is blank (call %d)", i + 1)
                .isFalse();
        }

        softly.assertThat(blankProbeCount.get())
            .as("No upstream GET should be made when base URL is blank")
            .isEqualTo(0);

        softly.assertAll();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Arbitrary providers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Generates offsets strictly greater than 30 seconds (31..120s) to represent
     * calls that arrive after the health probe TTL has expired.
     */
    @Provide
    Arbitrary<Long> postExpirOffsets() {
        return Arbitraries.longs()
            .between(CACHE_TTL_SECONDS + 1L, 120L);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Stubs a config-parameter lookup on {@code repo}.
     *
     * @param repo  the mock repository
     * @param key   the parameter key (e.g. {@code KEY_BASE_URL})
     * @param value the parameter value, or {@code null} to simulate a missing row
     */
    private static void stubConfigParam(UtmConfigurationParameterRepository repo,
                                        String key,
                                        String value) {
        if (value == null) {
            when(repo.findByConfParamShort(key)).thenReturn(Optional.empty());
        } else {
            UtmConfigurationParameter param = new UtmConfigurationParameter();
            param.setConfParamShort(key);
            param.setConfParamValue(value);
            when(repo.findByConfParamShort(key)).thenReturn(Optional.of(param));
        }
    }

    /**
     * Injects a mock {@link WebClient} into the {@code webClient} field of the
     * provided {@link OllamaLlmProvider} instance using reflection.
     *
     * <p>The injected mock increments {@code counter} on every call to
     * {@link WebClient#get()} (one increment = one health probe attempt) and
     * returns a successful (HTTP 200) response so that
     * {@code executeHealthProbe()} returns {@code true}.
     *
     * @param target  the provider instance to instrument
     * @param counter the counter to increment on each probe
     * @throws Exception if reflection access fails
     */
    @SuppressWarnings("unchecked")
    private static void injectMockWebClient(OllamaLlmProvider target,
                                            AtomicInteger counter) throws Exception {
        // Build the mock call chain:
        //   webClient.get()
        //     .uri("/api/tags")
        //     .retrieve()
        //     .toBodilessEntity()  →  Mono<ResponseEntity<Void>>
        Mono<ResponseEntity<Void>> successMono =
            Mono.just(ResponseEntity.ok().<Void>build());

        WebClient.ResponseSpec responseSpec = mock(WebClient.ResponseSpec.class);
        when(responseSpec.toBodilessEntity()).thenReturn(successMono);

        WebClient.RequestHeadersSpec<?> headersSpec = mock(WebClient.RequestHeadersSpec.class);
        when(headersSpec.retrieve()).thenReturn(responseSpec);

        WebClient.RequestHeadersUriSpec<?> uriSpec = mock(WebClient.RequestHeadersUriSpec.class);
        when(uriSpec.uri(anyString()))
            .thenAnswer(inv -> headersSpec);

        WebClient mockWebClient = mock(WebClient.class);
        when(mockWebClient.get()).thenAnswer(invocation -> {
            counter.incrementAndGet();
            return uriSpec;
        });

        // Inject via reflection — field is `private volatile` in OllamaLlmProvider.
        Field webClientField = OllamaLlmProvider.class.getDeclaredField("webClient");
        webClientField.setAccessible(true);
        webClientField.set(target, mockWebClient);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MutableClock — controllable wall clock for time-advancement simulation
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * A {@link Clock} implementation whose current instant can be advanced
     * programmatically, allowing tests to simulate time passage without any
     * real-time sleep.
     *
     * <p>The clock is NOT thread-safe; it is used single-threaded within each
     * jqwik trial.
     */
    static final class MutableClock extends Clock {

        private Instant now;

        MutableClock(Instant initial) {
            this.now = initial;
        }

        /**
         * Advances the clock by the given number of seconds.
         *
         * @param seconds the number of seconds to add; must be non-negative
         */
        void advance(long seconds) {
            now = now.plusSeconds(seconds);
        }

        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this; // zone changes are irrelevant for these tests
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
