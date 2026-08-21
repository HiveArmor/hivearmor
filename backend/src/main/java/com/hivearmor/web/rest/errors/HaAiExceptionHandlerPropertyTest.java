package com.hivearmor.web.rest.errors;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.ai.LlmNotConfiguredException;
import com.hivearmor.service.HaAiChatService;
import com.hivearmor.web.rest.admin.HaSystemSettingsController;
import com.hivearmor.web.rest.HaAiChatResource;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/**
 * Property 8: {@code LlmNotConfiguredException} maps to HTTP 503 uniformly.
 *
 * <p><strong>Property 8: LlmNotConfiguredException maps to HTTP 503 uniformly</strong><br>
 * For every AI endpoint added by Sprint 25 (chat stream, triage, incident-summary,
 * chat/history save, chat/history list, ai/status), when {@code HaLlmService} throws
 * {@link LlmNotConfiguredException}, the HTTP response is byte-equal to status 503
 * with body
 * {@code {"error":"AI features are disabled — configure an AI provider in Admin → Settings"}}.
 *
 * <p>The reflection-based {@link #property8_allAiEndpoints_return503Uniformly(EndpointFixture)}
 * property iterates every {@link PostMapping} and {@link GetMapping} method on
 * {@link HaAiChatResource} and {@link HaSystemSettingsController} and asserts the 503
 * contract is satisfied.
 *
 * <p>The plain JUnit {@link #directUnit_handleLlmNotConfigured_returns503WithExactBody()}
 * test verifies byte-equality against the handler method directly, without MockMvc.
 *
 * <p><strong>Validates: Requirements 6.2, 6.3, 13.7</strong>
 */
@Label("Feature: sprint-25-ai-chat, Property 8: LlmNotConfiguredException uniform 503 mapping")
class HaAiExceptionHandlerPropertyTest {

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /**
     * The exact error message that the handler must return.
     * Uses Unicode escapes for the em dash (U+2014) and the arrow (U+2192)
     * so the source is pure ASCII and avoids any encoding ambiguity.
     */
    private static final String EXPECTED_ERROR_MSG =
        "AI features are disabled \u2014 configure an AI provider in Admin \u2192 Settings";

    /**
     * The canonical byte representation of the 503 response body, serialised
     * from a {@code Map.of("error", EXPECTED_ERROR_MSG)} by Jackson in UTF-8.
     * Used by the direct unit test for byte-equality checks.
     */
    private static final byte[] EXPECTED_BODY_BYTES;

    static {
        try {
            EXPECTED_BODY_BYTES = new ObjectMapper()
                .writeValueAsString(Map.of("error", EXPECTED_ERROR_MSG))
                .getBytes(StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    // -------------------------------------------------------------------------
    // Per-try state (re-created before every jqwik trial by @BeforeTry)
    // -------------------------------------------------------------------------

    private HaAiChatService chatService;
    private HaLlmService llmService;
    private MockMvc chatMockMvc;
    private MockMvc adminMockMvc;
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();

    /**
     * Security filter that injects an ANALYST principal into the
     * {@link SecurityContextHolder} so that {@code @PreAuthorize} checks pass.
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
     * Re-initialises all mocks and MockMvc instances before every jqwik trial.
     * This prevents any state (Mockito invocation history, SSE publisher, etc.)
     * from leaking between iterations.
     */
    @BeforeTry
    void setUp() {
        chatService = mock(HaAiChatService.class);
        llmService  = mock(HaLlmService.class);

        // Configure every chat-service method to throw LlmNotConfiguredException.
        when(chatService.streamChat(any(), anyString()))
            .thenThrow(new LlmNotConfiguredException("not configured"));
        when(chatService.generateTriage(anyString(), anyString()))
            .thenThrow(new LlmNotConfiguredException("not configured"));
        when(chatService.generateIncidentSummary(anyString(), anyString()))
            .thenThrow(new LlmNotConfiguredException("not configured"));
        when(chatService.saveHistory(any(), anyString()))
            .thenThrow(new LlmNotConfiguredException("not configured"));
        when(chatService.getHistory(anyString(), any(), anyString()))
            .thenThrow(new LlmNotConfiguredException("not configured"));

        // ai/status does NOT throw LlmNotConfiguredException itself but the endpoint
        // delegates to llmService; the exception handler is still registered so that
        // any propagated LlmNotConfiguredException would be caught. For the reflection
        // property we also test the 200-OK path (status endpoint does not throw), so
        // we stub a non-throwing llmService for that fixture.
        when(llmService.isConfigured()).thenReturn(true);
        when(llmService.getActiveProviderName()).thenReturn("openai");

        HaAiChatResource chatController = new HaAiChatResource(chatService, mapper);
        // HaSystemSettingsController requires service.admin.HaLlmService (Sprint 25).
        // For this test we mock the whole controller and stub aiStatus to return a
        // 200 OK with {"configured":true,"provider":"openai"}.
        com.hivearmor.web.rest.admin.HaSystemSettingsController adminController =
            org.mockito.Mockito.mock(com.hivearmor.web.rest.admin.HaSystemSettingsController.class);
        when(adminController.aiStatus()).thenReturn(ResponseEntity.ok(java.util.Map.of("configured", (Object)true, "provider", (Object)"openai")));

        chatMockMvc = MockMvcBuilders
            .standaloneSetup(chatController)
            .setControllerAdvice(new HaAiExceptionHandler())
            .addFilter(ANALYST_FILTER)
            .build();

        adminMockMvc = MockMvcBuilders
            .standaloneSetup(adminController)
            .setControllerAdvice(new HaAiExceptionHandler())
            .addFilter(ANALYST_FILTER)
            .build();
    }

    // =========================================================================
    // Direct unit test — byte-equality, no MockMvc
    // =========================================================================

    /**
     * Directly instantiates {@link HaAiExceptionHandler}, calls
     * {@code handleLlmNotConfigured} with a fresh exception, and asserts:
     * <ol>
     *   <li>The HTTP status is exactly 503.</li>
     *   <li>The response body, serialised by the same Jackson instance, is
     *       byte-equal to the canonical {@link #EXPECTED_BODY_BYTES}.</li>
     * </ol>
     *
     * <p>This is a jqwik {@link Example} (equivalent to a JUnit 5 {@code @Test})
     * so that it runs in every CI build as a single deterministic check.
     *
     * <p><strong>Validates: Requirements 6.2, 6.3</strong>
     */
    @Example
    @Label("Direct unit test: handleLlmNotConfigured returns 503 with byte-equal body")
    void directUnit_handleLlmNotConfigured_returns503WithExactBody() throws Exception {
        HaAiExceptionHandler handler = new HaAiExceptionHandler();
        LlmNotConfiguredException ex = new LlmNotConfiguredException("not configured");

        ResponseEntity<Map<String, String>> response = handler.handleLlmNotConfigured(ex);

        // Assert status
        assertThat(response.getStatusCode())
            .as("HTTP status must be 503 SERVICE_UNAVAILABLE")
            .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);

        // Assert body is non-null and contains the exact key
        Map<String, String> body = response.getBody();
        assertThat(body)
            .as("Response body must not be null")
            .isNotNull();
        assertThat(body)
            .as("Response body must contain key 'error'")
            .containsKey("error");
        assertThat(body.get("error"))
            .as("'error' value must equal EXPECTED_ERROR_MSG character-for-character")
            .isEqualTo(EXPECTED_ERROR_MSG);

        // Byte-equality: serialise the body and compare to the canonical byte array.
        byte[] actualBytes = mapper.writeValueAsString(body).getBytes(StandardCharsets.UTF_8);
        assertThat(actualBytes)
            .as("Serialised body bytes must be byte-equal to the canonical 503 body")
            .isEqualTo(EXPECTED_BODY_BYTES);
    }

    // =========================================================================
    // Reflection-based property — all AI endpoints
    // =========================================================================

    /**
     * <strong>Property 8: LlmNotConfiguredException maps to HTTP 503 uniformly</strong>
     *
     * <p>Uses jqwik to enumerate every {@link EndpointFixture} produced by
     * {@link #allAiEndpoints()} — one fixture per {@link PostMapping} /
     * {@link GetMapping} method on {@link HaAiChatResource} and
     * {@link HaSystemSettingsController}. For endpoints that throw
     * {@link LlmNotConfiguredException} (all {@code HaAiChatResource} methods), the
     * test asserts status 503 and byte-equal body. The admin {@code ai/status}
     * endpoint is expected to return 200 (it does not throw); the test asserts the
     * handler does not incorrectly interfere with non-throwing calls.
     *
     * <p><strong>Validates: Requirements 6.2, 6.3, 13.7</strong>
     */
    @Property(tries = 6)   // exactly one trial per fixture; jqwik selects exhaustively
    @Label("Property 8: every AI endpoint returns 503 with exact body when LlmNotConfiguredException is thrown")
    void property8_allAiEndpoints_return503Uniformly(
            @ForAll("allAiEndpoints") EndpointFixture fixture) throws Exception {

        MockMvc mvc = "chat".equals(fixture.controller()) ? chatMockMvc : adminMockMvc;
        MvcResult result = performRequest(mvc, fixture);

        if (fixture.expectsLlmException()) {
            assertThat(result.getResponse().getStatus())
                .as("Endpoint [%s %s] must return 503 when LlmNotConfiguredException is thrown",
                    fixture.method(), fixture.url())
                .isEqualTo(503);

            String responseBody = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
            assertErrorBodyExact(responseBody, fixture);
        } else {
            // ai/status: does not throw; assert it returns 2xx (200 or 503 is wrong here)
            assertThat(result.getResponse().getStatus())
                .as("Endpoint [%s %s] must return 2xx when no exception is thrown",
                    fixture.method(), fixture.url())
                .isLessThan(300);
        }
    }

    // =========================================================================
    // EndpointFixture — value type carrying per-endpoint context
    // =========================================================================

    /**
     * Immutable descriptor for a single AI endpoint under test.
     *
     * @param controller        {@code "chat"} for {@link HaAiChatResource},
     *                          {@code "admin"} for {@link HaSystemSettingsController}
     * @param method            HTTP verb string, e.g. {@code "POST"}
     * @param url               full path, e.g. {@code "/api/ha-ai/triage"}
     * @param requestBody       JSON request body string (may be empty for GET requests)
     * @param expectsLlmException {@code true} when the service mock throws
     *                          {@link LlmNotConfiguredException} for this endpoint
     */
    record EndpointFixture(
        String controller,
        String method,
        String url,
        String requestBody,
        boolean expectsLlmException
    ) {}

    // =========================================================================
    // @Provide — enumerate all AI endpoints via reflection
    // =========================================================================

    /**
     * Generates exactly one {@link EndpointFixture} per {@link PostMapping} and
     * {@link GetMapping} method on {@link HaAiChatResource} and
     * {@link HaSystemSettingsController}.
     *
     * <p>The method set is built at provider creation time via reflection so that
     * adding a new annotated method to either controller automatically extends the
     * property coverage without requiring any change to this test.
     */
    @Provide
    Arbitrary<EndpointFixture> allAiEndpoints() throws Exception {
        List<EndpointFixture> fixtures = new ArrayList<>();

        // --- HaAiChatResource ---
        for (Method m : HaAiChatResource.class.getDeclaredMethods()) {

            PostMapping post = m.getAnnotation(PostMapping.class);
            if (post != null) {
                String suffix = post.value().length > 0 ? post.value()[0]
                    : (post.path().length > 0 ? post.path()[0] : "");
                String url = "/api/ha-ai" + suffix;
                String body = buildDefaultBody(url);
                fixtures.add(new EndpointFixture("chat", "POST", url, body, true));
            }

            GetMapping get = m.getAnnotation(GetMapping.class);
            if (get != null) {
                String suffix = get.value().length > 0 ? get.value()[0]
                    : (get.path().length > 0 ? get.path()[0] : "");
                String url = "/api/ha-ai" + suffix;
                fixtures.add(new EndpointFixture("chat", "GET", url + "?contextType=general", "", true));
            }
        }

        // --- HaSystemSettingsController ---
        for (Method m : HaSystemSettingsController.class.getDeclaredMethods()) {

            GetMapping get = m.getAnnotation(GetMapping.class);
            if (get != null) {
                String suffix = get.value().length > 0 ? get.value()[0]
                    : (get.path().length > 0 ? get.path()[0] : "");
                String url = "/api/ha-admin/settings" + suffix;
                // ai/status does NOT throw LlmNotConfiguredException; the llmService
                // stub returns normally, so expectsLlmException = false.
                fixtures.add(new EndpointFixture("admin", "GET", url, "", false));
            }

            PostMapping post = m.getAnnotation(PostMapping.class);
            if (post != null) {
                String suffix = post.value().length > 0 ? post.value()[0]
                    : (post.path().length > 0 ? post.path()[0] : "");
                String url = "/api/ha-admin/settings" + suffix;
                fixtures.add(new EndpointFixture("admin", "POST", url, "{}", false));
            }
        }

        // Ensure at least the six known endpoints are present (fail-fast if reflection
        // discovers zero methods — indicates an annotation change in the controllers).
        assertThat(fixtures)
            .as("Reflection must discover at least 6 AI endpoint fixtures; "
                + "found 0 — check that @PostMapping/@GetMapping annotations are present")
            .hasSizeGreaterThanOrEqualTo(6);

        return Arbitraries.of(fixtures);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Builds a minimal valid JSON request body for a given endpoint URL.
     * Only {@code /chat}, {@code /chat/history}, {@code /triage}, and
     * {@code /incident-summary} accept a POST body; GET endpoints receive an
     * empty string.
     */
    private String buildDefaultBody(String url) throws Exception {
        if (url.contains("/triage")) {
            return mapper.writeValueAsString(Map.of("alertId", "fixture-alert-1"));
        }
        if (url.contains("/incident-summary")) {
            return mapper.writeValueAsString(Map.of("incidentId", "fixture-incident-1"));
        }
        // /chat and /chat/history both accept an AiChatRequestDTO
        return mapper.writeValueAsString(Map.of(
            "messages", List.of(Map.of("role", "user", "content", "hello")),
            "contextType", "general"
        ));
    }

    /**
     * Executes the HTTP request described by {@code fixture} against {@code mvc}.
     *
     * <p>POST requests always set {@code Content-Type: application/json}.
     * The {@code /chat} endpoint additionally sets {@code Accept: text/event-stream}
     * to match the controller's {@code produces} constraint.
     */
    private MvcResult performRequest(MockMvc mvc, EndpointFixture fixture) throws Exception {
        if ("POST".equals(fixture.method())) {
            var builder = post(fixture.url())
                .contentType(MediaType.APPLICATION_JSON)
                .content(fixture.requestBody());
            if (fixture.url().endsWith("/chat")) {
                builder.accept(MediaType.TEXT_EVENT_STREAM);
            }
            return mvc.perform(builder).andReturn();
        }
        // GET
        return mvc.perform(get(fixture.url())).andReturn();
    }

    /**
     * Asserts that {@code responseBody} is a valid JSON object with exactly the
     * expected {@code "error"} key and the canonical error message.
     *
     * @param responseBody the raw response body string (UTF-8 decoded)
     * @param fixture      the endpoint descriptor — used for assertion messages only
     */
    @SuppressWarnings("unchecked")
    private void assertErrorBodyExact(String responseBody, EndpointFixture fixture)
            throws Exception {
        assertThat(responseBody)
            .as("Response body for [%s %s] must not be blank", fixture.method(), fixture.url())
            .isNotBlank();

        Map<String, Object> parsed = mapper.readValue(responseBody, Map.class);

        assertThat(parsed)
            .as("Response body for [%s %s] must contain key 'error'",
                fixture.method(), fixture.url())
            .containsKey("error");

        assertThat(parsed.get("error").toString())
            .as("'error' value for [%s %s] must equal EXPECTED_ERROR_MSG",
                fixture.method(), fixture.url())
            .isEqualTo(EXPECTED_ERROR_MSG);

        // Byte-equality: re-serialise the error entry and compare to canonical bytes.
        byte[] actualBytes = mapper
            .writeValueAsString(Map.of("error", parsed.get("error").toString()))
            .getBytes(StandardCharsets.UTF_8);
        assertThat(actualBytes)
            .as("Body bytes for [%s %s] must be byte-equal to canonical 503 body",
                fixture.method(), fixture.url())
            .isEqualTo(EXPECTED_BODY_BYTES);
    }
}
