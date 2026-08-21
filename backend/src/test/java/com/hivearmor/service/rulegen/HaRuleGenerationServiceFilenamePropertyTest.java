package com.hivearmor.service.rulegen;

import net.jqwik.api.*;

import java.nio.file.InvalidPathException;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Property 5: Approved filenames are path-safe.
 *
 * <p>For every rule name {@code s}, {@link HaRuleGenerationService#safeFilename(String)}
 * produces a filename with no {@code /}, no {@code \}, no {@code ..} segments,
 * and when appended with {@code .yaml} resolves inside {@code RuleGenOutputDir}
 * when combined with a base directory.
 *
 * <p><strong>Validates: Requirements 3.6</strong>
 */
@Label("Feature: sprint-28-ueba-signals, Property 5: Approved filenames are path-safe")
class HaRuleGenerationServiceFilenamePropertyTest {

    /** A synthetic output directory used for path-containment checks. */
    private static final Path OUTPUT_DIR = Path.of("/opt/hivearmor/rules").toAbsolutePath().normalize();

    // =========================================================================
    // Property 5: Filename-safe transformation
    // =========================================================================

    /**
     * <strong>Property 5.1: Result does NOT contain forward slash.</strong>
     *
     * <p><strong>Validates: Requirements 3.6</strong>
     */
    @Property(tries = 500)
    @Label("5.1: safeFilename result never contains '/'")
    void noForwardSlash(@ForAll("adversarialRuleNames") String rawName) {
        String result = HaRuleGenerationService.safeFilename(rawName);
        assertThat(result).doesNotContain("/");
    }

    /**
     * <strong>Property 5.2: Result does NOT contain backslash.</strong>
     *
     * <p><strong>Validates: Requirements 3.6</strong>
     */
    @Property(tries = 500)
    @Label("5.2: safeFilename result never contains '\\'")
    void noBackslash(@ForAll("adversarialRuleNames") String rawName) {
        String result = HaRuleGenerationService.safeFilename(rawName);
        assertThat(result).doesNotContain("\\");
    }

    /**
     * <strong>Property 5.3: Result does NOT contain ".." (dot-dot traversal segment).</strong>
     *
     * <p><strong>Validates: Requirements 3.6</strong>
     */
    @Property(tries = 500)
    @Label("5.3: safeFilename result never contains '..'")
    void noDotDotTraversal(@ForAll("adversarialRuleNames") String rawName) {
        String result = HaRuleGenerationService.safeFilename(rawName);
        assertThat(result).doesNotContain("..");
    }

    /**
     * <strong>Property 5.4: When resolved with {@code Path.of(outputDir, result + ".yaml")},
     * the normalized path starts with the output directory.</strong>
     *
     * <p><strong>Validates: Requirements 3.6</strong>
     */
    @Property(tries = 500)
    @Label("5.4: resolved path stays inside RuleGenOutputDir")
    void pathContainment(@ForAll("adversarialRuleNames") String rawName) {
        String filename = HaRuleGenerationService.safeFilename(rawName) + ".yaml";
        Path resolved;
        try {
            resolved = Path.of(OUTPUT_DIR.toString(), filename).toAbsolutePath().normalize();
        } catch (InvalidPathException e) {
            // If the OS cannot even construct the path (e.g. unmappable chars on macOS),
            // the filename trivially cannot escape the directory.
            return;
        }
        assertThat(resolved.startsWith(OUTPUT_DIR))
            .as("resolved path '%s' must start with output dir '%s'", resolved, OUTPUT_DIR)
            .isTrue();
    }

    /**
     * <strong>Property 5.5: Result is not empty.</strong>
     *
     * <p><strong>Validates: Requirements 3.6</strong>
     */
    @Property(tries = 500)
    @Label("5.5: safeFilename result is never empty")
    void nonEmpty(@ForAll("adversarialRuleNames") String rawName) {
        String result = HaRuleGenerationService.safeFilename(rawName);
        assertThat(result).isNotEmpty();
    }

    /**
     * <strong>Property 5.6: Length of result is at most 128 characters
     * (so result + ".yaml" &le; 133 chars).</strong>
     *
     * <p><strong>Validates: Requirements 3.6</strong>
     */
    @Property(tries = 500)
    @Label("5.6: safeFilename length <= 128 (filename + .yaml <= 133)")
    void maxLength(@ForAll("adversarialRuleNames") String rawName) {
        String result = HaRuleGenerationService.safeFilename(rawName);
        assertThat(result.length())
            .as("safeFilename('%s') has length %d, expected <= 128", rawName, result.length())
            .isLessThanOrEqualTo(128);

        // Also verify the full filename with .yaml extension
        String fullFilename = result + ".yaml";
        assertThat(fullFilename.length())
            .as("full filename length must be <= 133")
            .isLessThanOrEqualTo(133);
    }

    // =========================================================================
    // Arbitrary: adversarial rule names
    // =========================================================================

    /**
     * Generates arbitrary strings including adversarial inputs designed to exercise
     * the filename sanitization logic: path traversals, control chars, nulls,
     * empty/whitespace, very long strings, reserved filename characters, and
     * full Unicode range.
     */
    @Provide
    Arbitrary<String> adversarialRuleNames() {
        Arbitrary<String> normal = Arbitraries.strings()
            .withCharRange('a', 'z')
            .withCharRange('A', 'Z')
            .withCharRange('0', '9')
            .withChars('_', '-', ' ', '.')
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
            "..", "../", ".\\",
            "./.", "....",
            "..rule..name..",
            "rule/../../escape",
            "rule\\..\\..\\escape"
        );

        Arbitrary<String> controlChars = Arbitraries.of(
            "rule\u0000name", "\u0000",
            "\u0007\u0008\u001B",
            "rule\nnewline", "rule\ttab",
            "\u0000\u0001\u0002\u0003",
            "rule\r\nwindows",
            "\u007F\u0080\u009F"
        );

        Arbitrary<String> emptyWhitespace = Arbitraries.of(
            "", "   ", "\t\t", "\n\n", "   \t \n  "
        );

        Arbitrary<String> veryLong = Arbitraries.strings()
            .all()
            .ofMinLength(129)
            .ofMaxLength(500)
            .map(s -> s);

        Arbitrary<String> reserved = Arbitraries.of(
            "rule:name*test?<>|\"",
            "file<name>.yaml",
            "pipe|command",
            "::::::", "***???",
            "\"quoted\"",
            "<script>alert(1)</script>"
        );

        Arbitrary<String> separatorsOnly = Arbitraries.of(
            "///", "\\\\\\", "/\\/\\",
            "///\\\\\\///",
            "../.../...", "...\\...\\...",
            "......", "././././"
        );

        Arbitrary<String> leadingDots = Arbitraries.of(
            "..hidden", ".hidden",
            "---dashes", "___underscores",
            ".-._mixed", "....leading.dots"
        );

        return Arbitraries.frequencyOf(
            Tuple.of(3, normal),
            Tuple.of(3, traversal),
            Tuple.of(2, controlChars),
            Tuple.of(2, emptyWhitespace),
            Tuple.of(2, veryLong),
            Tuple.of(2, reserved),
            Tuple.of(2, separatorsOnly),
            Tuple.of(1, leadingDots)
        );
    }
}
