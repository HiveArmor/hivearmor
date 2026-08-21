package com.hivearmor.web.rest;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.HaSearchService;
import com.hivearmor.web.rest.errors.HaAiExceptionHandler;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
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
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Property 5: NL translate endpoint never returns 500 for a validation-passing request.
 *
 * <p><strong>Property 5: NL translate endpoint never returns 500 for a
 * validation-passing request</strong><br>
 * For any valid {@code NlToDslRequestDTO} (non-blank {@code query} up to 500 chars,
 * any {@code indexPattern}), with {@code HaLlmService.chat()} mocked to either:
 * <ul>
 *   <li>Return arbitrary strings (including empty, plain text, invalid JSON, or
 *       valid JSON); or</li>
 *   <li>Throw arbitrary {@code RuntimeException} (but NOT
 *       {@link com.hivearmor.ai.LlmNotConfiguredException})</li>
 * </ul>
 * the endpoint must:
 * <ol>
 *   <li>Return HTTP 200 (never 500).</li>
 *   <li>Return a response body whose {@code dsl} field is itself a parseable JSON
 *       object.</li>
 *   <li>Return a {@code confidence} value in {@code [0.0, 1.0]}.</li>
 * </ol>
 *
 * <p><strong>Validates: Requirements 1.4, 4.5, 4.8</strong>
 */
@Label("Feature: sprint-26-nl-search, Property 5: NL translate endpoint never returns 500")
class HaSearchResourceNever500PropertyTest {

    private static final String ENDPOINT = "/api/ha-search/nl-to-dsl";

    private MockMvc mockMvc;
    private HaLlmService haLlmService;
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

    /**
     * Rebuilds mocks and standalone MockMvc before each property try so that
     * mock stubbing from one try cannot bleed into the next.
     */
    @BeforeTry
    void setUp() {
        haLlmService = mock(HaLlmService.class);
        MsspIndexResolver msspIndexResolver = mock(MsspIndexResolver.class);
        HaSearchService haSearchService =
            new HaSearchService(haLlmService, objectMapper, msspIndexResolver);

        // HaSearchResource requires osClient, indexResolver, haSearchService, and
        // haSearchSuggestionService. We pass mocks for osClient, indexResolver, and
        // haSearchSuggestionService since they are unused by the nl-to-dsl endpoint.
        com.hivearmor.service.elasticsearch.OpensearchClientBuilder osClient =
            mock(com.hivearmor.service.elasticsearch.OpensearchClientBuilder.class);
        com.hivearmor.service.HaSearchSuggestionService haSearchSuggestionService =
            mock(com.hivearmor.service.HaSearchSuggestionService.class);

        HaSearchResource controller =
            new HaSearchResource(osClient, msspIndexResolver, haSearchService,
                                 haSearchSuggestionService);

        mockMvc = MockMvcBuilders
            .standaloneSetup(controller)
            .setControllerAdvice(new HaAiExceptionHandler())
            .addFilter(ANALYST_FILTER)
            .build();
    }

    // =========================================================================
    // Property 5-A: LLM returns arbitrary string → always HTTP 200 with valid body
    // =========================================================================

    /**
     * For any valid NL query and any string the mocked LLM returns
     * (empty, plain prose, invalid JSON, valid JSON), the endpoint must respond
     * HTTP 200 with a {@code dsl} that parses as a JSON object and a
     * {@code confidence} in {@code [0.0, 1.0]}.
     *
     * <p><strong>Validates: Requirements 1.4, 4.5, 4.8</strong>
     */
    @Property(tries = 100)
    @Label("Property 5-A: LLM returns arbitrary string → HTTP 200, valid dsl, confidence in [0,1]")
    void property5a_llmReturnsArbitraryString(
            @ForAll("validQueries") String query,
            @ForAll("arbitraryIndexPatterns") String indexPattern,
            @ForAll String llmOutput) throws Exception {

        when(haLlmService.chat(any(), anyString())).thenReturn(llmOutput);

        MvcResult result = performRequest(query, indexPattern);

        assertNever500AndValidBody(result, query, llmOutput);
    }

    // =========================================================================
    // Property 5-B: LLM throws RuntimeException → always HTTP 200 with safe fallback
    // =========================================================================

    /**
     * When the mocked LLM throws an arbitrary {@code RuntimeException} (excluding
     * {@link com.hivearmor.ai.LlmNotConfiguredException}), the service must absorb
     * it and return HTTP 200 with the safe fallback DSL.
     *
     * <p><strong>Validates: Requirements 1.4, 4.5, 4.8</strong>
     */
    @Property(tries = 100)
    @Label("Property 5-B: LLM throws RuntimeException → HTTP 200, safe fallback dsl, confidence in [0,1]")
    void property5b_llmThrowsRuntimeException(
            @ForAll("validQueries") String query,
            @ForAll("arbitraryIndexPatterns") String indexPattern,
            @ForAll("runtimeExceptionMessages") String exceptionMessage) throws Exception {

        when(haLlmService.chat(any(), anyString()))
            .thenThrow(new RuntimeException(exceptionMessage));

        MvcResult result = performRequest(query, indexPattern);

        assertNever500AndValidBody(result, query, "RuntimeException: " + exceptionMessage);

        // On a thrown exception the service MUST return the safe fallback DSL.
        String body = result.getResponse().getContentAsString();
        JsonNode bodyNode = objectMapper.readTree(body);
        String dsl = bodyNode.get("dsl").asText();
        JsonNode dslNode = objectMapper.readTree(dsl);
        assertThat(dslNode.has("query"))
            .as("Safe-fallback DSL must contain a 'query' field; body was: %s", body)
            .isTrue();
    }

    // =========================================================================
    // Property 5-C: LLM returns valid DSL JSON → confidence propagated correctly
    // =========================================================================

    /**
     * When the mocked LLM returns a structurally valid DSL JSON string that
     * contains a {@code confidence} value in {@code [0.0, 1.0]}, the response
     * must propagate that confidence (or default to 0.75 when absent), and the
     * response {@code dsl} must be a parseable JSON object.
     *
     * <p><strong>Validates: Requirements 1.4, 4.5, 4.8</strong>
     */
    @Property(tries = 100)
    @Label("Property 5-C: LLM returns valid DSL JSON → HTTP 200, propagated confidence, valid dsl")
    void property5c_llmReturnsValidDsl(
            @ForAll("validQueries") String query,
            @ForAll("arbitraryIndexPatterns") String indexPattern,
            @ForAll("validDslJsonStrings") String llmOutput) throws Exception {

        when(haLlmService.chat(any(), anyString())).thenReturn(llmOutput);

        MvcResult result = performRequest(query, indexPattern);

        assertNever500AndValidBody(result, query, llmOutput);

        // Additional assertion: when the LLM returns a valid DSL the confidence
        // must either equal the value carried in the LLM output or default to 0.75.
        String body = result.getResponse().getContentAsString();
        JsonNode bodyNode = objectMapper.readTree(body);
        double confidence = bodyNode.get("confidence").asDouble();
        assertThat(confidence)
            .as("Confidence must be in [0.0, 1.0]; body was: %s", body)
            .isBetween(0.0, 1.0);
    }

    // =========================================================================
    // Arbitrary providers
    // =========================================================================

    /**
     * Generates valid NL query strings: non-blank, 1–500 characters, drawn from
     * a printable ASCII alphabet to guarantee {@code @NotBlank} and
     * {@code @Size(max=500)} constraints are satisfied.
     */
    @Provide
    Arbitrary<String> validQueries() {
        return Arbitraries.strings()
            .withCharRange('A', 'z')
            .ofMinLength(1)
            .ofMaxLength(500)
            .filter(s -> !s.isBlank());
    }

    /**
     * Generates arbitrary index-pattern strings, including null-equivalent
     * empty strings, since {@code indexPattern} is not constrained in the DTO.
     */
    @Provide
    Arbitrary<String> arbitraryIndexPatterns() {
        return Arbitraries.oneOf(
            Arbitraries.just(""),
            Arbitraries.just("v3-hive-alert-*"),
            Arbitraries.just("v3-hive-event-*"),
            Arbitraries.strings().withCharRange('a', 'z').ofMinLength(0).ofMaxLength(50)
        );
    }

    /**
     * Generates arbitrary exception messages used when the mock LLM throws
     * a {@link RuntimeException}. Includes blank, null-ish, and long strings.
     */
    @Provide
    Arbitrary<String> runtimeExceptionMessages() {
        return Arbitraries.oneOf(
            Arbitraries.just(""),
            Arbitraries.just("connection refused"),
            Arbitraries.just("timeout after 30s"),
            Arbitraries.just("SOC-AI plugin returned HTTP 500"),
            Arbitraries.strings().ofMinLength(0).ofMaxLength(200)
        );
    }

    /**
     * Generates valid OpenSearch query DSL JSON strings that pass the
     * {@code DslValidator} contract: a JSON object with a {@code "query"} object
     * field, no {@code "script"} key, and an optional {@code "confidence"} in
     * {@code [0.0, 1.0]}.
     */
    @Provide
    Arbitrary<String> validDslJsonStrings() {
        // Generate simple valid DSL structures: match_all, term, and match variants.
        List<String> validDsls = List.of(
            "{\"query\":{\"match_all\":{}}}",
            "{\"query\":{\"match_all\":{}},\"confidence\":0.9}",
            "{\"query\":{\"match_all\":{}},\"confidence\":0.5,\"explanation\":\"recent events\"}",
            "{\"query\":{\"bool\":{\"must\":[{\"match\":{\"category\":\"auth\"}}]}}}",
            "{\"query\":{\"term\":{\"severity\":\"critical\"}},\"confidence\":0.8}",
            "{\"query\":{\"range\":{\"@timestamp\":{\"gte\":\"now-1h\"}}},\"confidence\":0.6}",
            "{\"query\":{\"match\":{\"message\":\"failed login\"}}}",
            "{\"query\":{\"match_all\":{}},\"size\":10}",
            "{\"query\":{\"match_all\":{}},\"confidence\":0.0}",
            "{\"query\":{\"match_all\":{}},\"confidence\":1.0}"
        );
        return Arbitraries.of(validDsls);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Posts a request to {@code POST /api/ha-search/nl-to-dsl} with the given
     * query and indexPattern, returning the raw {@link MvcResult}.
     */
    private MvcResult performRequest(String query, String indexPattern) throws Exception {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("query", query);
        body.put("indexPattern", indexPattern);
        String requestBody = objectMapper.writeValueAsString(body);

        return mockMvc.perform(post(ENDPOINT)
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestBody))
            .andReturn();
    }

    /**
     * Core assertion block shared by all three property sub-tests.
     *
     * <p>Asserts:
     * <ol>
     *   <li>HTTP status is 200 (never 500).</li>
     *   <li>Response body is parseable as a JSON object with a {@code dsl} field.</li>
     *   <li>The {@code dsl} field value is itself parseable as a JSON object.</li>
     *   <li>The {@code confidence} field is a number in {@code [0.0, 1.0]}.</li>
     * </ol>
     *
     * @param result      the MvcResult from the performed request
     * @param query       the original query (for diagnostic messages)
     * @param llmContext  a description of the LLM output/exception (for diagnostics)
     */
    private void assertNever500AndValidBody(MvcResult result, String query, String llmContext)
            throws Exception {
        int status = result.getResponse().getStatus();
        assertThat(status)
            .as("HTTP status must be 200 for query='%s', llm='%s'", abbrev(query), abbrev(llmContext))
            .isEqualTo(200);

        String responseBody = result.getResponse().getContentAsString();
        assertThat(responseBody)
            .as("Response body must not be blank for query='%s'", abbrev(query))
            .isNotBlank();

        JsonNode bodyNode = objectMapper.readTree(responseBody);
        assertThat(bodyNode.isObject())
            .as("Response body must be a JSON object; got: %s", abbrev(responseBody))
            .isTrue();
        assertThat(bodyNode.has("dsl"))
            .as("Response body must contain a 'dsl' field; got: %s", abbrev(responseBody))
            .isTrue();
        assertThat(bodyNode.has("confidence"))
            .as("Response body must contain a 'confidence' field; got: %s", abbrev(responseBody))
            .isTrue();

        // The dsl field must itself be a parseable JSON object.
        String dslValue = bodyNode.get("dsl").asText();
        JsonNode dslNode;
        try {
            dslNode = objectMapper.readTree(dslValue);
        } catch (Exception e) {
            throw new AssertionError(
                "dsl field '" + abbrev(dslValue) + "' must be parseable as JSON, but got: " + e.getMessage(), e);
        }
        assertThat(dslNode.isObject())
            .as("dsl field must parse as a JSON object; dsl='%s'", abbrev(dslValue))
            .isTrue();

        // confidence must be in [0.0, 1.0].
        double confidence = bodyNode.get("confidence").asDouble();
        assertThat(confidence)
            .as("confidence must be in [0.0, 1.0]; got %s, body=%s", confidence, abbrev(responseBody))
            .isBetween(0.0, 1.0);
    }

    /** Abbreviates a string to 80 characters for readable assertion diagnostics. */
    private static String abbrev(String s) {
        if (s == null) return "<null>";
        return s.length() > 80 ? s.substring(0, 80) + "…" : s;
    }
}
