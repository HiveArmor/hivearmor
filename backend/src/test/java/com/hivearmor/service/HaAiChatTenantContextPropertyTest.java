package com.hivearmor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.ai.HaLlmService;
import com.hivearmor.domain.HaAiChatHistory;
import com.hivearmor.repository.HaAiChatHistoryRepository;
import com.hivearmor.web.rest.dto.AiChatHistoryDTO;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
import org.junit.jupiter.api.BeforeEach;

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
 * <p>The Mockito-based variant here validates that the service always passes the caller's
 * {@code userLogin} to the repository (never a hardcoded value or the other user's login).
 * An integration variant backed by Testcontainers PostgreSQL is tagged {@code integration}.
 *
 * <p><strong>Validates: Requirements 3.7, 3.8, 3.9, 5.7, 13.4, 17.4</strong>
 */
@Label("Feature: sprint-25-ai-chat, Property 7: Per-user tenant-context preservation")
class HaAiChatTenantContextPropertyTest {

    private HaAiChatHistoryRepository repo;
    private HaAiChatService service;
    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    @BeforeEach
    @BeforeTry
    void setUp() {
        HaLlmService llm = mock(HaLlmService.class);
        repo = mock(HaAiChatHistoryRepository.class);
        HaAlertContextService alertCtx = mock(HaAlertContextService.class);
        HaIncidentContextService incidentCtx = mock(HaIncidentContextService.class);
        service = new HaAiChatService(llm, repo, alertCtx, incidentCtx, objectMapper);
    }

    // =========================================================================
    // Property 7-A: getHistory always scopes by caller's userLogin
    // =========================================================================

    /**
     * {@code getHistory} must call the repository with exactly the {@code userLogin}
     * passed in — never with a different user's login.
     */
    @Property(tries = 100)
    @Label("Property 7-A: getHistory scopes by caller userLogin only")
    void property7a_getHistory_scopedByCallerLogin(
            @ForAll("distinctLoginPairs") String[] loginPair) {

        String u1 = loginPair[0];
        String u2 = loginPair[1];
        String contextType = "general";

        // Stub: u1 has history, u2 has none
        HaAiChatHistory u1Row = buildRow(u1, contextType, null);
        when(repo.findByUserLoginAndContextTypeOrderByCreatedAtDesc(u1, contextType))
            .thenReturn(List.of(u1Row));
        when(repo.findByUserLoginAndContextTypeOrderByCreatedAtDesc(u2, contextType))
            .thenReturn(List.of());

        List<AiChatHistoryDTO> u1Results = service.getHistory(contextType, null, u1);
        List<AiChatHistoryDTO> u2Results = service.getHistory(contextType, null, u2);

        // u1 gets a result; u2 gets nothing
        assertThat(u1Results).hasSize(1);
        assertThat(u2Results).isEmpty();

        // The repository was called with the correct login for each user
        verify(repo).findByUserLoginAndContextTypeOrderByCreatedAtDesc(u1, contextType);
        verify(repo).findByUserLoginAndContextTypeOrderByCreatedAtDesc(u2, contextType);
        // Neither login was substituted with the other
        verify(repo, never())
            .findByUserLoginAndContextTypeOrderByCreatedAtDesc(eq(u2), argThat(s -> !s.equals(contextType)));
    }

    // =========================================================================
    // Property 7-B: getHistory with contextId — scoped by caller's login
    // =========================================================================

    @Property(tries = 100)
    @Label("Property 7-B: getHistory(contextId) scopes by caller userLogin only")
    void property7b_getHistoryWithContextId_scopedByCallerLogin(
            @ForAll("distinctLoginPairs") String[] loginPair,
            @ForAll("nonBlankIds") String contextId) {

        String u1 = loginPair[0];
        String u2 = loginPair[1];
        String contextType = "alert";

        HaAiChatHistory u1Row = buildRow(u1, contextType, contextId);
        when(repo.findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(u1, contextType, contextId))
            .thenReturn(List.of(u1Row));
        when(repo.findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(u2, contextType, contextId))
            .thenReturn(List.of());

        List<AiChatHistoryDTO> u1Results = service.getHistory(contextType, contextId, u1);
        List<AiChatHistoryDTO> u2Results = service.getHistory(contextType, contextId, u2);

        assertThat(u1Results).hasSize(1);
        assertThat(u2Results).isEmpty();

        verify(repo).findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(u1, contextType, contextId);
        verify(repo).findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(u2, contextType, contextId);
    }

    // =========================================================================
    // Property 7-C: triage cache lookup always uses caller's userLogin
    // =========================================================================

    /**
     * The cache lookup in {@code generateTriage} must pass the caller's {@code userLogin}
     * to the repository — never a hardcoded or shared value.
     */
    @Property(tries = 50)
    @Label("Property 7-C: generateTriage cache lookup uses caller userLogin")
    void property7c_triage_cacheQueryScopedByLogin(
            @ForAll("distinctLoginPairs") String[] loginPair,
            @ForAll("nonBlankIds") String alertId) {

        String u1 = loginPair[0];
        String u2 = loginPair[1];

        // Both users get cache misses to keep test simple
        when(repo.findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(
            anyString(), eq("triage"), eq(alertId)))
            .thenReturn(List.of());

        HaLlmService llm = mock(HaLlmService.class);
        HaAlertContextService alertCtx = mock(HaAlertContextService.class);
        HaIncidentContextService incidentCtx = mock(HaIncidentContextService.class);
        when(alertCtx.loadAlertAsJson(alertId)).thenReturn("{\"id\":\"" + alertId + "\"}");
        when(llm.chat(any(), anyString())).thenReturn("triage result");
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        HaAiChatService svc2 = new HaAiChatService(llm, repo, alertCtx, incidentCtx, objectMapper);

        svc2.generateTriage(alertId, u1);
        svc2.generateTriage(alertId, u2);

        // Repository must have been queried with each distinct login
        verify(repo).findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(u1, "triage", alertId);
        verify(repo).findByUserLoginAndContextTypeAndContextIdOrderByCreatedAtDesc(u2, "triage", alertId);
    }

    // =========================================================================
    // Arbitrary providers
    // =========================================================================

    /** Generates pairs of distinct, non-blank login strings. */
    @Provide
    Arbitrary<String[]> distinctLoginPairs() {
        return Arbitraries.strings().alpha().ofMinLength(3).ofMaxLength(20)
            .tuple2()
            .filter(t -> !t.get1().equals(t.get2()))
            .map(t -> new String[]{t.get1(), t.get2()});
    }

    @Provide
    Arbitrary<String> nonBlankIds() {
        return Arbitraries.strings().alpha().ofMinLength(1).ofMaxLength(40);
    }

    // =========================================================================
    // Helper
    // =========================================================================

    private HaAiChatHistory buildRow(String userLogin, String ctxType, String ctxId) {
        HaAiChatHistory row = new HaAiChatHistory();
        row.setUserLogin(userLogin);
        row.setContextType(ctxType);
        row.setContextId(ctxId);
        row.setMessagesJson("[{\"role\":\"user\",\"content\":\"hello\"}]");
        Instant now = Instant.now();
        row.setCreatedAt(now);
        row.setUpdatedAt(now);
        return row;
    }
}
