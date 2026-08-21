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

import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * Verification Check 5: Approve writes YAML and removes row from queue.
 *
 * <p>This test exercises the backend portion of Check 5: invoking
 * {@link HaRuleGenerationService#approveSession(Long)} against a temporary
 * {@code RuleGenOutputDir} and verifying that a {@code .yaml} file appears
 * with the sanitized filename and expected content.
 *
 * <p>The frontend portion (approved row disappears from the pending queue) is
 * already covered by Test 2 in {@code RuleGenerationPage.test.tsx} — see
 * {@code "clicking Approve calls approveSession, removes the row from queue, and closes drawer"}.
 *
 * <p><strong>Validates: Requirement 7.5</strong>
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Verification Check 5: approveSession writes YAML to RuleGenOutputDir")
class VerificationCheck5Test {

    private static final Instant FIXED_NOW = Instant.parse("2026-07-25T14:00:00Z");
    private static final String KNOWN_RULE_NAME = "Brute Force SSH Login";
    private static final String KNOWN_RULE_YAML =
        "name: Brute Force SSH Login\nseverity: high\ndataTypes:\n  - syslog\ndefinition: |\n  cel_expr_here";

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
     * Given a pending_review session with known rule YAML,
     * when approveSession is invoked,
     * then a .yaml file is written to the temp RuleGenOutputDir with the
     * expected sanitized filename and the file content matches the session's YAML.
     */
    @Test
    @DisplayName("approveSession writes .yaml file with sanitized filename and correct content")
    void approveSession_writesSanitizedYamlFile() throws Exception {
        // Given: a pending_review session exists with known rule name and YAML
        HaRuleGenSession session = HaRuleGenSession.builder()
            .id(500L)
            .status(HaRuleGenSession.SessionStatus.pending_review)
            .ruleName(KNOWN_RULE_NAME)
            .ruleYaml(KNOWN_RULE_YAML)
            .signalKey("syslog")
            .requestedBy("admin")
            .createdAt(FIXED_NOW)
            .updatedAt(FIXED_NOW)
            .build();

        when(sessionRepo.findById(500L)).thenReturn(Optional.of(session));
        when(sessionRepo.save(any(HaRuleGenSession.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        // When: approve the session
        RuleGenSessionDTO result = service.approveSession(500L);

        // Then: status transitions to approved
        assertThat(result.status()).isEqualTo("approved");

        // The expected sanitized filename: "Brute Force SSH Login" → "Brute_Force_SSH_Login.yaml"
        String expectedFilename = "Brute_Force_SSH_Login.yaml";
        Path expectedFile = tempDir.resolve(expectedFilename);

        // Assert: .yaml file exists in the temp output directory
        assertThat(expectedFile)
            .as("A .yaml file with the sanitized name should exist in RuleGenOutputDir")
            .exists()
            .isRegularFile();

        // Assert: file content matches the session's YAML
        String fileContent = Files.readString(expectedFile);
        assertThat(fileContent)
            .as("File content should match the session's rule YAML verbatim")
            .isEqualTo(KNOWN_RULE_YAML);

        // Assert: the approved path stored in the session points to the written file
        assertThat(result.approvedPath())
            .as("The approved path in the DTO should reference the written file")
            .isNotNull()
            .endsWith(expectedFilename);
    }

    /**
     * Verifies that a rule name containing path-unsafe characters is sanitized
     * before writing the file, and the resulting file still has the correct YAML content.
     */
    @Test
    @DisplayName("approveSession sanitizes rule names with special characters")
    void approveSession_sanitizesSpecialCharacters() throws Exception {
        // Given: a session whose rule name contains slashes, dots, and control chars
        String unsafeRuleName = "../../etc/passwd/Evil Rule";
        String yamlContent = "name: Evil Rule\nseverity: critical\ndataTypes:\n  - generic\ndefinition: cel";

        HaRuleGenSession session = HaRuleGenSession.builder()
            .id(501L)
            .status(HaRuleGenSession.SessionStatus.pending_review)
            .ruleName(unsafeRuleName)
            .ruleYaml(yamlContent)
            .signalKey("generic")
            .requestedBy("admin")
            .createdAt(FIXED_NOW)
            .updatedAt(FIXED_NOW)
            .build();

        when(sessionRepo.findById(501L)).thenReturn(Optional.of(session));
        when(sessionRepo.save(any(HaRuleGenSession.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        // When
        RuleGenSessionDTO result = service.approveSession(501L);

        // Then: status is approved
        assertThat(result.status()).isEqualTo("approved");

        // The file should be written INSIDE the temp dir (not escaping to /etc/passwd)
        Path outputBase = tempDir.toAbsolutePath().normalize();
        Path writtenFile = Path.of(result.approvedPath()).toAbsolutePath().normalize();

        assertThat(writtenFile.startsWith(outputBase))
            .as("The written file must reside inside RuleGenOutputDir (no path traversal)")
            .isTrue();

        // File should exist and contain the expected YAML
        assertThat(writtenFile).exists().isRegularFile();
        assertThat(Files.readString(writtenFile)).isEqualTo(yamlContent);

        // Filename must end with .yaml and contain no path separators
        String filename = writtenFile.getFileName().toString();
        assertThat(filename).endsWith(".yaml");
        assertThat(filename).doesNotContain("/").doesNotContain("\\").doesNotContain("..");
    }

    /**
     * Verifies that the output directory is created if it doesn't exist.
     */
    @Test
    @DisplayName("approveSession creates output directory if it doesn't exist")
    void approveSession_createsOutputDirectoryIfAbsent() throws Exception {
        // Given: point outputDir to a non-existing subdirectory inside tempDir
        Path nestedDir = tempDir.resolve("nested").resolve("rules");
        Field outputDirField = HaRuleGenerationService.class.getDeclaredField("outputDir");
        outputDirField.setAccessible(true);
        outputDirField.set(service, nestedDir.toString());

        assertThat(nestedDir).doesNotExist();

        HaRuleGenSession session = HaRuleGenSession.builder()
            .id(502L)
            .status(HaRuleGenSession.SessionStatus.pending_review)
            .ruleName("Simple Rule")
            .ruleYaml("name: Simple Rule\nseverity: low\ndataTypes:\n  - generic\ndefinition: x")
            .signalKey("generic")
            .requestedBy("admin")
            .createdAt(FIXED_NOW)
            .updatedAt(FIXED_NOW)
            .build();

        when(sessionRepo.findById(502L)).thenReturn(Optional.of(session));
        when(sessionRepo.save(any(HaRuleGenSession.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        // When
        RuleGenSessionDTO result = service.approveSession(502L);

        // Then: directory was created and file exists
        assertThat(result.status()).isEqualTo("approved");
        assertThat(nestedDir).exists().isDirectory();

        Path expectedFile = nestedDir.resolve("Simple_Rule.yaml");
        assertThat(expectedFile).exists().isRegularFile();
        assertThat(Files.readString(expectedFile))
            .isEqualTo("name: Simple Rule\nseverity: low\ndataTypes:\n  - generic\ndefinition: x");
    }
}
