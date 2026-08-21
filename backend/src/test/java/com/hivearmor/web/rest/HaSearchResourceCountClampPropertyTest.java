package com.hivearmor.web.rest;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.HaSearchService;
import com.hivearmor.service.HaSearchSuggestionService;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.web.rest.dto.SuggestedSearchDTO;
import net.jqwik.api.*;
import net.jqwik.api.constraints.IntRange;
import net.jqwik.api.lifecycle.BeforeTry;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * Property 7: Suggestions endpoint clamps {@code count} to {@code [1, SuggestionsMaxCount]}.
 *
 * <p><strong>Property 7: Suggestions endpoint clamps {@code count} to
 * {@code [1, SuggestionsMaxCount]}</strong><br>
 * For any integer {@code n} supplied as the {@code count} query parameter,
 * the effective value forwarded to
 * {@link HaSearchSuggestionService#listSuggestions(String, int)} must equal
 * {@code min(max(1, n), 20)}, and the returned array length must be ≤ that
 * effective count.
 *
 * <p>A Mockito {@code spy()} on the real {@code HaSearchSuggestionService} is
 * used to capture the {@code count} argument without loading a Spring context.
 * Because no Spring container is present, the {@code @Cacheable} annotation on
 * {@code listSuggestions} is inert — the spy receives every real invocation.
 *
 * <p>A separate sub-property verifies the default count (when the {@code count}
 * parameter is omitted): the controller must pass {@code 5} to the service.
 *
 * <p><strong>Validates: Requirements 5.3</strong>
 */
@Label("Feature: sprint-26-nl-search, Property 7: Suggestions endpoint clamps count")
class HaSearchResourceCountClampPropertyTest {

    /** Maximum count the controller is allowed to forward (SuggestionsMaxCount). */
    private static final int SUGGESTIONS_MAX_COUNT = 20;

    /** Default count when the query param is absent (SuggestionsDefaultCount). */
    private static final int SUGGESTIONS_DEFAULT_COUNT = 5;

    /** Endpoint under test. */
    private static final String ENDPOINT = "/api/ha-search/suggestions";

    /** Fixed index pattern used in every request. */
    private static final String INDEX_PATTERN = "v3-hive-alert-*";

    private MockMvc mockMvc;
    private HaSearchSuggestionService suggestionServiceSpy;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * Injects an ANALYST authority into every request so that
     * {@code @PreAuthorize} on the controller method passes without
     * loading the full Spring Security filter chain.
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

    /**
     * Rebuilds fresh mocks and a new standalone MockMvc before every jqwik try
     * so that argument captors and stub configurations from one try cannot bleed
     * into the next.
     */
    @BeforeTry
    void setUp() {
        // Build the real service with all dependencies mocked.
        MsspIndexResolver msspIndexResolver = mock(MsspIndexResolver.class);
        HaLlmService haLlmService = mock(HaLlmService.class);
        OpensearchClientBuilder osClient = mock(OpensearchClientBuilder.class);

        // HaLlmService.isConfigured() returns false → service falls back to
        // STATIC_FALLBACK without touching OpenSearch.  This is sufficient for
        // exercising the count-clamping code path in the controller.
        when(haLlmService.isConfigured()).thenReturn(false);

        HaSearchSuggestionService realService =
            new HaSearchSuggestionService(msspIndexResolver, haLlmService, osClient, objectMapper);

        // Spy wraps the real object so listSuggestions is a real call whose
        // argument we can capture.  @Cacheable is NOT active outside Spring.
        suggestionServiceSpy = spy(realService);

        // Wire the controller with the spied service.
        HaSearchService haSearchService =
            new HaSearchService(haLlmService, objectMapper, msspIndexResolver);

        HaSearchResource controller =
            new HaSearchResource(osClient, msspIndexResolver, haSearchService, suggestionServiceSpy);

        mockMvc = MockMvcBuilders
            .standaloneSetup(controller)
            .addFilter(ANALYST_FILTER)
            .build();
    }

    // =========================================================================
    // Property 7-A: explicit count param is clamped to [1, 20]
    // =========================================================================

    /**
     * For any integer {@code n} in the full int range, the effective count
     * forwarded to {@link HaSearchSuggestionService#listSuggestions} must equal
     * {@code min(max(1, n), 20)}, and the response array length must not exceed
     * that effective count.
     *
     * <p><strong>Validates: Requirements 5.3</strong>
     */
    @Property(tries = 200)
    @Label("Property 7-A: explicit count is clamped to [1, SuggestionsMaxCount=20]")
    void property7a_explicitCountIsClamped(
            @ForAll @IntRange(min = Integer.MIN_VALUE, max = Integer.MAX_VALUE) int n)
            throws Exception {

        int expected = Math.min(Math.max(1, n), SUGGESTIONS_MAX_COUNT);

        // Capture the count argument received by listSuggestions.
        ArgumentCaptor<Integer> countCaptor = ArgumentCaptor.forClass(Integer.class);

        MvcResult result = mockMvc.perform(
                get(ENDPOINT)
                    .param("indexPattern", INDEX_PATTERN)
                    .param("count", String.valueOf(n))
                    .accept(MediaType.APPLICATION_JSON))
            .andReturn();

        // The endpoint must have returned HTTP 200.
        assertThat(result.getResponse().getStatus())
            .as("HTTP status must be 200 for count=%d", n)
            .isEqualTo(200);

        // Verify listSuggestions was called exactly once and capture the count arg.
        verify(suggestionServiceSpy, times(1))
            .listSuggestions(eq(INDEX_PATTERN), countCaptor.capture());

        int actual = countCaptor.getValue();
        assertThat(actual)
            .as("Effective count passed to listSuggestions must equal min(max(1,%d),20)=%d but was %d",
                n, expected, actual)
            .isEqualTo(expected);

        // Parse the response body and assert array length ≤ effective count.
        String body = result.getResponse().getContentAsString();
        SuggestedSearchDTO[] items = objectMapper.readValue(body, SuggestedSearchDTO[].class);
        assertThat(items.length)
            .as("Response array length %d must be ≤ effective count %d (n=%d)",
                items.length, expected, n)
            .isLessThanOrEqualTo(expected);
    }

    // =========================================================================
    // Property 7-B: omitted count defaults to 5
    // =========================================================================

    /**
     * When the {@code count} query parameter is omitted, the controller must pass
     * {@code SuggestionsDefaultCount = 5} to
     * {@link HaSearchSuggestionService#listSuggestions}.
     *
     * <p><strong>Validates: Requirements 5.3</strong>
     */
    @Property(tries = 1)
    @Label("Property 7-B: omitted count defaults to SuggestionsDefaultCount=5")
    void property7b_omittedCountDefaultsToFive() throws Exception {

        ArgumentCaptor<Integer> countCaptor = ArgumentCaptor.forClass(Integer.class);

        MvcResult result = mockMvc.perform(
                get(ENDPOINT)
                    .param("indexPattern", INDEX_PATTERN)
                    .accept(MediaType.APPLICATION_JSON))
            .andReturn();

        assertThat(result.getResponse().getStatus())
            .as("HTTP status must be 200 when count param is omitted")
            .isEqualTo(200);

        verify(suggestionServiceSpy, times(1))
            .listSuggestions(eq(INDEX_PATTERN), countCaptor.capture());

        int actual = countCaptor.getValue();
        assertThat(actual)
            .as("Default count must equal SuggestionsDefaultCount=%d but was %d",
                SUGGESTIONS_DEFAULT_COUNT, actual)
            .isEqualTo(SUGGESTIONS_DEFAULT_COUNT);
    }

    // =========================================================================
    // Property 7-C: boundary values are clamped correctly
    // =========================================================================

    /**
     * Spot-checks the three canonical boundary values:
     * <ul>
     *   <li>{@code n = 0} → effective = 1 (below minimum)</li>
     *   <li>{@code n = 20} → effective = 20 (exactly at maximum)</li>
     *   <li>{@code n = 21} → effective = 20 (above maximum)</li>
     * </ul>
     *
     * <p><strong>Validates: Requirements 5.3</strong>
     */
    @Property(tries = 1)
    @Label("Property 7-C: boundary values 0, 20, 21 clamp to 1, 20, 20 respectively")
    void property7c_boundaryValues() throws Exception {
        assertClampedCount(0,  1,  "n=0 should clamp to 1");
        assertClampedCount(20, 20, "n=20 should remain 20");
        assertClampedCount(21, 20, "n=21 should clamp to 20");
    }

    // =========================================================================
    // Property 7-D: extreme values (MIN_VALUE, MAX_VALUE, -1, 1)
    // =========================================================================

    /**
     * Verifies that extreme integer values also satisfy the clamping formula.
     *
     * <p><strong>Validates: Requirements 5.3</strong>
     */
    @Property(tries = 1)
    @Label("Property 7-D: Integer.MIN_VALUE and Integer.MAX_VALUE are clamped correctly")
    void property7d_extremeValues() throws Exception {
        assertClampedCount(Integer.MIN_VALUE, 1,                    "Integer.MIN_VALUE should clamp to 1");
        assertClampedCount(Integer.MAX_VALUE, SUGGESTIONS_MAX_COUNT, "Integer.MAX_VALUE should clamp to 20");
        assertClampedCount(-1, 1,                                    "n=-1 should clamp to 1");
        assertClampedCount(1,  1,                                    "n=1 should remain 1");
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Issues a single {@code GET /api/ha-search/suggestions} request with the given
     * {@code n} as the {@code count} param, asserts HTTP 200, captures the count
     * argument forwarded to {@code listSuggestions}, and checks it equals
     * {@code expectedClampedCount}.
     *
     * <p>A fresh spy is rebuilt before each call (via {@link BeforeTry}) — this
     * helper is only safe to call once per property try. For multi-call sub-tests
     * (Property 7-C, 7-D) the spy is rebuilt by jqwik between tries via
     * {@link BeforeTry}.  Since 7-C and 7-D run as {@code tries=1} we call
     * {@link #setUp()} manually between assertions.
     *
     * @param n                   the raw integer to send as the {@code count} param
     * @param expectedClampedCount the expected effective count (post-clamping)
     * @param description         a human-readable label for assertion messages
     */
    private void assertClampedCount(int n, int expectedClampedCount, String description)
            throws Exception {
        // Rebuild the spy between assertions since ArgumentCaptor state is per-try.
        setUp();

        ArgumentCaptor<Integer> countCaptor = ArgumentCaptor.forClass(Integer.class);

        MvcResult result = mockMvc.perform(
                get(ENDPOINT)
                    .param("indexPattern", INDEX_PATTERN)
                    .param("count", String.valueOf(n))
                    .accept(MediaType.APPLICATION_JSON))
            .andReturn();

        assertThat(result.getResponse().getStatus())
            .as("[%s] HTTP status must be 200", description)
            .isEqualTo(200);

        verify(suggestionServiceSpy, times(1))
            .listSuggestions(eq(INDEX_PATTERN), countCaptor.capture());

        assertThat(countCaptor.getValue())
            .as("[%s] effective count passed to listSuggestions", description)
            .isEqualTo(expectedClampedCount);

        // Also verify response array length ≤ effective count.
        String body = result.getResponse().getContentAsString();
        SuggestedSearchDTO[] items = objectMapper.readValue(body, SuggestedSearchDTO[].class);
        assertThat(items.length)
            .as("[%s] response array length %d must be ≤ effective count %d",
                description, items.length, expectedClampedCount)
            .isLessThanOrEqualTo(expectedClampedCount);
    }
}
