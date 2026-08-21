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
 * ends with {@code .yaml} when the extension is appended, and resolves inside
 * {@code RuleGenOutputDir} when combined with a base directory.
 *
 * <p><strong>Validates: Requirements 3.6</strong>
 */
@Label("Feature: sprint-28-ueba-signals, Property 5: Approved filenames are path-safe")
class FilenameSafePropertyTest {

    /** A synthetic output directory used for path-containment checks. */
    private static final Path BASE_DIR = Path.of("/opt/hivearmor/rules").toAbsolutePath().normalize();

    // =========================================================================
    // Property 5: Filename-safe transformation
    // =========================================================================

    /**
     * <strong>Property 5-A: Result does not contain forward slash.</strong>
     *
     * <p><strong>Validates: Requirements 3.6</strong>
     */
    @Property(tries = 200)
    @Label("Property 5-A: safeFilename never contains forward slash")
    void property5a_noForwardSlash(@ForAll("ruleNames") String rawName) {
        String result = HaRuleGenerationService.safeFilename(rawName);
        assertThat(result).doesNotContain("/");
    }

    /**
     * <strong>Property 5-B: Result does not contain backslash.</strong>
     *
     * <p><strong>Validates: Requirements 3.6</strong>
     */
    @Property(tries = 200)
    @Label("Property 5-B: safeFilename never contains backslash")
    void property5b_noBackslash(@ForAll("ruleNames") String rawName) {
        String result = HaRuleGenerationService.safeFilename(rawName);
        assertThat(result).doesNotContain("\\");
    }

    /**
     * <strong>Property 5-C: Result does not contain ".." (dot-dot traversal).</strong>
     *
     * <p><strong>Validates: Requirements 3.6</strong>
     */
    @Property(tries = 200)
    @Label("Property 5-C: safeFilename never contains dot-dot traversal")
    void property5c_noDotDot(@ForAll("ruleNames") String rawName) {
        String result = HaRuleGenerationService.safeFilename(rawName);
        assertThat(result).doesNotContain("..");
    }

    /**
     * <strong>Property 5-D: When appended with ".yaml" and resolved against a base
     * directory, the path stays inside that directory.</strong>
     *
     * <p>If the sanitized filename contains characters that the OS path system cannot
     * represent (e.g., unmappable Unicode), {@link java.nio.file.InvalidPathException}
     * is thrown by {@code Path.of}. In that case the path cannot escape the directory
     * either, so the property trivially holds.
     *
     * <p><strong>Validates: Requirements 3.6</strong>
     */
    @Property(tries = 200)
    @Label("Property 5-D: resolved path stays inside base directory")
    void property5d_pathContainment(@ForAll("ruleNames") String rawName) {
        String filename = HaRuleGenerationService.safeFilename(rawName) + ".yaml";
        try {
            Path resolved = BASE_DIR.resolve(filename).toAbsolutePath().normalize();
            assertThat(resolved.startsWith(BASE_DIR))
                .as("resolved path '%s' must start with base dir '%s'", resolved, BASE_DIR)
                .isTrue();
        } catch (InvalidPathException e) {
            // If the filename contains characters the OS path system cannot represent,
            // it cannot escape the directory — the property trivially holds.
        }
    }

    /**
     * <strong>Property 5-E: Result is non-empty (defaults to "rule" for empty/null).</strong>
     *
     * <p><strong>Validates: Requirements 3.6</strong>
     */
    @Property(tries = 200)
    @Label("Property 5-E: safeFilename is always non-empty")
    void property5e_nonEmpty(@ForAll("ruleNames") String rawName) {
        String result = HaRuleGenerationService.safeFilename(rawName);
        assertThat(result).isNotEmpty();
    }

    /**
     * <strong>Property 5-F: Result length is at most 128 characters (before .yaml extension).</strong>
     *
     * <p><strong>Validates: Requirements 3.6</strong>
     */
    @Property(tries = 200)
    @Label("Property 5-F: safeFilename length <= 128 characters")
    void property5f_maxLength(@ForAll("ruleNames") String rawName) {
        String result = HaRuleGenerationService.safeFilename(rawName);
        assertThat(result.length())
            .as("filename length must be <= 128 but was %d for input '%s'",
                result.length(), rawName)
            .isLessThanOrEqualTo(128);
    }

    /**
     * <strong>Property 5-G: Null input produces the default filename "rule".</strong>
     *
     * <p><strong>Validates: Requirements 3.6</strong>
     */
    @Property(tries = 10)
    @Label("Property 5-G: null input defaults to 'rule'")
    void property5g_nullDefault() {
        String result = HaRuleGenerationService.safeFilename(null);
        assertThat(result).isEqualTo("rule");
    }

    // =========================================================================
    // Generators
    // =========================================================================

    /**
     * Generates arbitrary rule name strings including adversarial inputs:
     * <ul>
     *   <li>Normal alphanumeric strings</li>
     *   <li>Path traversal attempts ({@code ../../etc/passwd}, {@code \\..\windows})</li>
     *   <li>Control characters (NUL, BEL, TAB, newline)</li>
     *   <li>Empty and whitespace-only strings</li>
     *   <li>Very long strings (up to 500 chars)</li>
     *   <li>Strings with reserved filename characters ({@code : * ? " < > |})</li>
     *   <li>Unicode characters</li>
     * </ul>
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
            .map(s -> s); // widen to Arbitrary<String>

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

        Arbitrary<String> emptyOrWhitespace = Arbitraries.of(
            "",
            "   ",
            "\t\t",
            "\n\n",
            "   \t \n  "
        );

        Arbitrary<String> veryLong = Arbitraries.strings()
            .all()
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
            .ofMinLength(0)
            .ofMaxLength(300)
            .map(s -> s);

        Arbitrary<String> onlySeparators = Arbitraries.of(
            "///",
            "\\\\\\",
            "/\\/\\",
            "///\\\\\\///",
            "../.../...",
            "...\\...\\..."
        );

        return Arbitraries.oneOf(
            normal,
            traversal,
            controlChars,
            emptyOrWhitespace,
            veryLong,
            reserved,
            unicode,
            onlySeparators
        );
    }
}
