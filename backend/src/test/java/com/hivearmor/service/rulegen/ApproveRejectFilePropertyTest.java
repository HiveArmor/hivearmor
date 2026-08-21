package com.hivearmor.service.rulegen;

import com.hivearmor.ai.HaLlmService;
import com.hivearmor.domain.rulegen.HaRuleGenSession;
import com.hivearmor.repository.rulegen.HaAlertSignalRepository;
import com.hivearmor.repository.rulegen.HaRuleGenSessionRepository;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;

import java.io.IOException;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Property-based test for the approve / reject file invariant.
 *
 * <p><strong>Property 6: Approve writes iff approved; reject writes nothing</strong><br>
 * After {@code approveSession(id)} returns successfully, exactly one {@code .yaml}
 * file exists in {@code RuleGenOutputDir} for that session's rule name. After
 * {@code rejectSession(id)} returns, no file has been written for that session.
 *
 * <p><strong>Validates: Requirements 3.5, 3.7, 3.8</strong>
 */
@Label("Feature: sprint-28-ueba-signals, Property 6: Approve writes iff approved; reject writes nothing")
class ApproveRejectFilePropertyTest {

    private static final Clock FIXED_CLOCK =
        Clock.fixed(Instant.parse("2026-07-25T10:00:00Z"), ZoneOffset.UTC);

    private static final String VALID_YAML_TEMPLATE =
        "name: %s\nseverity: high\ndataTypes:\n  - linux\ndefinition: cel_expr\n";

    private HaRuleGenSessionRepository sessionRepo;
    private HaRuleGenerationService service;
    private Path tempDir;

    @BeforeTry
    void setUp() throws Exception {
        // Create a fresh temp directory for each trial
        tempDir = Files.createTempDirectory("approve-reject-pbt-");
        tempDir.toFile().deleteOnExit();

        sessionRepo = mock(HaRuleGenSessionRepository.class);

        service = new HaRuleGenerationService(
            mock(HaAlertSignalRepository.class),
            sessionRepo,
            mock(HaLlmService.class),
            FIXED_CLOCK
        );

        // Inject the outputDir via reflection since @Value won't fire in a unit test
        Field outputDirField = HaRuleGenerationService.class.getDeclaredField("outputDir");
        outputDirField.setAccessible(true);
        outputDirField.set(service, tempDir.toString());
    }

    /**
     * <strong>Property 6a: After approveSession(id) returns successfully, exactly one
     * .yaml file exists in RuleGenOutputDir for that session's rule name.</strong>
     *
     * <p>For any valid rule name, approving a pending_review session writes exactly
     * one file with the sanitized name into the output directory.
     *
     * <p><strong>Validates: Requirements 3.5, 3.8</strong>
     */
    @Property(tries = 100)
    @Label("Property 6a: approveSession writes exactly one .yaml file")
    void approveSessionWritesExactlyOneYamlFile(
            @ForAll("ruleNames") String ruleName) throws Exception {

        Long sessionId = 1L;
        String yaml = String.format(VALID_YAML_TEMPLATE, ruleName);

        HaRuleGenSession session = HaRuleGenSession.builder()
            .id(sessionId)
            .status(HaRuleGenSession.SessionStatus.pending_review)
            .ruleName(ruleName)
            .ruleYaml(yaml)
            .signalKey("test-signal-key")
            .createdAt(Instant.now())
            .updatedAt(Instant.now())
            .build();

        when(sessionRepo.findById(eq(sessionId))).thenReturn(Optional.of(session));
        when(sessionRepo.save(session)).thenReturn(session);

        // Act
        service.approveSession(sessionId);

        // Assert: exactly one .yaml file exists in the output directory
        try (Stream<Path> files = Files.list(tempDir)) {
            long yamlFileCount = files
                .filter(p -> p.toString().endsWith(".yaml"))
                .count();
            assertThat(yamlFileCount)
                .as("Exactly one .yaml file should exist in RuleGenOutputDir after approve " +
                    "(ruleName=%s)", ruleName)
                .isEqualTo(1L);
        }

        // Assert: the file name matches the sanitized rule name
        String expectedFilename = HaRuleGenerationService.safeFilename(ruleName) + ".yaml";
        Path expectedFile = tempDir.resolve(expectedFilename);
        assertThat(expectedFile)
            .as("The written file should have the sanitized name derived from ruleName=%s",
                ruleName)
            .exists();

        // Assert: the file content matches the session's YAML
        assertThat(Files.readString(expectedFile))
            .as("File content should match session's ruleYaml")
            .isEqualTo(yaml);

        // Cleanup for next trial
        Files.deleteIfExists(expectedFile);
    }

    /**
     * <strong>Property 6b: After rejectSession(id) returns, no file has been written
     * for that session — the output directory remains empty.</strong>
     *
     * <p>For any valid rule name, rejecting a pending_review session does not write
     * any file to the output directory.
     *
     * <p><strong>Validates: Requirements 3.7</strong>
     */
    @Property(tries = 100)
    @Label("Property 6b: rejectSession writes nothing to RuleGenOutputDir")
    void rejectSessionWritesNoFile(
            @ForAll("ruleNames") String ruleName) throws IOException {

        Long sessionId = 2L;
        String yaml = String.format(VALID_YAML_TEMPLATE, ruleName);

        HaRuleGenSession session = HaRuleGenSession.builder()
            .id(sessionId)
            .status(HaRuleGenSession.SessionStatus.pending_review)
            .ruleName(ruleName)
            .ruleYaml(yaml)
            .signalKey("test-signal-key")
            .createdAt(Instant.now())
            .updatedAt(Instant.now())
            .build();

        when(sessionRepo.findById(eq(sessionId))).thenReturn(Optional.of(session));
        when(sessionRepo.save(session)).thenReturn(session);

        // Act
        service.rejectSession(sessionId);

        // Assert: no files exist in the output directory
        try (Stream<Path> files = Files.list(tempDir)) {
            long fileCount = files.count();
            assertThat(fileCount)
                .as("No files should exist in RuleGenOutputDir after reject (ruleName=%s)",
                    ruleName)
                .isEqualTo(0L);
        }
    }

    // =========================================================================
    // Arbitrary providers
    // =========================================================================

    /**
     * Generates arbitrary rule names that exercise the filename sanitization logic.
     * Includes alphanumeric names, names with spaces, names with special characters,
     * and edge cases like path traversal attempts.
     */
    @Provide
    Arbitrary<String> ruleNames() {
        Arbitrary<String> alphanumeric = Arbitraries.strings()
            .withCharRange('a', 'z')
            .withCharRange('A', 'Z')
            .withCharRange('0', '9')
            .withChars(' ', '_', '-')
            .ofMinLength(1)
            .ofMaxLength(80);

        Arbitrary<String> withSpecialChars = Arbitraries.strings()
            .withCharRange('a', 'z')
            .withChars('/', '\\', ':', '*', '?', '"', '<', '>', '|', '.', ' ')
            .ofMinLength(1)
            .ofMaxLength(60);

        Arbitrary<String> edgeCases = Arbitraries.of(
            "Simple Rule",
            "Brute Force SSH Login",
            "rule with   multiple   spaces",
            "UPPER_CASE_RULE",
            "rule/with/slashes",
            "rule\\with\\backslashes",
            "../../etc/passwd",
            "..\\..\\windows\\system32",
            "rule:name*test?<>|",
            "...leading_dots",
            "---leading-hyphens",
            "___leading_underscores",
            "a".repeat(200),
            "rule\u0000with\u0007control\u001Bchars"
        );

        return Arbitraries.frequencyOf(
            Tuple.of(5, alphanumeric),
            Tuple.of(3, withSpecialChars),
            Tuple.of(2, edgeCases)
        );
    }
}
