package com.hivearmor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.domain.HaAiChatHistory;
import com.hivearmor.repository.HaAiChatHistoryRepository;
import com.hivearmor.web.rest.dto.AiChatHistoryDTO;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Property 7: Per-user tenant-context preservation on history and cache.
 *
 * <p><strong>Property 7: Per-user tenant-context preservation on history and cache</strong><br>
 * For any two distinct principals {@code u1} and {@code u2}, any row persisted while the
 * authenticated principal was {@code u1} is never returned by {@code getHistory} /
 * {@code generateTriage} / {@code generateIncidentSummary} when the authenticated principal
 * is {@code u2}; every repository query is scoped by {@code user_login = <principal>} and
 * the principal is derived only from {@code Principal}.
 *
 * <p>Uses Mockito {@link ArgumentCaptor} to verify that repository methods are always
 * called with the correct {@code userLogin} parameter and never with the other principal's
 * login. Data returned for one user is never served when requesting for a different user.
 *
 * <p><strong>Validates: Requirements 3.7, 3.8, 3.9, 5.7, 13.4, 17.4</strong>
 */
@Label("Feature: sprint-25-ai-chat, Property 7: Per-user tenant-context preservation")
class HaAiChatTenantIsolationPropertyTest {

    // -------------------------------------------------------------------------
    // Test infrastructure — re-created fresh before every jqwik trial
    // -------------------------------------------------------------------------

    private HaAiChatHistoryRepository repo;
    private HaLlmService llm;
    private HaAlertContextService alertCtx;
    private HaIncidentContextService incidentCtx;
    private HaAiChatService service;
    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    @BeforeTry
    void setUp() {
        llm         = mock(HaLlmService.class);
        repo        = mock(HaAiChatHistoryRepository.class);
        alertCtx    = mock(HaAlertContextService.class);
        incidentCtx = mock(HaIncidentContextService.class);
        service     = new HaAiChatService(llm, repo, alertCtx, incidentCtx, objectMapper);
    }

    // =========================================================================
    // Property 7-A: getHistory (no contextId) — repository called with u1 not u2
    // =========================================================================

    /**
     * <strong>Property 7-A: getHistory scopes by caller's login (contextId absent)</strong>
     *
     * <p>For any two distinct logins {@code u1} and {@code u2}:
     * <ul>
     *   <li>{@code getHistory} called with {@code u1} must pass exactly {@code u1} to the
     *       repository — never {@code u2}.</li>
     *   <li>The results returned for {@code u1} (which are non-empty) are never returned
     *       when querying with {@code u2} (which returns empty).</li>
     * </ul>
     *
     * <p><strong>Validates: Requirements 3.7, 3.8, 5.7</strong>
     */
    @Property(tries = 100)
    @Label("Property 7-A: getHistory without contextId passes caller login to repository, never the other user's login")
    void property7a_getHistory_noContextId_callerLoginPassedToRepo(
            @ForAll("distinctLoginPairs") String[] loginPair) {

        String u1          = loginPair[0];
        String u2          = loginPair[1];
        String contextType = "general";

        // Stub: u1 has history, u2 has none
        HaAiChatHistory u1Row = buildRow(u1, contextType, null);
        when(repo.findByUserLoginAndContextTypeOrderByCreatedAtDesc(u1, contextType))
            .thenReturn(List.of(u1Row));
        when(repo.findByUserLoginAndContextTypeOrderByCreatedAtDesc(u2, contextType))
            .thenReturn(List.of());

        // Act for both principals
        List<AiChatHistoryDTO> u1Results = service.getHistory(contextType, null, u1);
        List<AiChatHistoryDTO> u2Results = service.getHistory(contextType, null, u2);

        // Capture argument passed to repository for u1
        ArgumentCaptor<String> loginCaptor = ArgumentCaptor.forClass(String.class);
        verify(repo, atLeastOnce())
            .findByUserLoginAndContextTypeOrderByCreatedAtDesc(loginCaptor.capture(), eq(contextType));

        // Every captured login must be either u1 or u2 — never a third value
        for (String capturedLogin : loginCaptor.getAllValues()) {
            assertThat(capturedLogin)
                .as("Repository must only be called with u1 or u2, not any other value")
                .isIn(u1, u2);
        }

        // u1 gets non-empty results; u2 sees nothing — isolation is preserved
        assertThat(u1Results)
            .as("u1 must receive its own history row")
            .hasSize(1);
        assertThat(u1Results.get(0).userLogin())
            .as("The returned DTO's userLogin must equal u1")
            .isEqualTo(u1);
        assertThat(u2Results)
            .as("u2 must receive no rows from u1's data")
            .isEmpty();

        // Repository was never called with u2 when querying for u1 and vice-versa
        verify(repo).findByUserLoginAndContextTypeOrderByCreatedAtDesc(u1, contextType);
        verify(repo).findByUserLoginAndContextTypeOrderByCreatedAtDesc(u2, contextType);
        // u2's login must never have been passed for a u1 query
        verify(repo, never())
            .findByUserLoginAndContextTypeOrderByCreatedAtDesc(eq(u2), argThat(t -> !t.equals(contextType)));
    }

    // =========================================================================
    // Property 7-B: getHistory (with contextId) — userLogin argument isolation
    // =========================================================================

    /**
     * <strong>Property 7-B: getHistory with contextId passes caller login, not the other user's</strong>
     *
     * <p>When {@code contextId} is non-blank, the three-parameter repository finder is
     * called with the exact login provided by the caller. The {@code ArgumentCaptor}
     * asserts that the first argument is always the caller's login.
     *
     * <p><strong>Validates: Requirements 3.7, 3.8, 5.7</strong>
     */
    @Property(tries = 100)
    @Label("Property 7-B: getHistory with contextId passes correct userLogin; u1 data not served to u2")
    void property7b_getHistory_withContextId_loginIsolation(
            @ForAll("distinctLoginPairs") String[] loginPair,
            @ForAll("nonBlankIds") String contextId) {

        String u1          = loginPair[0];
        String u2          = loginPair[1];
        String contextType = "alert";

        HaAiChatHistory u1Row = buildRow(u1, contextType, contextId);
        when(repo.findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(u1, contextType, contextId))
            .thenReturn(List.of(u1Row));
        when(repo.findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(u2, contextType, contextId))
            .thenReturn(List.of());

        List<AiChatHistoryDTO> u1Results = service.getHistory(contextType, contextId, u1);
        List<AiChatHistoryDTO> u2Results = service.getHistory(contextType, contextId, u2);

        // Capture the userLogin argument passed for both calls
        ArgumentCaptor<String> loginCaptor = ArgumentCaptor.forClass(String.class);
        verify(repo, atLeastOnce()).findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
            loginCaptor.capture(), eq(contextType), eq(contextId));

        for (String captured : loginCaptor.getAllValues()) {
            assertThat(captured)
                .as("userLogin argument must be exactly u1 or u2, never a different value")
                .isIn(u1, u2);
        }

        // Isolation: u1 gets its row, u2 gets nothing
        assertThat(u1Results).hasSize(1);
        assertThat(u1Results.get(0).userLogin()).isEqualTo(u1);
        assertThat(u2Results).isEmpty();

        // Each principal's login was passed once
        verify(repo).findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(u1, contextType, contextId);
        verify(repo).findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(u2, contextType, contextId);
    }

    // =========================================================================
    // Property 7-C: generateTriage cache lookup — ArgumentCaptor on userLogin
    // =========================================================================

    /**
     * <strong>Property 7-C: generateTriage passes caller's userLogin to repository cache lookup</strong>
     *
     * <p>The cache lookup inside {@code generateTriage} must call
     * {@code findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc} with the
     * caller's {@code userLogin} as the first argument. Using ArgumentCaptor ensures
     * the exact value passed is captured and verified.
     *
     * <p>Both users trigger a cache miss so the LLM is invoked for each — meaning
     * the repository is called once per user to check the cache, and once per user
     * to persist the result. The captured {@code userLogin} values must be exactly
     * {@code u1} and {@code u2} respectively.
     *
     * <p><strong>Validates: Requirements 13.4, 5.7</strong>
     */
    @Property(tries = 50)
    @Label("Property 7-C: generateTriage cache lookup uses caller userLogin — verified by ArgumentCaptor")
    void property7c_generateTriage_cacheQueryScopedByLogin(
            @ForAll("distinctLoginPairs") String[] loginPair,
            @ForAll("nonBlankIds") String alertId) {

        String u1 = loginPair[0];
        String u2 = loginPair[1];

        // Both users: empty cache (triggers LLM + persist path)
        when(repo.findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
            anyString(), eq("triage"), eq(alertId)))
            .thenReturn(List.of());
        when(alertCtx.loadAlertAsJson(alertId)).thenReturn("{\"id\":\"" + alertId + "\"}");
        when(llm.chat(any(), anyString())).thenReturn("triage summary text");
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.generateTriage(alertId, u1);
        service.generateTriage(alertId, u2);

        // Capture all userLogin arguments passed to the cache lookup
        ArgumentCaptor<String> loginCaptor = ArgumentCaptor.forClass(String.class);
        verify(repo, atLeast(2)).findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
            loginCaptor.capture(), eq("triage"), eq(alertId));

        List<String> capturedLogins = loginCaptor.getAllValues();
        assertThat(capturedLogins)
            .as("Both u1 and u2 must have been used as userLogin in triage cache lookups")
            .contains(u1, u2);

        // Verify each was passed at least once with its own login
        verify(repo, atLeastOnce())
            .findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(eq(u1), eq("triage"), eq(alertId));
        verify(repo, atLeastOnce())
            .findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(eq(u2), eq("triage"), eq(alertId));
    }

    // =========================================================================
    // Property 7-D: generateTriage cache hit — u1's cached data not returned for u2
    // =========================================================================

    /**
     * <strong>Property 7-D: generateTriage returns u1's cached result only to u1</strong>
     *
     * <p>When u1 has a fresh cache row, {@code generateTriage(alertId, u1)} returns
     * the cached text without calling the LLM. When queried as u2 (who has no cache),
     * the LLM is called separately and a different result is returned — u1's cached
     * text is never served to u2.
     *
     * <p><strong>Validates: Requirements 3.7, 13.4, 17.4</strong>
     */
    @Property(tries = 50)
    @Label("Property 7-D: generateTriage cache hit serves u1's data only to u1, not to u2")
    void property7d_generateTriage_cacheHit_notServedToOtherUser(
            @ForAll("distinctLoginPairs") String[] loginPair,
            @ForAll("nonBlankIds") String alertId) {

        String u1 = loginPair[0];
        String u2 = loginPair[1];

        String u1CachedSummary  = "cached triage for u1-" + u1;
        String u2LlmSummary     = "fresh triage for u2-" + u2;

        // u1 has a fresh cache row (createdAt = now)
        HaAiChatHistory u1CacheRow = buildRow(u1, "triage", alertId);
        u1CacheRow.setMessagesJson(
            "[{\"role\":\"assistant\",\"content\":\"" + u1CachedSummary + "\"}]");
        u1CacheRow.setCreatedAt(Instant.now());
        u1CacheRow.setUpdatedAt(Instant.now());

        when(repo.findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(u1, "triage", alertId))
            .thenReturn(List.of(u1CacheRow));
        // u2 gets a cache miss
        when(repo.findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(u2, "triage", alertId))
            .thenReturn(List.of());

        when(alertCtx.loadAlertAsJson(alertId)).thenReturn("{\"id\":\"" + alertId + "\"}");
        when(llm.chat(any(), anyString())).thenReturn(u2LlmSummary);
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        String resultU1 = service.generateTriage(alertId, u1);
        String resultU2 = service.generateTriage(alertId, u2);

        // u1 gets its own cached text; LLM was NOT called for u1
        assertThat(resultU1)
            .as("u1 must receive its own cached triage summary")
            .isEqualTo(u1CachedSummary);
        // u2 gets the fresh LLM result; u1's cached text must not appear
        assertThat(resultU2)
            .as("u2 must not receive u1's cached data")
            .isNotEqualTo(u1CachedSummary);
        assertThat(resultU2)
            .as("u2 must receive the LLM-generated result")
            .isEqualTo(u2LlmSummary);

        // ArgumentCaptor: repository was called with u1 for u1's query, u2 for u2's query
        ArgumentCaptor<String> loginCaptor = ArgumentCaptor.forClass(String.class);
        verify(repo, atLeast(2)).findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
            loginCaptor.capture(), eq("triage"), eq(alertId));
        assertThat(loginCaptor.getAllValues()).contains(u1, u2);
    }

    // =========================================================================
    // Property 7-E: generateIncidentSummary cache lookup — userLogin isolation
    // =========================================================================

    /**
     * <strong>Property 7-E: generateIncidentSummary passes caller's login to repository</strong>
     *
     * <p>The cache lookup inside {@code generateIncidentSummary} must pass the caller's
     * {@code userLogin} to the repository. Both users get cache misses so the LLM path
     * is exercised. The {@link ArgumentCaptor} verifies the exact login values used.
     *
     * <p><strong>Validates: Requirements 17.4, 3.7</strong>
     */
    @Property(tries = 50)
    @Label("Property 7-E: generateIncidentSummary cache lookup uses caller userLogin — verified by ArgumentCaptor")
    void property7e_generateIncidentSummary_cacheQueryScopedByLogin(
            @ForAll("distinctLoginPairs") String[] loginPair,
            @ForAll("nonBlankIds") String incidentId) throws Exception {

        String u1 = loginPair[0];
        String u2 = loginPair[1];

        // Both users: cache miss
        when(repo.findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
            anyString(), eq("incident_summary"), eq(incidentId)))
            .thenReturn(List.of());

        String validSummaryJson = objectMapper.writeValueAsString(
            new com.hivearmor.web.rest.dto.AiIncidentSummaryDTO(
                "Test narrative", "APT", List.of("Step 1"), "medium"));

        when(incidentCtx.loadIncidentAsJson(incidentId))
            .thenReturn("{\"id\":\"" + incidentId + "\"}");
        when(llm.chat(any(), anyString())).thenReturn(validSummaryJson);
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.generateIncidentSummary(incidentId, u1);
        service.generateIncidentSummary(incidentId, u2);

        // Capture userLogin arguments used in cache lookups
        ArgumentCaptor<String> loginCaptor = ArgumentCaptor.forClass(String.class);
        verify(repo, atLeast(2)).findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
            loginCaptor.capture(), eq("incident_summary"), eq(incidentId));

        List<String> capturedLogins = loginCaptor.getAllValues();
        assertThat(capturedLogins)
            .as("Both u1 and u2 logins must appear in incident summary cache lookups")
            .contains(u1, u2);

        // Each was queried with the correct login
        verify(repo, atLeastOnce())
            .findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
                eq(u1), eq("incident_summary"), eq(incidentId));
        verify(repo, atLeastOnce())
            .findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
                eq(u2), eq("incident_summary"), eq(incidentId));
    }

    // =========================================================================
    // Property 7-F: u1 and u2 never cross-contaminate on save path
    // =========================================================================

    /**
     * <strong>Property 7-F: persist operations are scoped to the caller's login</strong>
     *
     * <p>When {@code saveHistory} is called for u1, the entity saved to the repository
     * has {@code userLogin == u1}. A subsequent {@code saveHistory} call for u2 saves
     * an entity with {@code userLogin == u2}. The two saves never cross-contaminate.
     *
     * <p><strong>Validates: Requirements 3.9, 5.7</strong>
     */
    @Property(tries = 100)
    @Label("Property 7-F: saveHistory persists entity with caller's login, not the other user's")
    void property7f_saveHistory_entityLoginMatchesCaller(
            @ForAll("distinctLoginPairs") String[] loginPair) {

        String u1 = loginPair[0];
        String u2 = loginPair[1];

        // repo.save returns its argument unchanged
        when(repo.save(any(HaAiChatHistory.class)))
            .thenAnswer(inv -> {
                HaAiChatHistory e = inv.getArgument(0);
                // Set timestamps as @PrePersist would
                Instant now = Instant.now();
                e.setCreatedAt(now);
                e.setUpdatedAt(now);
                return e;
            });

        com.hivearmor.web.rest.dto.AiChatRequestDTO req1 = new com.hivearmor.web.rest.dto.AiChatRequestDTO(
            List.of(new com.hivearmor.web.rest.dto.ChatMessageDTO("user", "hello")),
            "general",
            null);
        com.hivearmor.web.rest.dto.AiChatRequestDTO req2 = new com.hivearmor.web.rest.dto.AiChatRequestDTO(
            List.of(new com.hivearmor.web.rest.dto.ChatMessageDTO("user", "world")),
            "general",
            null);

        AiChatHistoryDTO saved1 = service.saveHistory(req1, u1);
        AiChatHistoryDTO saved2 = service.saveHistory(req2, u2);

        // Capture the entity arguments passed to repo.save
        ArgumentCaptor<HaAiChatHistory> entityCaptor = ArgumentCaptor.forClass(HaAiChatHistory.class);
        verify(repo, times(2)).save(entityCaptor.capture());
        List<HaAiChatHistory> savedEntities = entityCaptor.getAllValues();

        assertThat(savedEntities.get(0).getUserLogin())
            .as("First saved entity must have u1 as userLogin")
            .isEqualTo(u1);
        assertThat(savedEntities.get(1).getUserLogin())
            .as("Second saved entity must have u2 as userLogin")
            .isEqualTo(u2);

        // DTOs returned to each caller carry the correct login
        assertThat(saved1.userLogin()).isEqualTo(u1);
        assertThat(saved2.userLogin()).isEqualTo(u2);

        // No cross-contamination: each entity carries only its caller's login
        assertThat(savedEntities.get(0).getUserLogin()).isNotEqualTo(u2);
        assertThat(savedEntities.get(1).getUserLogin()).isNotEqualTo(u1);
    }

    // =========================================================================
    // Arbitrary providers
    // =========================================================================

    /**
     * Generates pairs {@code [u1, u2]} of distinct, non-blank alpha-only login strings.
     * The filter guarantees {@code u1 != u2} so every trial exercises real isolation.
     */
    @Provide
    Arbitrary<String[]> distinctLoginPairs() {
        return Arbitraries.strings()
            .alpha()
            .ofMinLength(3)
            .ofMaxLength(20)
            .tuple2()
            .filter(t -> !t.get1().equals(t.get2()))
            .map(t -> new String[]{t.get1(), t.get2()});
    }

    /** Generates non-blank, alpha-only context/entity ID strings. */
    @Provide
    Arbitrary<String> nonBlankIds() {
        return Arbitraries.strings()
            .alpha()
            .ofMinLength(1)
            .ofMaxLength(40);
    }

    // =========================================================================
    // Helper — build a stub HaAiChatHistory row
    // =========================================================================

    /**
     * Constructs a minimal {@link HaAiChatHistory} row for use in Mockito stubs.
     * The {@code messagesJson} is a single-element JSON array; {@code createdAt} and
     * {@code updatedAt} are set to the current instant so cache TTL checks pass.
     */
    private HaAiChatHistory buildRow(String userLogin, String ctxType, String ctxId) {
        HaAiChatHistory row = new HaAiChatHistory();
        row.setUserLogin(userLogin);
        row.setContextType(ctxType);
        row.setContextId(ctxId);
        row.setMessagesJson("[{\"role\":\"assistant\",\"content\":\"cached result\"}]");
        Instant now = Instant.now();
        row.setCreatedAt(now);
        row.setUpdatedAt(now);
        return row;
    }
}
