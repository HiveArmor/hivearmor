package com.hivearmor.web.rest;

import com.hivearmor.ai.HaLlmService;
import com.hivearmor.domain.rulegen.HaRuleGenSession;
import com.hivearmor.repository.rulegen.HaAlertSignalRepository;
import com.hivearmor.repository.rulegen.HaRuleGenSessionRepository;
import com.hivearmor.service.rulegen.HaRuleGenerationService;
import com.hivearmor.service.rulegen.dto.RuleGenSessionDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.IOException;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Optional;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * Verification Check 6: Reject sets rejected status and writes no file.
 *
 * <p>This test exercises the backend portion of Check 6: invoking
 * {@link HaRuleGenerationService#rejectSession(Long)} against a temporary
 * {@code RuleGenOutputDir} and verifying that the session status transitions
 * to {@code rejected} and no file is written to the output directory.
 *
 * <p><strong>Validates: Requirement 7.6</strong>
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Verification Check 6: rejectSession sets rejected status and writes no file")
class VerificationCheck6Test {

    private static final Instant FIXED_NOW = Instant.parse("2026-07-25T15:00:00Z");
    private static final String KNOWN_RULE_NAME = "Lateral Movement RDP";
    private static final String KNOWN_RULE_YAML =
        "name: Lateral Movement RDP\nseverity: high\ndataTypes:\n  - windows\ndefinition: |\n  cel_expr_here";

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

        // Inject the temp directory as RuleGenOutputDir via reflection
        Field outputDirField = HaRuleGenerationService.class.getDeclaredField("outputDir");
        outputDirField.setAccessible(true);
        outputDirField.set(service, tempDir.toString());
    }

    /**
     * Given a pending_review session,
     * when rejectSession is invoked,
     * then the returned DTO has status "rejected" and no files exist in RuleGenOutputDir.
     */
    @Test
    @DisplayName("rejectSession returns rejected status and writes no file to RuleGenOutputDir")
    void rejectSession_setsRejectedStatusAndWritesNoFile() throws Exception {
        // Given: a pending_review session exists
        HaRuleGenSession session = HaRuleGenSession.builder()
            .id(600L)
            .status(HaRuleGenSession.SessionStatus.pending_review)
            .ruleName(KNOWN_RULE_NAME)
            .ruleYaml(KNOWN_RULE_YAML)
            .signalKey("windows")
            .requestedBy("admin")
            .createdAt(FIXED_NOW)
            .updatedAt(FIXED_NOW)
            .build();

        when(sessionRepo.findById(600L)).thenReturn(Optional.of(session));
        when(sessionRepo.save(any(HaRuleGenSession.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        // When: reject the session
        RuleGenSessionDTO result = service.rejectSession(600L);

        // Then: status is "rejected"
        assertThat(result.status())
            .as("The session status should be 'rejected' after rejectSession")
            .isEqualTo("rejected");

        // Then: no files exist in the temp output directory
        assertThat(tempDir)
            .as("RuleGenOutputDir should remain empty — reject never writes")
            .isEmptyDirectory();

        // Then: approvedPath should be null (no file was written)
        assertThat(result.approvedPath())
            .as("approvedPath should be null since no file was written")
            .isNull();
    }

    /**
     * Verifies that rejecting a session with a rule name that would create an
     * unsafe filename still writes nothing — the filename-safe transformation
     * is never even needed because reject does not write.
     */
    @Test
    @DisplayName("rejectSession with path-unsafe rule name still writes no file")
    void rejectSession_unsafeRuleName_stillWritesNoFile() throws Exception {
        // Given: a session whose rule name contains path-traversal characters
        String unsafeRuleName = "../../etc/shadow/Malicious Rule";
        String yamlContent = "name: Malicious Rule\nseverity: critical\ndataTypes:\n  - generic\ndefinition: cel";

        HaRuleGenSession session = HaRuleGenSession.builder()
            .id(601L)
            .status(HaRuleGenSession.SessionStatus.pending_review)
            .ruleName(unsafeRuleName)
            .ruleYaml(yamlContent)
            .signalKey("generic")
            .requestedBy("admin")
            .createdAt(FIXED_NOW)
            .updatedAt(FIXED_NOW)
            .build();

        when(sessionRepo.findById(601L)).thenReturn(Optional.of(session));
        when(sessionRepo.save(any(HaRuleGenSession.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        // When: reject the session
        RuleGenSessionDTO result = service.rejectSession(601L);

        // Then: status is "rejected"
        assertThat(result.status()).isEqualTo("rejected");

        // Then: no file exists anywhere in the temp directory tree
        try (Stream<Path> walk = Files.walk(tempDir)) {
            long fileCount = walk.filter(Files::isRegularFile).count();
            assertThat(fileCount)
                .as("No files should exist in RuleGenOutputDir after reject")
                .isZero();
        }
    }

    /**
     * Verifies that rejecting multiple sessions still leaves the output directory empty.
     */
    @Test
    @DisplayName("rejectSession called multiple times leaves RuleGenOutputDir empty")
    void rejectSession_multipleRejects_directoryStaysEmpty() throws Exception {
        // Given: two pending_review sessions
        HaRuleGenSession session1 = HaRuleGenSession.builder()
            .id(602L)
            .status(HaRuleGenSession.SessionStatus.pending_review)
            .ruleName("Rule Alpha")
            .ruleYaml("name: Rule Alpha\nseverity: medium\ndataTypes:\n  - syslog\ndefinition: x")
            .signalKey("syslog")
            .requestedBy("admin")
            .createdAt(FIXED_NOW)
            .updatedAt(FIXED_NOW)
            .build();

        HaRuleGenSession session2 = HaRuleGenSession.builder()
            .id(603L)
            .status(HaRuleGenSession.SessionStatus.pending_review)
            .ruleName("Rule Beta")
            .ruleYaml("name: Rule Beta\nseverity: low\ndataTypes:\n  - firewall\ndefinition: y")
            .signalKey("firewall")
            .requestedBy("admin")
            .createdAt(FIXED_NOW)
            .updatedAt(FIXED_NOW)
            .build();

        when(sessionRepo.findById(602L)).thenReturn(Optional.of(session1));
        when(sessionRepo.findById(603L)).thenReturn(Optional.of(session2));
        when(sessionRepo.save(any(HaRuleGenSession.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        // When: reject both sessions
        RuleGenSessionDTO result1 = service.rejectSession(602L);
        RuleGenSessionDTO result2 = service.rejectSession(603L);

        // Then: both are rejected
        assertThat(result1.status()).isEqualTo("rejected");
        assertThat(result2.status()).isEqualTo("rejected");

        // Then: directory is still empty
        assertThat(tempDir)
            .as("RuleGenOutputDir should remain empty after multiple rejections")
            .isEmptyDirectory();
    }
}
