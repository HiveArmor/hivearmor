package com.hivearmor.service.rulegen;

import com.hivearmor.ai.HaLlmService;
import com.hivearmor.domain.rulegen.HaAlertSignal;
import com.hivearmor.domain.rulegen.HaRuleGenSession;
import com.hivearmor.repository.rulegen.HaAlertSignalRepository;
import com.hivearmor.repository.rulegen.HaRuleGenSessionRepository;
import com.hivearmor.service.llm.ChatMessage;
import com.hivearmor.service.llm.ChatOptions;
import com.hivearmor.service.rulegen.dto.GenerateRequest;
import com.hivearmor.service.rulegen.dto.RuleGenSessionDTO;
import com.hivearmor.service.rulegen.dto.SignalGroup;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link HaRuleGenerationService}.
 *
 * <p>Covers:
 * <ul>
 *   <li>Generate happy path — LLM returns valid YAML on first call</li>
 *   <li>Generate retry-then-succeed — first call invalid, second valid</li>
 *   <li>Generate retry-then-fail — both calls invalid → RuleGenerationException</li>
 *   <li>Approve I/O failure surfaces as RuntimeException</li>
 *   <li>Reject state transition</li>
 *   <li>Regenerate creates new session</li>
 * </ul>
 *
 * <p>Requirements: 3.1, 3.3, 3.5, 3.7, 3.8
 */
@ExtendWith(MockitoExtension.class)
class HaRuleGenerationServiceTest {

    private static final Instant FIXED_NOW = Instant.parse("2026-07-25T12:00:00Z");
    private static final String VALID_YAML =
        "name: test_rule\nseverity: high\ndataTypes:\n  - linux\ndefinition: cel_expr";
    private static final String INVALID_YAML = "this is not valid yaml: [[[";
    private static final String MISSING_KEYS_YAML = "name: incomplete\nseverity: low\n";

    @TempDir
    Path tempDir;

    @Mock
    private HaAlertSignalRepository signalRepo;

    @Mock
    private HaRuleGenSessionRepository sessionRepo;

    @Mock
    private HaLlmService llmService;

    private final Clock clock = Clock.fixed(FIXED_NOW, ZoneId.of("UTC"));

    private HaRuleGenerationService service;

    @BeforeEach
    void setUp() throws Exception {
        service = new HaRuleGenerationService(signalRepo, sessionRepo, llmService, clock);

        // Inject outputDir via reflection since @Value won't fire in a unit test
        Field outputDirField = HaRuleGenerationService.class.getDeclaredField("outputDir");
        outputDirField.setAccessible(true);
        outputDirField.set(service, tempDir.toString());
    }

    // ---- Test 1: Generate happy path ----

    @Test
    void generateRuleSuggestion_validYamlOnFirstCall_persistsSessionWithPendingReview() {
        // Given: signal groups exist and LLM returns valid YAML on first call
        when(signalRepo.findSignalGroupsWithMinCount(anyLong()))
            .thenReturn(List.of(new SignalGroup("linux", HaAlertSignal.SignalType.TRUE_POSITIVE, 5, FIXED_NOW, FIXED_NOW)));
        when(llmService.chat(anyList(), any(ChatOptions.class)))
            .thenReturn(VALID_YAML);
        when(sessionRepo.save(any(HaRuleGenSession.class)))
            .thenAnswer(invocation -> {
                HaRuleGenSession s = invocation.getArgument(0);
                s.setId(1L);
                return s;
            });

        // When
        GenerateRequest req = new GenerateRequest("linux", 3L);
        RuleGenSessionDTO result = service.generateRuleSuggestion(req);

        // Then: session is persisted with pending_review status
        assertThat(result.status()).isEqualTo("pending_review");
        assertThat(result.ruleName()).isEqualTo("test_rule");
        assertThat(result.ruleYaml()).isEqualTo(VALID_YAML);
        assertThat(result.signalKey()).isEqualTo("linux");

        // LLM was called exactly once (no retry needed)
        verify(llmService, times(1)).chat(anyList(), any(ChatOptions.class));

        // Session was saved
        ArgumentCaptor<HaRuleGenSession> captor = ArgumentCaptor.forClass(HaRuleGenSession.class);
        verify(sessionRepo).save(captor.capture());
        HaRuleGenSession saved = captor.getValue();
        assertThat(saved.getStatus()).isEqualTo(HaRuleGenSession.SessionStatus.pending_review);
        assertThat(saved.getCreatedAt()).isEqualTo(FIXED_NOW);
        assertThat(saved.getUpdatedAt()).isEqualTo(FIXED_NOW);
    }

    // ---- Test 2: Generate retry-then-succeed ----

    @Test
    void generateRuleSuggestion_invalidThenValid_succeedsOnSecondAttempt() {
        // Given: first LLM response is invalid YAML, second is valid
        when(signalRepo.findSignalGroupsWithMinCount(anyLong()))
            .thenReturn(List.of(new SignalGroup("windows", HaAlertSignal.SignalType.TRUE_POSITIVE, 4, FIXED_NOW, FIXED_NOW)));
        when(llmService.chat(anyList(), any(ChatOptions.class)))
            .thenReturn(MISSING_KEYS_YAML)  // attempt 1: missing required keys
            .thenReturn(VALID_YAML);        // attempt 2: valid
        when(sessionRepo.save(any(HaRuleGenSession.class)))
            .thenAnswer(invocation -> {
                HaRuleGenSession s = invocation.getArgument(0);
                s.setId(2L);
                return s;
            });

        // When
        GenerateRequest req = new GenerateRequest("windows", 3L);
        RuleGenSessionDTO result = service.generateRuleSuggestion(req);

        // Then: succeeds with valid YAML from second attempt
        assertThat(result.status()).isEqualTo("pending_review");
        assertThat(result.ruleName()).isEqualTo("test_rule");
        assertThat(result.ruleYaml()).isEqualTo(VALID_YAML);

        // LLM was called exactly twice
        verify(llmService, times(2)).chat(anyList(), any(ChatOptions.class));
    }

    // ---- Test 3: Generate retry-then-fail ----

    @Test
    void generateRuleSuggestion_bothAttemptsInvalid_throwsRuleGenerationException() {
        // Given: both LLM responses are invalid
        when(signalRepo.findSignalGroupsWithMinCount(anyLong()))
            .thenReturn(List.of(new SignalGroup("linux", HaAlertSignal.SignalType.TRUE_POSITIVE, 3, FIXED_NOW, FIXED_NOW)));
        when(llmService.chat(anyList(), any(ChatOptions.class)))
            .thenReturn(INVALID_YAML)       // attempt 1: unparseable YAML
            .thenReturn(MISSING_KEYS_YAML); // attempt 2: missing required keys

        // When / Then: throws RuleGenerationException after exhausting retries
        GenerateRequest req = new GenerateRequest("linux", 3L);
        assertThatThrownBy(() -> service.generateRuleSuggestion(req))
            .isInstanceOf(RuleGenerationException.class)
            .hasMessageContaining("invalid YAML after 2 attempts");

        // LLM was called exactly twice (initial + 1 retry)
        verify(llmService, times(2)).chat(anyList(), any(ChatOptions.class));

        // No session was persisted
        verify(sessionRepo, never()).save(any());
    }

    // ---- Test 4: Approve I/O failure surfaces as RuntimeException ----

    @Test
    void approveSession_ioFailure_throwsRuntimeException() throws Exception {
        // Given: a pending session exists
        HaRuleGenSession session = HaRuleGenSession.builder()
            .id(10L)
            .status(HaRuleGenSession.SessionStatus.pending_review)
            .ruleName("test_rule")
            .ruleYaml(VALID_YAML)
            .signalKey("linux")
            .createdAt(FIXED_NOW)
            .updatedAt(FIXED_NOW)
            .build();
        when(sessionRepo.findById(10L)).thenReturn(Optional.of(session));

        // Set outputDir to a path that will cause an I/O failure:
        // create a regular file, then point outputDir to a subdirectory beneath it
        Path blockingFile = tempDir.resolve("not_a_directory");
        Files.writeString(blockingFile, "blocking content");

        Field outputDirField = HaRuleGenerationService.class.getDeclaredField("outputDir");
        outputDirField.setAccessible(true);
        outputDirField.set(service, blockingFile.resolve("impossible_subdir").toString());

        // When / Then: approve throws RuntimeException wrapping the I/O failure
        assertThatThrownBy(() -> service.approveSession(10L))
            .isInstanceOf(RuntimeException.class);
    }

    // ---- Test 5: Reject state transition ----

    @Test
    void rejectSession_pendingReview_transitionsToRejectedNoFileWritten() {
        // Given: a pending session
        HaRuleGenSession session = HaRuleGenSession.builder()
            .id(20L)
            .status(HaRuleGenSession.SessionStatus.pending_review)
            .ruleName("test_rule")
            .ruleYaml(VALID_YAML)
            .signalKey("linux")
            .createdAt(FIXED_NOW)
            .updatedAt(FIXED_NOW)
            .build();
        when(sessionRepo.findById(20L)).thenReturn(Optional.of(session));
        when(sessionRepo.save(any(HaRuleGenSession.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        // When
        RuleGenSessionDTO result = service.rejectSession(20L);

        // Then: status is rejected
        assertThat(result.status()).isEqualTo("rejected");
        assertThat(result.updatedAt()).isEqualTo(FIXED_NOW);

        // And: session was saved with rejected status
        ArgumentCaptor<HaRuleGenSession> captor = ArgumentCaptor.forClass(HaRuleGenSession.class);
        verify(sessionRepo).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(HaRuleGenSession.SessionStatus.rejected);

        // And: no file was written (output directory is still empty)
        assertThat(tempDir.toFile().listFiles()).isEmpty();
    }

    // ---- Test 6: Regenerate creates new session ----

    @Test
    void regenerateSession_rejectsOldAndGeneratesFresh() {
        // Given: an existing pending session
        HaRuleGenSession oldSession = HaRuleGenSession.builder()
            .id(30L)
            .status(HaRuleGenSession.SessionStatus.pending_review)
            .ruleName("old_rule")
            .ruleYaml("name: old_rule\nseverity: low\ndataTypes:\n  - generic\ndefinition: old")
            .signalKey("linux")
            .createdAt(FIXED_NOW)
            .updatedAt(FIXED_NOW)
            .build();
        when(sessionRepo.findById(30L)).thenReturn(Optional.of(oldSession));

        // Stub save to assign IDs and return the saved entity
        when(sessionRepo.save(any(HaRuleGenSession.class)))
            .thenAnswer(invocation -> {
                HaRuleGenSession s = invocation.getArgument(0);
                if (s.getId() == null) {
                    s.setId(31L); // new session gets a new ID
                }
                return s;
            });

        // LLM returns valid YAML for the new generation
        when(signalRepo.findSignalGroupsWithMinCount(anyLong()))
            .thenReturn(List.of(new SignalGroup("linux", HaAlertSignal.SignalType.TRUE_POSITIVE, 5, FIXED_NOW, FIXED_NOW)));
        when(llmService.chat(anyList(), any(ChatOptions.class)))
            .thenReturn(VALID_YAML);

        // When
        GenerateRequest req = new GenerateRequest("linux", 3L);
        RuleGenSessionDTO result = service.regenerateSession(30L, req);

        // Then: old session was rejected
        assertThat(oldSession.getStatus()).isEqualTo(HaRuleGenSession.SessionStatus.rejected);

        // And: a new session was created with pending_review
        assertThat(result.status()).isEqualTo("pending_review");
        assertThat(result.ruleName()).isEqualTo("test_rule");
        assertThat(result.ruleYaml()).isEqualTo(VALID_YAML);
        assertThat(result.id()).isEqualTo(31L);

        // Session repo saved twice: once for reject, once for the new session
        verify(sessionRepo, times(2)).save(any(HaRuleGenSession.class));
    }
}
