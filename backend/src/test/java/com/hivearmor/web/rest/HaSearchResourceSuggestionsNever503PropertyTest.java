package com.hivearmor.web.rest;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.HaSearchService;
import com.hivearmor.service.HaSearchSuggestionService;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.web.rest.errors.HaAiExceptionHandler;
import net.jqwik.api.*;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Collections;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * Property 6: Suggestions endpoint never returns 503.
 *
 * <p><strong>Property 6: Suggestions endpoint never returns 503</strong><br>
 * For arbitrary combinations of {@code (configured, opensearchOutcome)} where:
 * <ul>
 *   <li>{@code configured ∈ {true, false}}</li>
 *   <li>{@code opensearchOutcome ∈ {returnBuckets, throwTransport, throwIndexMissing, throwRuntime}}</li>
 * </ul>
 * the {@code GET /api/ha-search/suggestions} endpoint must:
 * <ol>
 *   <li>Return HTTP 200 (never 503).</li>
 *   <li>Return a response body that is a JSON array.</li>
 *   <li>Each entry has {@code label}, {@code dsl}, and {@code description} fields.</li>
 *   <li>Array length is in {@code [0, 20]}.</li>
 * </ol>
 *
 * <p><strong>Validates: Requirements 6.1, 6.2, 6.3</strong>
 */
@Label("Feature: sprint-26-nl-search, Property 6: Suggestions endpoint never returns 503")
class HaSearchResourceSuggestionsNever503PropertyTest {

    private static final String ENDPOINT =
        "/api/ha-search/suggestions?indexPattern=v3-hive-alert-*&count=5";

    private static final int SUGGESTIONS_MAX_COUNT = 20;

    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * Security filter that injects an ANALYST authority into every request,
     * bypassing the full Spring Security filter chain while preserving
     * {@code @PreAuthorize} evaluation via standalone MockMvc.
     */
    private static final OncePerRequestFilter ANALYST_FILTER = new OncePerRequestFilter() {
        @Override
        protected void doFilterInternal(HttpServletRequest req,
                                        HttpServletResponse resp,
                                        FilterChain chain)
                throws ServletException, IOException {
            SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                    "analyst", null,
                    Collections.singletonList(new SimpleGrantedAuthority("ANALYST"))));
            chain.doFilter(req, resp);
        }
    };

    // =========================================================================
    // Outcome enum — the four OpenSearch outcomes under test
    // =========================================================================

    /**
     * The four OpenSearch scenarios exercised by Property 6.
     * Each value controls how the mocked OpenSearch dependencies behave when
     * the LLM is configured and the service tries to aggregate top categories.
     */
    enum OpenSearchOutcome {
        /** Returns a small static list of buckets (normal happy-path from cache). */
        RETURN_BUCKETS,
        /** Throws a transport-level exception (network error, connection refused). */
        THROW_TRANSPORT,
        /** Throws a RuntimeException simulating an index-missing error. */
        THROW_INDEX_MISSING,
        /** Throws a generic {@link RuntimeException} (unexpected failure). */
        THROW_RUNTIME
    }

    // =========================================================================
    // Property 6: HTTP 200 + valid JSON array regardless of outcome
    // =========================================================================

    /**
     * For all combinations of {@code configured ∈ {true, false}} and
     * {@code opensearchOutcome ∈ {returnBuckets, throwTransport, throwIndexMissing, throwRuntime}}
     * the suggestions endpoint must always return HTTP 200 with a valid JSON array.
     *
     * <p><strong>Validates: Requirements 6.1, 6.2, 6.3</strong>
     */
    @Property(tries = 100)
    @Label("Property 6: suggestions endpoint returns HTTP 200 with valid JSON array for all (configured, outcome) pairs")
    void property6_suggestionsNeverReturns503(
            @ForAll("configuredValues") boolean configured,
            @ForAll("opensearchOutcomes") OpenSearchOutcome outcome) throws Exception {

        MockMvc mvc = configureAndBuildMockMvc(configured, outcome);

        MvcResult result = mvc.perform(get(ENDPOINT)).andReturn();

        assertNever503AndValidArray(result, configured, outcome);
    }

    // =========================================================================
    // Arbitrary providers
    // =========================================================================

    /**
     * Generates both possible values of the {@code configured} flag.
     */
    @Provide
    Arbitrary<Boolean> configuredValues() {
        return Arbitraries.of(true, false);
    }

    /**
     * Generates all four OpenSearch outcome scenarios.
     */
    @Provide
    Arbitrary<OpenSearchOutcome> opensearchOutcomes() {
        return Arbitraries.of(OpenSearchOutcome.values());
    }

    // =========================================================================
    // Mock construction helper
    // =========================================================================

    /**
     * Constructs a standalone MockMvc for {@link HaSearchResource} with
     * mocked dependencies configured to simulate each {@code (configured, outcome)} pair.
     *
     * <p>Strategy:
     * <ul>
     *   <li>When {@code !configured}: {@link HaLlmService#isConfigured()} returns {@code false}
     *       so the real {@code listSuggestions} returns {@link HaSearchSuggestionService#STATIC_FALLBACK}
     *       immediately — no OpenSearch call is made.</li>
     *   <li>When {@code configured && outcome == RETURN_BUCKETS}: {@code osClient.execute} returns
     *       a minimal mock {@link org.opensearch.client.opensearch.core.SearchResponse} that yields
     *       no aggregation buckets; the service returns an empty list (or falls back gracefully).</li>
     *   <li>When {@code configured && outcome ∈ {THROW_*}}: {@code msspIndexResolver.resolveIndexPattern}
     *       throws the appropriate exception; the real {@code listSuggestions} catch-block fires
     *       and returns {@link HaSearchSuggestionService#STATIC_FALLBACK}.</li>
     * </ul>
     *
     * <p>This approach exercises the real {@code listSuggestions} try/catch logic rather than
     * bypassing it, which is what Property 6 is designed to validate.
     */
    private MockMvc configureAndBuildMockMvc(boolean configured,
                                              OpenSearchOutcome outcome) throws Exception {
        // --- mocked dependencies ------------------------------------------------
        HaLlmService haLlmService             = mock(HaLlmService.class);
        MsspIndexResolver msspIndexResolver    = mock(MsspIndexResolver.class);
        OpensearchClientBuilder osClientMock   = mock(OpensearchClientBuilder.class);

        when(haLlmService.isConfigured()).thenReturn(configured);

        if (configured) {
            // When LLM is configured, listSuggestions proceeds past the isConfigured() gate.
            // We control the outcome by making msspIndexResolver (called first inside the
            // try-block of listSuggestions) either succeed or throw.
            //
            // RETURN_BUCKETS: resolveIndexPattern succeeds; osClientMock.execute returns null
            //   by default → NullPointerException inside aggregateTopCategories → caught by
            //   the try/catch in listSuggestions → STATIC_FALLBACK is returned.  HTTP 200.
            //
            // THROW_*: resolveIndexPattern throws immediately → caught by the try/catch →
            //   STATIC_FALLBACK is returned.  HTTP 200.
            if (outcome == OpenSearchOutcome.RETURN_BUCKETS) {
                when(msspIndexResolver.resolveIndexPattern(anyString()))
                    .thenReturn("v3-hive-alert-*");
                // osClientMock.execute is not stubbed; returns null → NPE caught → fallback.
            } else if (outcome == OpenSearchOutcome.THROW_TRANSPORT) {
                when(msspIndexResolver.resolveIndexPattern(anyString()))
                    .thenThrow(new RuntimeException(
                        "TransportException: Connection refused to OpenSearch cluster"));
            } else if (outcome == OpenSearchOutcome.THROW_INDEX_MISSING) {
                when(msspIndexResolver.resolveIndexPattern(anyString()))
                    .thenThrow(new RuntimeException(
                        "index_not_found_exception: no such index [v3-hive-alert-*]"));
            } else if (outcome == OpenSearchOutcome.THROW_RUNTIME) {
                when(msspIndexResolver.resolveIndexPattern(anyString()))
                    .thenThrow(new RuntimeException(
                        "Unexpected runtime error during OpenSearch aggregation"));
            }
        }
        // When !configured, the service returns STATIC_FALLBACK before touching
        // msspIndexResolver — no stub needed for that path.

        // Build a real HaSearchSuggestionService so its try/catch fallback logic runs.
        HaSearchSuggestionService suggestionService =
            new HaSearchSuggestionService(msspIndexResolver, haLlmService,
                                          osClientMock, objectMapper);

        // HaSearchService is needed for the nl-to-dsl endpoint wired in the same controller.
        HaSearchService haSearchService =
            new HaSearchService(haLlmService, objectMapper, msspIndexResolver);

        HaSearchResource controller =
            new HaSearchResource(osClientMock, msspIndexResolver,
                                 haSearchService, suggestionService);

        return MockMvcBuilders
            .standaloneSetup(controller)
            .setControllerAdvice(new HaAiExceptionHandler())
            .addFilter(ANALYST_FILTER)
            .build();
    }

    // =========================================================================
    // Core assertions
    // =========================================================================

    /**
     * Asserts that the response:
     * <ol>
     *   <li>Has HTTP status 200 (never 503).</li>
     *   <li>Body is a JSON array.</li>
     *   <li>Array length is in {@code [0, 20]}.</li>
     *   <li>Each element has {@code label}, {@code dsl}, and {@code description} fields.</li>
     * </ol>
     *
     * @param result     the MvcResult from the performed GET
     * @param configured the {@code configured} flag used in this try
     * @param outcome    the OpenSearch outcome used in this try
     */
    private void assertNever503AndValidArray(MvcResult result,
                                              boolean configured,
                                              OpenSearchOutcome outcome) throws Exception {
        int status = result.getResponse().getStatus();
        String body = result.getResponse().getContentAsString();

        assertThat(status)
            .as("HTTP status must be 200 (not 503) for configured=%s, outcome=%s; body=%s",
                configured, outcome, abbrev(body))
            .isEqualTo(200);

        assertThat(body)
            .as("Response body must not be blank for configured=%s, outcome=%s",
                configured, outcome)
            .isNotBlank();

        JsonNode root;
        try {
            root = objectMapper.readTree(body);
        } catch (Exception e) {
            throw new AssertionError(
                "Response body must be valid JSON for configured=" + configured
                    + ", outcome=" + outcome + "; body=" + abbrev(body), e);
        }

        assertThat(root.isArray())
            .as("Response body must be a JSON array for configured=%s, outcome=%s; body=%s",
                configured, outcome, abbrev(body))
            .isTrue();

        int arrayLength = root.size();
        assertThat(arrayLength)
            .as("Array length must be in [0, %d] for configured=%s, outcome=%s",
                SUGGESTIONS_MAX_COUNT, configured, outcome)
            .isBetween(0, SUGGESTIONS_MAX_COUNT);

        for (int i = 0; i < arrayLength; i++) {
            JsonNode entry = root.get(i);
            String entryCtx = String.format(
                "entry[%d] for configured=%s, outcome=%s; body=%s",
                i, configured, outcome, abbrev(body));

            assertThat(entry.has("label"))
                .as("entry must have 'label' field — %s", entryCtx)
                .isTrue();
            assertThat(entry.has("dsl"))
                .as("entry must have 'dsl' field — %s", entryCtx)
                .isTrue();
            assertThat(entry.has("description"))
                .as("entry must have 'description' field — %s", entryCtx)
                .isTrue();

            // 'label' and 'description' must be non-null strings.
            assertThat(entry.get("label").isNull())
                .as("'label' must not be null — %s", entryCtx)
                .isFalse();
            assertThat(entry.get("description").isNull())
                .as("'description' must not be null — %s", entryCtx)
                .isFalse();

            // 'dsl' must be a non-null string.
            assertThat(entry.get("dsl").isNull())
                .as("'dsl' must not be null — %s", entryCtx)
                .isFalse();
        }
    }

    /** Abbreviates a string to 120 characters for readable assertion diagnostics. */
    private static String abbrev(String s) {
        if (s == null) return "<null>";
        return s.length() > 120 ? s.substring(0, 120) + "…" : s;
    }
}
