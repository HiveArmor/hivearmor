package com.hivearmor.service.rulegen;

import com.hivearmor.ai.HaLlmService;
import com.hivearmor.repository.rulegen.HaAlertSignalRepository;
import com.hivearmor.repository.rulegen.HaRuleGenSessionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

/**
 * Unit tests for {@link HaRuleGenerationService#safeFilename(String)} and
 * {@link HaRuleGenerationService#writeApprovedYaml(String, String)}.
 *
 * <p>Validates Requirements 3.6, 3.8, 3.9.
 */
class HaRuleGenerationServiceFileTest {

    @TempDir
    Path tempDir;

    private HaRuleGenerationService service;

    @BeforeEach
    void setUp() throws Exception {
        Clock clock = Clock.fixed(Instant.parse("2025-01-15T10:00:00Z"), ZoneId.of("UTC"));
        service = new HaRuleGenerationService(
            mock(HaAlertSignalRepository.class),
            mock(HaRuleGenSessionRepository.class),
            mock(HaLlmService.class),
            clock
        );
        // Inject the outputDir via reflection since @Value won't fire in a unit test
        Field outputDirField = HaRuleGenerationService.class.getDeclaredField("outputDir");
        outputDirField.setAccessible(true);
        outputDirField.set(service, tempDir.toString());
    }

    // ---- safeFilename tests ----

    @Test
    void safeFilename_nullInput_returnsDefault() {
        assertThat(HaRuleGenerationService.safeFilename(null)).isEqualTo("rule");
    }

    @Test
    void safeFilename_emptyInput_returnsDefault() {
        assertThat(HaRuleGenerationService.safeFilename("")).isEqualTo("rule");
    }

    @Test
    void safeFilename_blankInput_returnsDefault() {
        assertThat(HaRuleGenerationService.safeFilename("   ")).isEqualTo("rule");
    }

    @Test
    void safeFilename_normalName_preservesContent() {
        assertThat(HaRuleGenerationService.safeFilename("Brute_Force_Login"))
            .isEqualTo("Brute_Force_Login");
    }

    @Test
    void safeFilename_spacesCollapsedToUnderscore() {
        assertThat(HaRuleGenerationService.safeFilename("brute force login"))
            .isEqualTo("brute_force_login");
    }

    @Test
    void safeFilename_pathSeparatorsStripped() {
        assertThat(HaRuleGenerationService.safeFilename("../../etc/passwd"))
            .isEqualTo("etc_passwd");
    }

    @Test
    void safeFilename_backslashesStripped() {
        assertThat(HaRuleGenerationService.safeFilename("..\\..\\windows\\system32"))
            .isEqualTo("windows_system32");
    }

    @Test
    void safeFilename_controlCharsStripped() {
        assertThat(HaRuleGenerationService.safeFilename("rule\u0000name\u0007test"))
            .isEqualTo("rule_name_test");
    }

    @Test
    void safeFilename_dotDotTraversalRemoved() {
        assertThat(HaRuleGenerationService.safeFilename("..rule..name.."))
            .isEqualTo("rule_name_");
    }

    @Test
    void safeFilename_reservedCharsStripped() {
        assertThat(HaRuleGenerationService.safeFilename("rule:name*test?<>|\""))
            .isEqualTo("rule_name_test_____");
    }

    @Test
    void safeFilename_leadingDotsAndHyphensRemoved() {
        assertThat(HaRuleGenerationService.safeFilename("---...___rule"))
            .isEqualTo("rule");
    }

    @Test
    void safeFilename_clipsTo128Characters() {
        String longName = "a".repeat(200);
        String result = HaRuleGenerationService.safeFilename(longName);
        assertThat(result).hasSize(128);
        assertThat(result).isEqualTo("a".repeat(128));
    }

    @Test
    void safeFilename_onlyPathSeparators_returnsDefault() {
        assertThat(HaRuleGenerationService.safeFilename("///\\\\")).isEqualTo("rule");
    }

    // ---- writeApprovedYaml tests ----

    @Test
    void writeApprovedYaml_writesFileToOutputDir() {
        String filename = "brute_force.yaml";
        String yaml = "name: brute_force\nseverity: high\n";

        String resultPath = service.writeApprovedYaml(filename, yaml);

        Path expected = tempDir.resolve(filename);
        assertThat(expected).exists();
        assertThat(expected).hasContent(yaml);
        assertThat(resultPath).isEqualTo(expected.toAbsolutePath().normalize().toString());
    }

    @Test
    void writeApprovedYaml_createsOutputDirIfNotExists() throws Exception {
        // Point outputDir to a non-existent subdirectory
        Path subDir = tempDir.resolve("nested/output");
        Field outputDirField = HaRuleGenerationService.class.getDeclaredField("outputDir");
        outputDirField.setAccessible(true);
        outputDirField.set(service, subDir.toString());

        String filename = "test_rule.yaml";
        String yaml = "name: test\n";

        service.writeApprovedYaml(filename, yaml);

        assertThat(subDir.resolve(filename)).exists();
        assertThat(subDir.resolve(filename)).hasContent(yaml);
    }

    @Test
    void writeApprovedYaml_overwritesExistingFile() throws IOException {
        String filename = "existing.yaml";
        Files.writeString(tempDir.resolve(filename), "old content");

        String newYaml = "name: updated\nseverity: critical\n";
        service.writeApprovedYaml(filename, newYaml);

        assertThat(tempDir.resolve(filename)).hasContent(newYaml);
    }

    @Test
    void writeApprovedYaml_rejectsPathTraversal() {
        String filename = "../escape.yaml";

        assertThatThrownBy(() -> service.writeApprovedYaml(filename, "content"))
            .isInstanceOf(RuntimeException.class)
            .hasMessageContaining("escapes RuleGenOutputDir");
    }

    @Test
    void writeApprovedYaml_ioFailureThrowsRuntimeException() throws Exception {
        // Point outputDir to a path that cannot be written (a file, not a directory)
        Path blockingFile = tempDir.resolve("not_a_dir");
        Files.writeString(blockingFile, "blocking");

        Field outputDirField = HaRuleGenerationService.class.getDeclaredField("outputDir");
        outputDirField.setAccessible(true);
        outputDirField.set(service, blockingFile.resolve("subdir").toString());

        assertThatThrownBy(() -> service.writeApprovedYaml("test.yaml", "content"))
            .isInstanceOf(RuntimeException.class);
    }
}
