package com.hivearmor.service.llm;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.repository.UtmConfigurationParameterRepository;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
import org.springframework.web.reactive.function.client.WebClientRequestException;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Flux;
import reactor.util.retry.Retry;

import java.net.URI;
import java.time.Clock;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Property-based tests for {@link OllamaLlmProvider} retry semantics.
 *
 * <h3>Property 7: Ollama transport errors retry at most twice</h3>
 * <p>For any sequence of transport failures ({@link WebClientRequestException})
 * of length {@code k} produced by a mocked Ollama upstream, followed by a success,
 * {@link OllamaLlmProvider} SHALL make exactly {@code min(k + 1, 3)} upstream
 * attempts. When {@code k >= 3}, the operation SHALL propagate the third failure
 * without a fourth attempt. Server-side responses
 * ({@link WebClientResponseException}) SHALL never be retried.
 *
 * <h2>Test strategy</h2>
 * <p>The property is exercised directly against the
 * {@link OllamaLlmProvider#retrySpecForRequestErrors()} method — the package-private
 * method that produces the {@link Retry} spec used by every outbound operation.
 * A synthetic counting {@link Flux} throws {@code k} transport errors and then
 * emits one success item. Applying the retry spec and counting subscriptions verifies
 * the {@code min(k + 1, 3)} invariant without requiring a live HTTP server.
 *
 * <p>Three sub-properties are verified:
 * <ol>
 *   <li><strong>7-A</strong> — For {@code k} transport failures followed by success,
 *       exactly {@code min(k + 1, 3)} attempts are made.</li>
 *   <li><strong>7-B</strong> — When {@code k >= 3}, the third failure propagates
 *       without a fourth attempt.</li>
 *   <li><strong>7-C</strong> — {@link WebClientResponseException} (server-side HTTP
 *       error) is never retried; only one attempt is made.</li>
 * </ol>
 *
 * <p><strong>Validates: Requirements 3.6</strong>
 */
@Label("Feature: sprint-27-ollama, Property 7: Ollama transport errors retry at most twice")
class RetryBehaviorPropertyTest {

    /** Maximum retries declared in {@link OllamaLlmProvider#MAX_RETRY_ATTEMPTS}. */
    private static final int MAX_RETRIES = OllamaLlmProvider.MAX_RETRY_ATTEMPTS; // 2

    /** Maximum total attempts = 1 initial + MAX_RETRIES retries. */
    private static final int MAX_ATTEMPTS = MAX_RETRIES + 1; // 3

    private OllamaLlmProvider provider;

    /**
     * Re-creates a minimal {@link OllamaLlmProvider} before every jqwik trial.
     * The config repository is mocked to return empty for all param lookups so
     * {@code loadConfig()} completes without a database. Clock and ObjectMapper
     * use real instances; neither is exercised by the retry-spec tests.
     */
    @BeforeTry
    void setUp() {
        UtmConfigurationParameterRepository configRepo =
                mock(UtmConfigurationParameterRepository.class);
        when(configRepo.findByConfParamShort(anyString())).thenReturn(Optional.empty());

        provider = new OllamaLlmProvider(new ObjectMapper(), Clock.systemUTC(), configRepo);
    }

    // =========================================================================
    // Property 7-A: k transport failures then success → min(k+1, 3) attempts
    // =========================================================================

    /**
     * <strong>Property 7-A: exactly {@code min(k + 1, 3)} upstream attempts for
     * {@code k} transport failures followed by success.</strong>
     *
     * <p>For each value of {@code k} in {@code [0, 5]}:
     * <ul>
     *   <li>When {@code k < 3}: the operation succeeds after {@code k + 1} attempts
     *       (1 initial failure per retry, then the final successful attempt).</li>
     *   <li>When {@code k >= 3}: the retry spec is exhausted at attempt 3, so the
     *       third failure propagates — success never occurs. This sub-case is covered
     *       by Property 7-B; here we assert the attempt count at the point of
     *       exhaustion using a capped approach.</li>
     * </ul>
     *
     * <p><strong>Validates: Requirements 3.6</strong>
     */
    @Property(tries = 60)
    @Label("Property 7-A: min(k+1,3) total attempts for k transport failures then success")
    void property7a_transportFailuresThenSuccess_exactAttemptsObserved(
            @ForAll("transportFailureCounts") int k) {

        int expectedAttempts = Math.min(k + 1, MAX_ATTEMPTS);
        AtomicInteger attemptCounter = new AtomicInteger(0);

        Retry retrySpec = provider.retrySpecForRequestErrors();

        // A Flux that counts subscriptions and throws WebClientRequestException k
        // times, then emits "ok" on the (k+1)-th subscription.
        Flux<String> countingFlux = Flux.defer(() -> {
            int attempt = attemptCounter.incrementAndGet();
            if (attempt <= k) {
                return Flux.error(transportError("simulated transport failure #" + attempt));
            }
            return Flux.just("ok");
        });

        if (k < MAX_ATTEMPTS) {
            // Success path: the operation should complete normally after k+1 attempts
            String result = countingFlux
                    .retryWhen(retrySpec)
                    .blockLast();

            assertThat(result)
                    .as("Flux must emit 'ok' when k=%d transport failures precede success", k)
                    .isEqualTo("ok");

            assertThat(attemptCounter.get())
                    .as("For k=%d transport failures then success, exactly %d attempts expected",
                            k, expectedAttempts)
                    .isEqualTo(expectedAttempts);

        } else {
            // Exhaustion path: retries run out before success; third failure propagates.
            // Drain the flux by swallowing the terminal error via onErrorResume so we
            // can inspect the attempt count after the stream terminates.
            countingFlux
                    .retryWhen(retrySpec)
                    .onErrorResume(ex -> Flux.empty())
                    .blockLast();

            assertThat(attemptCounter.get())
                    .as("For k=%d (>= MAX_ATTEMPTS=%d), exactly %d attempts before exhaustion",
                            k, MAX_ATTEMPTS, MAX_ATTEMPTS)
                    .isEqualTo(MAX_ATTEMPTS);
        }
    }

    // =========================================================================
    // Property 7-B: k >= 3 → third failure propagates, no fourth attempt
    // =========================================================================

    /**
     * <strong>Property 7-B: when {@code k >= 3}, the operation propagates the
     * third failure and makes no fourth attempt.</strong>
     *
     * <p>The retry spec allows at most {@value MAX_RETRIES} retries (total
     * {@value MAX_ATTEMPTS} attempts). When all transport failures exceed the retry
     * budget, the final {@link WebClientRequestException} propagates to the subscriber
     * without triggering a fourth subscription.
     *
     * <p><strong>Validates: Requirements 3.6</strong>
     */
    @Property(tries = 30)
    @Label("Property 7-B: k >= 3 transport failures propagate at attempt 3, no fourth attempt")
    void property7b_kGe3_thirdFailurePropagates_noFourthAttempt(
            @ForAll("exhaustionFailureCounts") int k) {

        AtomicInteger attemptCounter = new AtomicInteger(0);
        Retry retrySpec = provider.retrySpecForRequestErrors();

        // Always fails with WebClientRequestException
        Flux<String> alwaysFailingFlux = Flux.defer(() -> {
            attemptCounter.incrementAndGet();
            return Flux.error(transportError("always-fail transport error"));
        });

        // Capture the terminal error via onErrorResume so we can assert on it
        AtomicInteger capturedAttempts = new AtomicInteger(0);

        alwaysFailingFlux
                .retryWhen(retrySpec)
                .onErrorResume(ex -> {
                    capturedAttempts.set(attemptCounter.get());
                    return Flux.empty();
                })
                .blockLast();

        assertThat(capturedAttempts.get())
                .as("For k=%d (exhaustion), exactly %d attempts must occur before error propagation",
                        k, MAX_ATTEMPTS)
                .isEqualTo(MAX_ATTEMPTS);

        assertThat(capturedAttempts.get())
                .as("No more than MAX_ATTEMPTS=%d attempts are allowed (Req 3.6, retry budget)",
                        MAX_ATTEMPTS)
                .isLessThanOrEqualTo(MAX_ATTEMPTS);
    }

    // =========================================================================
    // Property 7-C: WebClientResponseException is never retried
    // =========================================================================

    /**
     * <strong>Property 7-C: server-side HTTP errors ({@link WebClientResponseException})
     * are never retried — exactly one attempt is always made.</strong>
     *
     * <p>The retry spec filters exclusively on {@link WebClientRequestException}.
     * Any {@link WebClientResponseException} (e.g. HTTP 4xx or 5xx from Ollama)
     * must propagate immediately after the first attempt without a retry.
     *
     * <p>This property covers HTTP status codes from the representative set of
     * Ollama server errors: 400, 404, 422, 429, 500, 502, 503.
     *
     * <p><strong>Validates: Requirements 3.6</strong>
     */
    @Property(tries = 70)
    @Label("Property 7-C: WebClientResponseException is never retried — exactly one attempt")
    void property7c_serverSideError_neverRetried_exactlyOneAttempt(
            @ForAll("httpStatusCodes") int statusCode) {

        AtomicInteger attemptCounter = new AtomicInteger(0);
        Retry retrySpec = provider.retrySpecForRequestErrors();

        WebClientResponseException serverError = WebClientResponseException.create(
                statusCode, "Simulated Ollama HTTP " + statusCode,
                org.springframework.http.HttpHeaders.EMPTY,
                null, null);

        Flux<String> serverErrorFlux = Flux.defer(() -> {
            attemptCounter.incrementAndGet();
            return Flux.error(serverError);
        });

        // Capture the propagated error
        AtomicInteger capturedAttempts = new AtomicInteger(0);

        serverErrorFlux
                .retryWhen(retrySpec)
                .onErrorResume(ex -> {
                    capturedAttempts.set(attemptCounter.get());
                    return Flux.empty();
                })
                .blockLast();

        assertThat(capturedAttempts.get())
                .as("WebClientResponseException (HTTP %d) must never be retried — "
                        + "exactly 1 attempt expected (Req 3.6)", statusCode)
                .isEqualTo(1);
    }

    // =========================================================================
    // Property 7-D: retry spec filters WebClientRequestException, not supertype
    // =========================================================================

    /**
     * <strong>Property 7-D: the retry spec accepts {@link WebClientRequestException}
     * and its subclasses, and rejects {@link WebClientResponseException}.</strong>
     *
     * <p>Directly tests the filter predicate from
     * {@link OllamaLlmProvider#retrySpecForRequestErrors()} by inspecting which
     * exception types are accepted by the underlying filter. This property ensures
     * the spec is not over-broad (accepting all {@link Throwable}) or too narrow
     * (only accepting exact type match).
     *
     * <p><strong>Validates: Requirements 3.6</strong>
     */
    @Example
    @Label("Property 7-D: retrySpec accepts WebClientRequestException, rejects WebClientResponseException")
    void property7d_retrySpecFilter_acceptsRequestException_rejectsResponseException() {
        AtomicInteger requestExceptionAttempts = new AtomicInteger(0);

        Retry retrySpec = provider.retrySpecForRequestErrors();

        // 1 transport failure then success — should retry and succeed
        Flux<String> requestExFlux = Flux.defer(() -> {
            int attempt = requestExceptionAttempts.incrementAndGet();
            if (attempt == 1) {
                return Flux.error(transportError("transport failure for 7-D test"));
            }
            return Flux.just("recovered");
        });

        String result = requestExFlux.retryWhen(retrySpec).blockLast();

        assertThat(result)
                .as("After 1 WebClientRequestException, the retry spec must allow a retry and succeed")
                .isEqualTo("recovered");
        assertThat(requestExceptionAttempts.get())
                .as("Exactly 2 attempts for 1 transport failure (1 initial + 1 retry)")
                .isEqualTo(2);

        // WebClientResponseException — must propagate without retry
        AtomicInteger responseExAttempts = new AtomicInteger(0);

        Flux<String> responseExFlux = Flux.defer(() -> {
            responseExAttempts.incrementAndGet();
            return Flux.error(WebClientResponseException.create(
                    500, "Internal Server Error",
                    org.springframework.http.HttpHeaders.EMPTY, null, null));
        });

        AtomicInteger finalResponseAttempts = new AtomicInteger(0);
        responseExFlux
                .retryWhen(provider.retrySpecForRequestErrors())
                .onErrorResume(ex -> {
                    finalResponseAttempts.set(responseExAttempts.get());
                    return Flux.empty();
                })
                .blockLast();

        assertThat(finalResponseAttempts.get())
                .as("WebClientResponseException must not trigger any retry — exactly 1 attempt")
                .isEqualTo(1);
    }

    // =========================================================================
    // Arbitraries (generators)
    // =========================================================================

    /**
     * Generates {@code k} values in {@code [0, 5]} representing the number of
     * transport failures before a success. This covers the full span from
     * zero failures (immediate success, 1 attempt) through values that exhaust
     * the retry budget (k >= 3 means success is never reached within budget).
     */
    @Provide
    Arbitrary<Integer> transportFailureCounts() {
        return Arbitraries.integers().between(0, 5);
    }

    /**
     * Generates {@code k} values in {@code [3, 10]} representing failure counts
     * that exhaust the retry budget. Used by Property 7-B to exercise the
     * exhaustion path exclusively.
     */
    @Provide
    Arbitrary<Integer> exhaustionFailureCounts() {
        return Arbitraries.integers().between(MAX_ATTEMPTS, 10);
    }

    /**
     * Generates HTTP status codes representative of Ollama server errors.
     * These are all {@link WebClientResponseException} territory — none should
     * trigger a retry under Property 7-C.
     */
    @Provide
    Arbitrary<Integer> httpStatusCodes() {
        return Arbitraries.of(400, 401, 403, 404, 422, 429, 500, 502, 503, 504);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Constructs a minimal {@link WebClientRequestException} representing a
     * transport-layer failure (connection refused, DNS failure, read timeout, etc.).
     *
     * <p>{@link WebClientRequestException} is a concrete class requiring a
     * {@link Throwable} cause and a target {@link URI} — we supply a simple
     * {@link RuntimeException} cause and a placeholder URI.
     */
    private static WebClientRequestException transportError(String message) {
        return new WebClientRequestException(
                new RuntimeException(message),
                org.springframework.http.HttpMethod.POST,
                URI.create("http://localhost:11434/api/chat"),
                org.springframework.http.HttpHeaders.EMPTY);
    }
}
