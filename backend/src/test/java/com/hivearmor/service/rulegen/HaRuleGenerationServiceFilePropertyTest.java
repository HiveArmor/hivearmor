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
import java.util.Comparator;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Property-based test for the approve / reject file invariant.
 *
 * <p><strong>Property 6: Approve writes iff approved; reject writes nothing</strong>
 * After {@code approveSession(id)} returns successfully, exactly one {@code .yaml}
 * file exists in {@code RuleGenOutputDir} for that session's rule name.
 * After {@code rejectSession(id)} returns, no file has been written for that session.
 *
 * <p><strong>Validates: Requirements 3.5, 3.7, 3.8</strong>
 */
@Label("Feature: sprint-28-ueba-signals, Property 6: Approve writes iff approved; reject writes nothing")
class HaRuleGenerationServiceFilePropertyTest {

    private static final Clock FIXED_CLOCK =
        Clock.fixed(Instant.parse("2026-07-25T10:00:00Z"), ZoneOffset.UTC);

    private static final String VALID_YAML_TEMPLATE =
        "name: \"%s\"\nseverity: high\ndataTypes:\n  - linux\ndefinition:\n  condition: \"true\"\n";

    private static final AtomicLong ID_COUNTER = new AtomicLong(0);

    private HaRuleGenSessionRepository sessionRepo;
    private HaRuleGenerationService service;
    private Path tempDir;

    @BeforeTry
    void setUp() throws Exception {
        tempDir = Files.createTempDirectory("prop6-file-invariant-");

        sessionRepo = mock(HaRuleGenSessionRepository.class);
        when(sessionRepo.save(any(HaRuleGenSession.class)))
            .thenAnswer(inv -> inv.getArgument(0));

        service = new HaRuleGenerationService(
            mock(HaAlertSignalRepository.class),
            sessionRepo,
            mock(HaLlmService.class),
            FIXED_CLOCK
        );

        Field outputDirField = HaRuleGenerationService.class.getDeclaredField("outputDir");
        outputDirField.setAccessible(true);
        outputDirField.set(service, tempDir.toString());
    }

    // =========================================================================
    // Property 6-A: approveSession writes exactly one .yaml file
    // =========================================================================

    /**
     * <strong>Property 6-A: After approveSession(id) returns successfully, exactly one
     * .yaml file exists in RuleGenOutputDir for that session's rule name.</strong>
     *
     * <p>For any rule name (including adversarial ones with path separators, control
     * chars, etc.), approving a pending_review session writes exactly one file
     * with the sanitized filename into the output directory.
     *
     * <p><strong>Validates: Requirements 3.5, 3.8</strong>
     */
    @Property(tries = 150)
    @Label("Property 6-A: approveSession writes exactly one .yaml file")
    void approveSessionWritesExactlyOneYamlFile(
            @ForAll("ruleNames") String ruleName) throws Exception {

        Long sessionId = ID_COUNTER.incrementAndGet();
        String yaml = String.format(VALID_YAML_TEMPLATE, escapeYaml(ruleName));

        HaRuleGenSession session = HaRuleGenSession.builder()
            .id(sessionId)
            .status(HaRuleGenSession.SessionStatus.pending_review)
            .ruleName(ruleName)
            .ruleYaml(yaml)
            .signalKey("test-signal-key")
            .createdAt(FIXED_CLOCK.instant())
            .updatedAt(FIXED_CLOCK.instant())
            .build();

        when(sessionRepo.findById(eq(sessionId))).thenReturn(Optional.of(session));

        // Act
        service.approveSession(sessionId);

        // Assert: exactly one .yaml file exists in the output directory
        try (Stream<Path> files = Files.list(tempDir)) {
            long yamlFileCount = files
                .filter(p -> p.toString().endsWith(".yaml"))
                .count();
            assertThat(yamlFileCount)
                .as("Exactly one .yaml file should exist in RuleGenOutputDir after approve " +
                    "(ruleName='%s')", ruleName)
                .isEqualTo(1L);
        }

        // Assert: the file content matches the session's YAML
        String expectedFilename = HaRuleGenerationService.safeFilename(ruleName) + ".yaml";
        Path expectedFile = tempDir.resolve(expectedFilename);
        assertThat(expectedFile)
            .as("File with sanitized name should exist for ruleName='%s'", ruleName)
            .exists();
        assertThat(Files.readString(expectedFile))
            .as("File content should match the session's ruleYaml")
            .isEqualTo(yaml);

        // Cleanup temp dir contents for isolation between trials
        cleanTempDir();
    }

    // =========================================================================
    // Property 6-B: rejectSession writes nothing
    // =========================================================================

    /**
     * <strong>Property 6-B: After rejectSession(id) returns, the output directory is
     * still empty -- no file has been written for that session.</strong>
     *
     * <p>For any rule name (including adversarial ones), rejecting a pending_review
     * session does not write any file to the output directory.
     *
     * <p><strong>Validates: Requirements 3.7</strong>
     */
    @Property(tries = 150)
    @Label("Property 6-B: rejectSession writes nothing to RuleGenOutputDir")
    void rejectSessionWritesNoFile(
            @ForAll("ruleNames") String ruleName) throws IOException {

        Long sessionId = ID_COUNTER.incrementAndGet();
        String yaml = String.format(VALID_YAML_TEMPLATE, escapeYaml(ruleName));

        HaRuleGenSession session = HaRuleGenSession.builder()
            .id(sessionId)
            .status(HaRuleGenSession.SessionStatus.pending_review)
            .ruleName(ruleName)
            .ruleYaml(yaml)
            .signalKey("test-signal-key")
            .createdAt(FIXED_CLOCK.instant())
            .updatedAt(FIXED_CLOCK.instant())
            .build();

        when(sessionRepo.findById(eq(sessionId))).thenReturn(Optional.of(session));

        // Act
        service.rejectSession(sessionId);

        // Assert: no files exist in the output directory
        try (Stream<Path> files = Files.list(tempDir)) {
            long fileCount = files.count();
            assertThat(fileCount)
                .as("No files should exist in RuleGenOutputDir after reject (ruleName='%s')",
                    ruleName)
                .isEqualTo(0L);
        }
    }

    // =========================================================================
    // Property 6-C: Approved file content matches session YAML
    // =========================================================================

    /**
     * <strong>Property 6-C: The content of the written file matches the session's
     * stored YAML exactly.</strong>
     *
     * <p><strong>Validates: Requirements 3.5, 3.8</strong>
     */
    @Property(tries = 100)
    @Label("Property 6-C: approved file content matches session YAML exactly")
    void approvedFileContentMatchesSessionYaml(
            @ForAll("ruleNames") String ruleName) throws Exception {

        Long sessionId = ID_COUNTER.incrementAndGet();
        String yaml = String.format(VALID_YAML_TEMPLATE, escapeYaml(ruleName));

        HaRuleGenSession session = HaRuleGenSession.builder()
            .id(sessionId)
            .status(HaRuleGenSession.SessionStatus.pending_review)
            .ruleName(ruleName)
            .ruleYaml(yaml)
            .signalKey("signal-key")
            .createdAt(FIXED_CLOCK.instant())
            .updatedAt(FIXED_CLOCK.instant())
            .build();

        when(sessionRepo.findById(eq(sessionId))).thenReturn(Optional.of(session));

        // Act
        service.approveSession(sessionId);

        // Assert: file content is byte-for-byte the same as the session's YAML
        String expectedFilename = HaRuleGenerationService.safeFilename(ruleName) + ".yaml";
        Path writtenFile = tempDir.resolve(expectedFilename);
        assertThat(writtenFile).exists();

        String writtenContent = Files.readString(writtenFile);
        assertThat(writtenContent)
            .as("Written file content must match session ruleYaml for ruleName='%s'", ruleName)
            .isEqualTo(yaml);

        cleanTempDir();
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private static String escapeYaml(String name) {
        if (name == null) return "null_rule";
        return name.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private void cleanTempDir() throws IOException {
        try (Stream<Path> walk = Files.walk(tempDir)) {
            walk.sorted(Comparator.reverseOrder())
                .filter(p -> !p.equals(tempDir))
                .forEach(p -> {
                    try { Files.deleteIfExists(p); } catch (IOException ignored) {}
                });
        }
    }

    // =========================================================================
    // Generators
    // =========================================================================

    /**
     * Generates arbitrary rule names including adversarial ones to exercise
     * filename sanitization.
     */
    @Provide
    Arbitrary<String> ruleNames() {
        Arbitrary<String> normal = Arbitraries.strings()
            .withCharRange('a', 'z')
            .withCharRange('A', 'Z')
            .withCharRange('0', '9')
            .withChars('_', '-', ' ')
            .ofMinLength(1)
            .ofMaxLength(200)
            .map(s -> s);

        Arbitrary<String> traversal = Arbitraries.of(
            "../../etc/passwd",
            "..\\..\\windows\\system32",
            "../../../root/.ssh/id_rsa",
            "....//....//etc//shadow",
            "/etc/passwd",
            "\\\\server\\share\\file",
            "..\\..\\..\\..\\boot.ini",
            "foo/../bar/../../../etc/passwd",
            "..",
            "../",
            "..\\",
            "./.",
            "....",
            "..rule..name..",
            "rule/../../escape",
            "rule\\..\\..\\escape"
        );

        Arbitrary<String> controlChars = Arbitraries.of(
            "rule\u0000name",
            "\u0007\u0008\u001B",
            "rule\nnewline",
            "rule\ttab",
            "\u0000\u0001\u0002\u0003",
            "rule\r\nwindows",
            "\u007F\u0080\u009F"
        );

        Arbitrary<String> emptyWhitespace = Arbitraries.of(
            "",
            "   ",
            "\t\t",
            "\n\n",
            "   \t \n  "
        );

        Arbitrary<String> longStrings = Arbitraries.strings()
            .withCharRange('a', 'z')
            .withCharRange('A', 'Z')
            .withChars('_', '-', '/', '\\', '.', '*', '?', '<', '>')
            .ofMinLength(129)
            .ofMaxLength(500)
            .map(s -> s);

        Arbitrary<String> reserved = Arbitraries.of(
            "rule:name*test?<>|\"",
            "CON",
            "PRN",
            "NUL",
            "COM1",
            "AUX.txt",
            "file<name>.yaml",
            "pipe|command"
        );

        Arbitrary<String> unicode = Arbitraries.strings()
            .all()
            .ofMinLength(1)
            .ofMaxLength(100)
            .map(s -> s);

        Arbitrary<String> onlySeparators = Arbitraries.of(
            "///",
            "\\\\\\",
            "/\\/\\",
            "///\\\\\\///",
            "../.../...",
            "...\\...\\..."
        );

        return Arbitraries.frequencyOf(
            Tuple.of(4, normal),
            Tuple.of(3, traversal),
            Tuple.of(2, controlChars),
            Tuple.of(1, emptyWhitespace),
            Tuple.of(2, longStrings),
            Tuple.of(2, reserved),
            Tuple.of(2, unicode),
            Tuple.of(1, onlySeparators)
        );
    }
}
