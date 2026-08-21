package com.hivearmor.web.rest;

import com.hivearmor.ai.HaLlmService;
import com.hivearmor.domain.rulegen.HaAlertSignal;
import com.hivearmor.domain.rulegen.HaRuleGenSession;
import com.hivearmor.repository.rulegen.HaAlertSignalRepository;
import com.hivearmor.repository.rulegen.HaRuleGenSessionRepository;
import com.hivearmor.service.llm.ChatMessage;
import com.hivearmor.service.llm.ChatOptions;
import com.hivearmor.service.rulegen.HaRuleGenerationService;
import com.hivearmor.service.rulegen.dto.GenerateRequest;
import com.hivearmor.service.rulegen.dto.RuleGenSessionDTO;
import com.hivearmor.service.rulegen.dto.SignalGroup;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

import java.lang.reflect.Field;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

/**
 * Verification Check 3 — Generated YAML contains required keys.
 *
 * <p>This integration test asserts that the persisted session's YAML document,
 * when parsed with SnakeYAML, contains the top-level keys {@code name},
 * {@code severity}, {@code dataTypes}, and {@code definition}.
 *
 * <p><strong>Validates: Requirement 7.3</strong>
 */
@DisplayName("Verification Check 3: Generated YAML contains required keys")
class VerificationCheck3Test {

    private static final String VALID_YAML = """
            name: Brute Force Login Detection
            severity: high
            dataTypes:
              - firewall
              - windows_event
            definition: |
              cel: login_failures > 5 && timeWindow < 300s
            """;

    private HaLlmService llmService;
    private HaRuleGenSessionRepository sessionRepo;
    private HaRuleGenerationService service;

    @BeforeEach
    void setUp() throws Exception {
        llmService = mock(HaLlmService.class);
        HaAlertSignalRepository signalRepo = mock(HaAlertSignalRepository.class);
        sessionRepo = mock(HaRuleGenSessionRepository.class);
        Clock clock = Clock.fixed(Instant.parse("2026-07-25T12:00:00Z"), ZoneOffset.UTC);

        // Return a signal group so prompt building doesn't fail
        when(signalRepo.findSignalGroupsWithMinCount(anyLong()))
            .thenReturn(List.of(
                new SignalGroup("firewall", HaAlertSignal.SignalType.TRUE_POSITIVE,
                    5, Instant.now(), Instant.now())
            ));

        // Mock sessionRepo.save to return the entity with a generated ID
        when(sessionRepo.save(any(HaRuleGenSession.class))).thenAnswer(invocation -> {
            HaRuleGenSession session = invocation.getArgument(0);
            session.setId(1L);
            return session;
        });

        service = new HaRuleGenerationService(signalRepo, sessionRepo, llmService, clock);

        // Inject outputDir via reflection since @Value won't fire in a unit test
        Field outputDirField = HaRuleGenerationService.class.getDeclaredField("outputDir");
        outputDirField.setAccessible(true);
        outputDirField.set(service, "/tmp/test-rules");
    }

    /**
     * Verification Check 3: The persisted session's YAML document, when parsed with
     * SnakeYAML, contains the required top-level keys: name, severity, dataTypes, definition.
     *
     * <p><strong>Validates: Requirement 7.3</strong>
     */
    @Test
    @DisplayName("Persisted session YAML contains all 4 required top-level keys")
    void generatedYaml_containsRequiredKeys() {
        // Arrange — mock HaLlmService.chat to return valid YAML with all 4 keys
        when(llmService.chat(any(List.class), any(ChatOptions.class)))
            .thenReturn(VALID_YAML);

        // Act — call generateRuleSuggestion
        RuleGenSessionDTO result = service.generateRuleSuggestion(
            new GenerateRequest("firewall-brute-force", 3L));

        // Capture the saved HaRuleGenSession entity
        ArgumentCaptor<HaRuleGenSession> captor = ArgumentCaptor.forClass(HaRuleGenSession.class);
        verify(sessionRepo).save(captor.capture());
        HaRuleGenSession savedSession = captor.getValue();

        // Assert — parse the captured entity's ruleYaml with SnakeYAML
        String ruleYaml = savedSession.getRuleYaml();
        assertThat(ruleYaml).isNotNull().isNotBlank();

        Yaml yaml = new Yaml(new SafeConstructor(new LoaderOptions()));
        @SuppressWarnings("unchecked")
        Map<String, Object> parsedMap = (Map<String, Object>) yaml.load(ruleYaml);

        assertThat(parsedMap)
            .as("Parsed YAML must contain all 4 required top-level keys")
            .containsKey("name")
            .containsKey("severity")
            .containsKey("dataTypes")
            .containsKey("definition");

        // Additionally verify that the values are non-null
        assertThat(parsedMap.get("name"))
            .as("'name' key must have a non-null value")
            .isNotNull();
        assertThat(parsedMap.get("severity"))
            .as("'severity' key must have a non-null value")
            .isNotNull();
        assertThat(parsedMap.get("dataTypes"))
            .as("'dataTypes' key must have a non-null value")
            .isNotNull();
        assertThat(parsedMap.get("definition"))
            .as("'definition' key must have a non-null value")
            .isNotNull();

        // Also verify the session has pending_review status
        assertThat(savedSession.getStatus())
            .isEqualTo(HaRuleGenSession.SessionStatus.pending_review);
    }
}
