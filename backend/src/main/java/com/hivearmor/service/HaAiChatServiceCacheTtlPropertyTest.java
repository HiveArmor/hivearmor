package com.hivearmor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.domain.HaAiChatHistory;
import com.hivearmor.repository.HaAiChatHistoryRepository;
import com.hivearmor.web.rest.dto.AiIncidentSummaryDTO;
import net.jqwik.api.*;
import net.jqwik.api.constraints.StringLength;
import net.jqwik.api.lifecycle.BeforeTry;
import org.assertj.core.api.SoftAssertions;

import java.time.Instant;
import java.util.List;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Property 2: Triage and incident-summary cache TTL invariant.
 *
 * <p><strong>Property 2: Triage and incident-summary cache TTL invariant</strong><br>
 * For any {@code (userLogin, contextId)} and
 * {@code contextType ∈ {triage, incident_summary}}, if a matching history row has
 * {@code createdAt ≥ now − 3600s} then the service returns the deserialized cached
 * content with zero {@link HaLlmService#chat} calls and zero {@code save} calls;
 * otherwise exactly one of each occurs.
 *
 * <h2>Approach</h2>
 * <p>Constructs {@link HaAiChatService} with Mockito mocks for every dependency.
 * Two sub-properties are tested per property trial:
 * <ol>
 *   <li><strong>Cache-hit</strong>: the repository returns a single row whose
 *       {@code createdAt} is {@code now − 100s} (well within the 3600-second TTL).
 *       Asserts {@code llmService.chat} is never called and {@code repo.save} is
 *       never called.</li>
 *   <li><strong>Cache-miss</strong>: the repository returns an empty list.
 *       Asserts {@code llmService.chat} is called exactly once and {@code repo.save}
 *       is called exactly once.</li>
 * </ol>
 *
 * <p>Tests live in {@code src/main/java/} per the project convention (no
 * {@code src/test/} directory).
 *
 * <p><strong>Validates: Requirements 13.4, 13.5, 17.4, 17.5</strong>
 */
@Label("Feature: sprint-25-ai-chat, Property 2: Triage and incident-summary cache TTL invariant")
class HaAiChatServiceCacheTtlPropertyTest {

    // =========================================================================
    // Fields — recreated before every jqwik try via @BeforeTry
    // =========================================================================

    private HaAiChatService               service;
    private HaLlmService                  llmService;
    private HaAiChatHistoryRepository     historyRepo;
    private HaAlertContextService         alertContextService;
    private HaIncidentContextService      incidentContextService;
    private final ObjectMapper            mapper = new ObjectMapper().findAndRegisterModules();

    /** Stub LLM response used for cache-miss triage calls. */
    private static final String STUB_TRIAGE_SUMMARY  = "Stub triage summary for test.";

    /** Stub LLM response for cache-miss incident-summary calls (valid DTO JSON). */
    private static final String STUB_INCIDENT_JSON =
        "{\"narrative\":\"Stub narrative\"," +
        "\"threatActorType\":\"Unknown\"," +
        "\"recommendedSteps\":[\"Step 1\"]," +
        "\"riskLevel\":\"medium\"}";

    /**
     * Pre-serialized {@code messagesJson} for a cache-hit triage row:
     * a one-element list with an assistant message containing the triage summary.
     */
    private static final String TRIAGE_MESSAGES_JSON =
        "[{\"role\":\"assistant\",\"content\":\"" + STUB_TRIAGE_SUMMARY + "\"}]";

    /**
     * Pre-serialized {@code messagesJson} for a cache-hit incident-summary row:
     * a one-element list with an assistant message whose content is the DTO JSON.
     */
    private static final String INCIDENT_MESSAGES_JSON =
        "[{\"role\":\"assistant\",\"content\":" + jsonStringLiteral(STUB_INCIDENT_JSON) + "}]";

    /**
     * Re-creates all mocks and the service under test before every jqwik trial so
     * each iteration starts with a clean Mockito state.
     */
    @BeforeTry
    void setUp() {
        llmService             = mock(HaLlmService.class);
        historyRepo            = mock(HaAiChatHistoryRepository.class);
        alertContextService    = mock(HaAlertContextService.class);
        incidentContextService = mock(HaIncidentContextService.class);

        service = new HaAiChatService(
            llmService,
            historyRepo,
            alertContextService,
            incidentContextService,
            mapper
        );

        // Context services return non-null JSON so cache-miss calls don't throw 404.
        when(alertContextService.loadAlertAsJson(anyString()))
            .thenReturn("{\"id\":\"stub\",\"name\":\"Stub Alert\"}");
        when(incidentContextService.loadIncidentAsJson(anyString()))
            .thenReturn("{\"id\":\"stub\",\"incidentName\":\"Stub Incident\"}");

        // LLM returns a stub response for both context types on cache miss.
        when(llmService.chat(anyList(), anyString()))
            .thenReturn(STUB_TRIAGE_SUMMARY);

        // Repository save returns a new HaAiChatHistory entity (id assigned).
        when(historyRepo.save(any(HaAiChatHistory.class)))
            .thenAnswer(invocation -> {
                HaAiChatHistory entity = invocation.getArgument(0);
                entity.setId(1L);
                return entity;
            });
    }

    // =========================================================================
    // Property 2a — triage cache-hit: zero LLM calls, zero save calls
    // =========================================================================

    /**
     * For any {@code (userLogin, contextId)}, when the repository returns a row
     * whose {@code createdAt} is 100 seconds ago (within the 3600-second TTL),
     * {@link HaAiChatService#generateTriage} must:
     * <ol>
     *   <li>Return the cached summary string.</li>
     *   <li>Never call {@link HaLlmService#chat(List, String)}.</li>
     *   <li>Never call {@link HaAiChatHistoryRepository#save(Object)}.</li>
     * </ol>
     *
     * <p><strong>Validates: Requirements 13.4</strong>
     */
    @Property(tries = 100)
    @Label("Property 2a: triage cache-hit — zero LLM calls and zero save calls")
    void property2a_triageCacheHit_zeroLlmCallsAndZeroSaveCalls(
            @ForAll("validLogins")    String userLogin,
            @ForAll("validContextIds") String contextId) {

        // Arrange: repo returns one row within TTL.
        HaAiChatHistory cachedRow = buildCachedRow(
            userLogin, HaAiChatService.TRIAGE_CTX, contextId,
            TRIAGE_MESSAGES_JSON,
            Instant.now().minusSeconds(100L)   // 100 s ago — within 3600-s TTL
        );
        when(historyRepo.findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
                eq(userLogin), eq(HaAiChatService.TRIAGE_CTX), eq(contextId)))
            .thenReturn(List.of(cachedRow));

        // Act.
        String result = service.generateTriage(contextId, userLogin);

        SoftAssertions softly = new SoftAssertions();

        // Assertion 1: result is non-null.
        softly.assertThat(result)
            .as("generateTriage must return a non-null result on cache-hit " +
                "(userLogin=%s, contextId=%s)", userLogin, contextId)
            .isNotNull();

        // Assertion 2: HaLlmService.chat was never invoked.
        softly.assertThatCode(() ->
            verify(llmService, never()).chat(anyList(), anyString()))
            .as("HaLlmService.chat must NOT be called on triage cache-hit " +
                "(userLogin=%s, contextId=%s)", userLogin, contextId)
            .doesNotThrowAnyException();

        // Assertion 3: repo.save was never invoked.
        softly.assertThatCode(() ->
            verify(historyRepo, never()).save(any()))
            .as("HaAiChatHistoryRepository.save must NOT be called on triage cache-hit " +
                "(userLogin=%s, contextId=%s)", userLogin, contextId)
            .doesNotThrowAnyException();

        softly.assertAll();
    }

    // =========================================================================
    // Property 2b — triage cache-miss: exactly one LLM call, exactly one save
    // =========================================================================

    /**
     * For any {@code (userLogin, contextId)}, when the repository returns an empty
     * list (cache miss), {@link HaAiChatService#generateTriage} must:
     * <ol>
     *   <li>Call {@link HaLlmService#chat(List, String)} exactly once.</li>
     *   <li>Call {@link HaAiChatHistoryRepository#save(Object)} exactly once.</li>
     *   <li>Return a non-null, non-blank summary string.</li>
     * </ol>
     *
     * <p><strong>Validates: Requirements 13.5</strong>
     */
    @Property(tries = 100)
    @Label("Property 2b: triage cache-miss — exactly one LLM call and exactly one save call")
    void property2b_triageCacheMiss_exactlyOneLlmCallAndOneSaveCall(
            @ForAll("validLogins")     String userLogin,
            @ForAll("validContextIds") String contextId) {

        // Arrange: repo returns empty list (cache miss).
        when(historyRepo.findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
                eq(userLogin), eq(HaAiChatService.TRIAGE_CTX), eq(contextId)))
            .thenReturn(List.of());

        // Act.
        String result = service.generateTriage(contextId, userLogin);

        SoftAssertions softly = new SoftAssertions();

        // Assertion 1: HaLlmService.chat was called exactly once.
        softly.assertThatCode(() ->
            verify(llmService, times(1)).chat(anyList(), anyString()))
            .as("HaLlmService.chat must be called exactly once on triage cache-miss " +
                "(userLogin=%s, contextId=%s)", userLogin, contextId)
            .doesNotThrowAnyException();

        // Assertion 2: repo.save was called exactly once.
        softly.assertThatCode(() ->
            verify(historyRepo, times(1)).save(any(HaAiChatHistory.class)))
            .as("HaAiChatHistoryRepository.save must be called exactly once on triage cache-miss " +
                "(userLogin=%s, contextId=%s)", userLogin, contextId)
            .doesNotThrowAnyException();

        // Assertion 3: result is non-null and non-blank.
        softly.assertThat(result)
            .as("generateTriage must return a non-blank summary on cache-miss " +
                "(userLogin=%s, contextId=%s)", userLogin, contextId)
            .isNotBlank();

        softly.assertAll();
    }

    // =========================================================================
    // Property 2c — triage expired row: row outside TTL treated as cache-miss
    // =========================================================================

    /**
     * When the most-recent row has {@code createdAt} exactly 3601 seconds ago
     * (outside the TTL window), the service must fall through to the LLM and
     * persist a fresh row.
     *
     * <p><strong>Validates: Requirements 13.4</strong>
     */
    @Property(tries = 50)
    @Label("Property 2c: triage expired row (outside TTL) is treated as cache-miss")
    void property2c_triageExpiredRow_treatedAsCacheMiss(
            @ForAll("validLogins")     String userLogin,
            @ForAll("validContextIds") String contextId) {

        // Arrange: repo returns a row whose createdAt is outside the TTL window.
        HaAiChatHistory expiredRow = buildCachedRow(
            userLogin, HaAiChatService.TRIAGE_CTX, contextId,
            TRIAGE_MESSAGES_JSON,
            Instant.now().minusSeconds(HaAiChatService.CACHE_TTL_SECONDS + 1L)
        );
        when(historyRepo.findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
                eq(userLogin), eq(HaAiChatService.TRIAGE_CTX), eq(contextId)))
            .thenReturn(List.of(expiredRow));

        // Act — should NOT use the cached row.
        service.generateTriage(contextId, userLogin);

        SoftAssertions softly = new SoftAssertions();

        softly.assertThatCode(() ->
            verify(llmService, times(1)).chat(anyList(), anyString()))
            .as("Expired triage row must not be served from cache; " +
                "HaLlmService.chat must be called exactly once " +
                "(userLogin=%s, contextId=%s)", userLogin, contextId)
            .doesNotThrowAnyException();

        softly.assertThatCode(() ->
            verify(historyRepo, times(1)).save(any(HaAiChatHistory.class)))
            .as("Expired triage row must cause a fresh save " +
                "(userLogin=%s, contextId=%s)", userLogin, contextId)
            .doesNotThrowAnyException();

        softly.assertAll();
    }

    // =========================================================================
    // Property 2d — incident-summary cache-hit: zero LLM calls, zero save calls
    // =========================================================================

    /**
     * For any {@code (userLogin, contextId)}, when the repository returns a row
     * within the TTL for {@code incident_summary}, {@link HaAiChatService#generateIncidentSummary}
     * must never call the LLM and never save.
     *
     * <p><strong>Validates: Requirements 17.4</strong>
     */
    @Property(tries = 100)
    @Label("Property 2d: incident-summary cache-hit — zero LLM calls and zero save calls")
    void property2d_incidentSummaryCacheHit_zeroLlmCallsAndZeroSaveCalls(
            @ForAll("validLogins")     String userLogin,
            @ForAll("validContextIds") String contextId) {

        // Arrange: repo returns a valid cached incident-summary row within TTL.
        HaAiChatHistory cachedRow = buildCachedRow(
            userLogin, HaAiChatService.SUMMARY_CTX, contextId,
            INCIDENT_MESSAGES_JSON,
            Instant.now().minusSeconds(100L)   // 100 s ago — within 3600-s TTL
        );
        when(historyRepo.findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
                eq(userLogin), eq(HaAiChatService.SUMMARY_CTX), eq(contextId)))
            .thenReturn(List.of(cachedRow));

        // Act.
        AiIncidentSummaryDTO result = service.generateIncidentSummary(contextId, userLogin);

        SoftAssertions softly = new SoftAssertions();

        // Assertion 1: result is non-null.
        softly.assertThat(result)
            .as("generateIncidentSummary must return a non-null DTO on cache-hit " +
                "(userLogin=%s, contextId=%s)", userLogin, contextId)
            .isNotNull();

        // Assertion 2: HaLlmService.chat was never called.
        softly.assertThatCode(() ->
            verify(llmService, never()).chat(anyList(), anyString()))
            .as("HaLlmService.chat must NOT be called on incident-summary cache-hit " +
                "(userLogin=%s, contextId=%s)", userLogin, contextId)
            .doesNotThrowAnyException();

        // Assertion 3: repo.save was never called.
        softly.assertThatCode(() ->
            verify(historyRepo, never()).save(any()))
            .as("HaAiChatHistoryRepository.save must NOT be called on incident-summary cache-hit " +
                "(userLogin=%s, contextId=%s)", userLogin, contextId)
            .doesNotThrowAnyException();

        softly.assertAll();
    }

    // =========================================================================
    // Property 2e — incident-summary cache-miss: exactly one LLM call, one save
    // =========================================================================

    /**
     * For any {@code (userLogin, contextId)}, when the repository returns an empty
     * list for {@code incident_summary}, {@link HaAiChatService#generateIncidentSummary}
     * must call the LLM exactly once and save exactly once.
     *
     * <p><strong>Validates: Requirements 17.5</strong>
     */
    @Property(tries = 100)
    @Label("Property 2e: incident-summary cache-miss — exactly one LLM call and exactly one save call")
    void property2e_incidentSummaryCacheMiss_exactlyOneLlmCallAndOneSaveCall(
            @ForAll("validLogins")     String userLogin,
            @ForAll("validContextIds") String contextId) {

        // LLM returns valid incident-summary JSON so the service does not fall back.
        when(llmService.chat(anyList(), anyString()))
            .thenReturn(STUB_INCIDENT_JSON);

        // Arrange: repo returns empty list (cache miss).
        when(historyRepo.findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
                eq(userLogin), eq(HaAiChatService.SUMMARY_CTX), eq(contextId)))
            .thenReturn(List.of());

        // Act.
        AiIncidentSummaryDTO result = service.generateIncidentSummary(contextId, userLogin);

        SoftAssertions softly = new SoftAssertions();

        // Assertion 1: HaLlmService.chat was called exactly once.
        softly.assertThatCode(() ->
            verify(llmService, times(1)).chat(anyList(), anyString()))
            .as("HaLlmService.chat must be called exactly once on incident-summary cache-miss " +
                "(userLogin=%s, contextId=%s)", userLogin, contextId)
            .doesNotThrowAnyException();

        // Assertion 2: repo.save was called exactly once.
        softly.assertThatCode(() ->
            verify(historyRepo, times(1)).save(any(HaAiChatHistory.class)))
            .as("HaAiChatHistoryRepository.save must be called exactly once on incident-summary cache-miss " +
                "(userLogin=%s, contextId=%s)", userLogin, contextId)
            .doesNotThrowAnyException();

        // Assertion 3: result is non-null.
        softly.assertThat(result)
            .as("generateIncidentSummary must return a non-null DTO on cache-miss " +
                "(userLogin=%s, contextId=%s)", userLogin, contextId)
            .isNotNull();

        softly.assertAll();
    }

    // =========================================================================
    // Property 2f — incident-summary expired row: treated as cache-miss
    // =========================================================================

    /**
     * An expired incident-summary row (createdAt outside TTL) must not be served
     * from cache; the LLM must be called and a new row must be saved.
     *
     * <p><strong>Validates: Requirements 17.4</strong>
     */
    @Property(tries = 50)
    @Label("Property 2f: incident-summary expired row (outside TTL) is treated as cache-miss")
    void property2f_incidentSummaryExpiredRow_treatedAsCacheMiss(
            @ForAll("validLogins")     String userLogin,
            @ForAll("validContextIds") String contextId) {

        // LLM returns valid incident-summary JSON.
        when(llmService.chat(anyList(), anyString()))
            .thenReturn(STUB_INCIDENT_JSON);

        // Arrange: repo returns a row outside TTL.
        HaAiChatHistory expiredRow = buildCachedRow(
            userLogin, HaAiChatService.SUMMARY_CTX, contextId,
            INCIDENT_MESSAGES_JSON,
            Instant.now().minusSeconds(HaAiChatService.CACHE_TTL_SECONDS + 1L)
        );
        when(historyRepo.findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
                eq(userLogin), eq(HaAiChatService.SUMMARY_CTX), eq(contextId)))
            .thenReturn(List.of(expiredRow));

        // Act — should NOT use the cached row.
        service.generateIncidentSummary(contextId, userLogin);

        SoftAssertions softly = new SoftAssertions();

        softly.assertThatCode(() ->
            verify(llmService, times(1)).chat(anyList(), anyString()))
            .as("Expired incident-summary row must not be served from cache; " +
                "HaLlmService.chat must be called exactly once " +
                "(userLogin=%s, contextId=%s)", userLogin, contextId)
            .doesNotThrowAnyException();

        softly.assertThatCode(() ->
            verify(historyRepo, times(1)).save(any(HaAiChatHistory.class)))
            .as("Expired incident-summary row must cause a fresh save " +
                "(userLogin=%s, contextId=%s)", userLogin, contextId)
            .doesNotThrowAnyException();

        softly.assertAll();
    }

    // =========================================================================
    // Arbitrary providers
    // =========================================================================

    /**
     * Generates valid user-login strings (1–50 characters, alphanumeric + allowed
     * special chars). Matches the {@code VARCHAR(50)} column constraint.
     */
    @Provide
    Arbitrary<String> validLogins() {
        return Arbitraries.strings()
            .withCharRange('a', 'z')
            .ofMinLength(1)
            .ofMaxLength(20);
    }

    /**
     * Generates valid context-id strings (1–255 characters).
     * Matches the {@code VARCHAR(255)} column constraint.
     */
    @Provide
    Arbitrary<String> validContextIds() {
        return Arbitraries.strings()
            .withCharRange('a', 'z')
            .ofMinLength(1)
            .ofMaxLength(50);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Builds a {@link HaAiChatHistory} entity directly (bypassing JPA lifecycle
     * callbacks) to simulate a row already stored in the database with a
     * predetermined {@code createdAt} value.
     *
     * @param userLogin    the owning user's login
     * @param contextType  the context type string (e.g. {@code "triage"})
     * @param contextId    the context identifier (e.g. alert ID)
     * @param messagesJson the serialised messages JSON to store
     * @param createdAt    the timestamp to assign (bypasses {@link HaAiChatHistory#onCreate()})
     * @return the pre-populated entity instance
     */
    private static HaAiChatHistory buildCachedRow(String userLogin,
                                                    String contextType,
                                                    String contextId,
                                                    String messagesJson,
                                                    Instant createdAt) {
        HaAiChatHistory row = new HaAiChatHistory();
        row.setId(42L);
        row.setUserLogin(userLogin);
        row.setContextType(contextType);
        row.setContextId(contextId);
        row.setMessagesJson(messagesJson);
        // Bypass @PrePersist by setting the field directly via setter.
        row.setCreatedAt(createdAt);
        row.setUpdatedAt(createdAt);
        return row;
    }

    /**
     * Serialises {@code s} as a JSON string literal (wraps in quotes, escapes inner
     * quotes and backslashes).
     *
     * <p>Used to embed {@link #STUB_INCIDENT_JSON} as the {@code content} field
     * of the cached messages JSON without a real {@link ObjectMapper} at
     * static-initialiser time.
     *
     * @param s the raw string to wrap
     * @return the JSON string literal (including surrounding {@code "} characters)
     */
    private static String jsonStringLiteral(String s) {
        // Escape backslashes first, then double-quotes.
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }
}
