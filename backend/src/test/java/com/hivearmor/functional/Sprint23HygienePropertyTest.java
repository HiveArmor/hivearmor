package com.hivearmor.functional;

import net.jqwik.api.*;
import org.junit.jupiter.api.Tag;

import java.io.IOException;
import java.nio.file.*;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Property 11: Cross-cutting hygiene invariants hold across every Sprint 23 file.
 *
 * <p><strong>Feature: sprint-23-mssp-portal, Property 11: Cross-cutting hygiene
 * invariants hold across every Sprint 23 file</strong>
 *
 * <p><strong>Validates: Requirements 17.1, 17.2, 17.4, 17.5, 17.6, 17.7, 17.8</strong>
 *
 * <h2>What is checked</h2>
 * <ul>
 *   <li><strong>TypeScript</strong> files under {@code frontend-v3/src/features/mssp/**}
 *       and {@code frontend-v3/src/lib/auth/hasAuthority.ts}:
 *       <ul>
 *         <li>No {@code : any} type annotations (pattern {@code \s:\s+any[\s;,)>$]}).</li>
 *         <li>No hex color literals (pattern {@code #[0-9a-fA-F]{3,8}}).</li>
 *       </ul>
 *   </li>
 *   <li><strong>Java</strong> files under
 *       {@code backend/src/main/java/com/hivearmor/web/rest/mssp/**},
 *       {@code backend/src/main/java/com/hivearmor/service/mssp/**}, and
 *       {@code backend/src/main/java/com/hivearmor/functional/Sprint23*.java}:
 *       <ul>
 *         <li>First non-blank, non-comment line starts with {@code package com.hivearmor.}.</li>
 *         <li>No {@code import} line references {@code com.utmstack} or {@code com.threatwinds}.</li>
 *         <li>Every {@code @RequestMapping}/{@code @GetMapping}/{@code @PostMapping}/
 *             {@code @PutMapping}/{@code @PatchMapping}/{@code @DeleteMapping}
 *             path value begins with {@code /api/ha-mssp/} (or the class-level
 *             {@code @RequestMapping("/api/ha-mssp")} covers all child mappings).</li>
 *       </ul>
 *   </li>
 * </ul>
 *
 * <h2>Minimum iterations</h2>
 * <p>100 (enforced via {@code @Property(tries = 100)}).
 */
@Tag("Feature: sprint-23-mssp-portal")
@Tag("Property 11")
class Sprint23HygienePropertyTest {

    // =========================================================================
    // Constants
    // =========================================================================

    /** Regex pattern: TypeScript `: any` type annotation. */
    private static final java.util.regex.Pattern TS_ANY_PATTERN =
        java.util.regex.Pattern.compile("\\s:\\s+any[\\s;,)>$]");

    /** Regex pattern: hex color literal (3–8 hex digits after #), excluding HTML entities like &#123; */
    private static final java.util.regex.Pattern HEX_COLOR_PATTERN =
        java.util.regex.Pattern.compile("(?<!&)#[0-9a-fA-F]{3,8}\\b");

    /**
     * Extracts the path string literal from a mapping annotation.
     * Matches {@code @XxxMapping("/some/path")} or {@code @XxxMapping(value="/some/path")}.
     * Group 1 contains the path value.
     */
    private static final java.util.regex.Pattern MAPPING_PATH_EXTRACTOR =
        java.util.regex.Pattern.compile(
            "@(?:Request|Get|Post|Put|Patch|Delete)Mapping\\s*\\(\\s*(?:value\\s*=\\s*)?\"([^\"]+)\"");

    // =========================================================================
    // Property 11
    // =========================================================================

    /**
     * **Validates: Requirements 17.1, 17.2, 17.4, 17.5, 17.6, 17.7, 17.8**
     *
     * <p>For any Sprint 23 file sampled by the generator, the hygiene invariants
     * appropriate to the file type must hold:
     * <ul>
     *   <li>TypeScript: zero {@code : any} annotations; zero hex color literals.</li>
     *   <li>Java: package root is {@code com.hivearmor}; no legacy imports;
     *       all mapping paths under {@code /api/ha-mssp/}.</li>
     * </ul>
     */
    @Property(tries = 100)
    @Label("Feature: sprint-23-mssp-portal, Property 11: Cross-cutting hygiene invariants hold across every Sprint 23 file")
    void property11_hygiene(@ForAll("sprint23Files") Path filePath) throws IOException {
        String content = Files.readString(filePath);
        String fileName = filePath.toString();

        if (fileName.endsWith(".ts") || fileName.endsWith(".tsx")) {
            assertTypeScriptHygiene(filePath, content);
        }

        if (fileName.endsWith(".java")) {
            assertJavaHygiene(filePath, content);
        }
    }

    // =========================================================================
    // Assertion helpers
    // =========================================================================

    /**
     * Asserts TypeScript hygiene invariants:
     * <ol>
     *   <li>No {@code : any} type annotations.</li>
     *   <li>No hex color literals.</li>
     * </ol>
     */
    private static void assertTypeScriptHygiene(Path filePath, String content) {
        assertThat(TS_ANY_PATTERN.matcher(content).find())
            .as("File %s must not contain ': any' type annotations (pattern: \\s:\\s+any[\\s;,)>$])",
                filePath)
            .isFalse();

        assertThat(HEX_COLOR_PATTERN.matcher(content).find())
            .as("File %s must not contain hex color literals (pattern: #[0-9a-fA-F]{3,8})",
                filePath)
            .isFalse();
    }

    /**
     * Asserts Java hygiene invariants:
     * <ol>
     *   <li>First non-blank, non-comment line starts with {@code package com.hivearmor.}.</li>
     *   <li>No {@code import} line references {@code com.utmstack} or {@code com.threatwinds}.</li>
     *   <li>Every mapping annotation path begins with {@code /api/ha-mssp/} or the class has a
     *       class-level {@code @RequestMapping("/api/ha-mssp")} that covers all methods.</li>
     * </ol>
     */
    private static void assertJavaHygiene(Path filePath, String content) {
        String[] lines = content.split("\\r?\\n");

        // 1. First non-blank, non-comment line must be the package declaration
        assertFirstPackageLine(filePath, lines);

        // 2. No import lines referencing legacy packages
        assertNoLegacyImports(filePath, lines);

        // 3. All mapping paths must use the /api/ha-mssp/ prefix
        assertMappingPaths(filePath, content);
    }

    /**
     * Asserts that the first non-blank, non-comment line starts with
     * {@code package com.hivearmor.}.
     */
    private static void assertFirstPackageLine(Path filePath, String[] lines) {
        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            // Skip single-line and block comment openers
            if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
                continue;
            }
            // This is the first substantive line — it must be the package declaration
            assertThat(trimmed)
                .as("File %s: first non-blank non-comment line must start with 'package com.hivearmor.'",
                    filePath)
                .startsWith("package com.hivearmor.");
            return;
        }
        // If we exhaust all lines without finding a package line, the file is empty or all comments
        // — no assertion needed for truly empty files
    }

    /**
     * Asserts that no import line references legacy packages
     * ({@code com.utmstack} or {@code com.threatwinds}).
     */
    private static void assertNoLegacyImports(Path filePath, String[] lines) {
        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.startsWith("import ")) {
                assertThat(trimmed)
                    .as("File %s must not import from com.utmstack (legacy) — line: %s",
                        filePath, trimmed)
                    .doesNotContain("com.utmstack");
                assertThat(trimmed)
                    .as("File %s must not import from com.threatwinds (upstream vendor) — line: %s",
                        filePath, trimmed)
                    .doesNotContain("com.threatwinds");
            }
        }
    }

    /**
     * Asserts that every mapping annotation path resolves under {@code /api/ha-mssp/}.
     *
     * <p>Two valid patterns are accepted:
     * <ol>
     *   <li>A class-level {@code @RequestMapping("/api/ha-mssp")} (or {@code "/api/ha-mssp/"})
     *       acts as the common prefix. In this case every method-level annotation path is a
     *       sub-path that composes with the class prefix to form a valid URL under
     *       {@code /api/ha-mssp/}.  Method-level paths like {@code "/overview"} or
     *       {@code "/tenants/{id}"} are accepted without restriction because the composed URL
     *       is already correctly prefixed.</li>
     *   <li>When no class-level anchor is present, each mapping annotation path value must
     *       begin with {@code /api/ha-mssp/} on its own.</li>
     * </ol>
     */
    private static void assertMappingPaths(Path filePath, String content) {
        // Detect a class-level @RequestMapping that already anchors under /api/ha-mssp
        boolean classLevelHaMsspMapping = content.contains("@RequestMapping(\"/api/ha-mssp\")")
            || content.contains("@RequestMapping(\"/api/ha-mssp/\")");

        if (classLevelHaMsspMapping) {
            // The class-level mapping provides the /api/ha-mssp prefix.
            // Method-level annotation paths are sub-paths and do not need to carry the
            // full prefix — any path value is valid as it composes under /api/ha-mssp.
            // No further assertions needed for individual method paths.
            return;
        }

        // No class-level anchor: every mapping annotation path must start with /api/ha-mssp/
        java.util.regex.Matcher extractor = MAPPING_PATH_EXTRACTOR.matcher(content);
        while (extractor.find()) {
            String pathValue = extractor.group(1);
            assertThat(pathValue)
                .as("File %s: mapping path '%s' must start with /api/ha-mssp/ "
                        + "(no class-level @RequestMapping(\"/api/ha-mssp\") found)",
                    filePath, pathValue)
                .startsWith("/api/ha-mssp/");
        }
    }

    // =========================================================================
    // Generator
    // =========================================================================

    /**
     * Provides an {@link Arbitrary} that samples uniformly from the Sprint 23
     * source files enumerated at test-run time.
     *
     * <p>The file list is shuffled before wrapping so that successive trials see
     * files in different orders, maximising coverage across the 100 iterations.
     *
     * <p>{@link Assume#that(boolean)} guards against an empty list so the property
     * skips rather than errors when run in a context where the Sprint 23 directories
     * have not been created yet.
     */
    @Provide
    Arbitrary<Path> sprint23Files() throws IOException {
        List<Path> files = new ArrayList<>();

        Path root = findRepoRoot();

        // --- TypeScript files ---
        Path tsBase = root.resolve("frontend-v3/src/features/mssp");
        if (Files.exists(tsBase)) {
            try (Stream<Path> stream = Files.walk(tsBase)) {
                stream.filter(p -> {
                            String s = p.toString();
                            return (s.endsWith(".ts") || s.endsWith(".tsx"))
                                && !s.contains("node_modules")
                                && !s.contains(".test.")
                                && !s.contains(".property.")
                                && !s.contains(".spec.");
                        })
                      .forEach(files::add);
            }
        }

        Path hasAuthorityTs = root.resolve("frontend-v3/src/lib/auth/hasAuthority.ts");
        if (Files.exists(hasAuthorityTs)) {
            files.add(hasAuthorityTs);
        }

        // --- Java files (Sprint 23 REST controllers) ---
        Path msspRestBase = root.resolve("backend/src/main/java/com/hivearmor/web/rest/mssp");
        if (Files.exists(msspRestBase)) {
            try (Stream<Path> stream = Files.walk(msspRestBase)) {
                stream.filter(p -> p.toString().endsWith(".java"))
                      .forEach(files::add);
            }
        }

        // --- Java files (Sprint 23 services) ---
        Path msspServiceBase = root.resolve("backend/src/main/java/com/hivearmor/service/mssp");
        if (Files.exists(msspServiceBase)) {
            try (Stream<Path> stream = Files.walk(msspServiceBase)) {
                stream.filter(p -> p.toString().endsWith(".java"))
                      .forEach(files::add);
            }
        }

        // --- Java files (Sprint 23 functional tests — Sprint23*.java) ---
        Path functionalBase = root.resolve("backend/src/main/java/com/hivearmor/functional");
        if (Files.exists(functionalBase)) {
            try (Stream<Path> stream = Files.walk(functionalBase)) {
                stream.filter(p -> {
                            String name = p.getFileName().toString();
                            return name.startsWith("Sprint23") && name.endsWith(".java");
                        })
                      .forEach(files::add);
            }
        }
        // Also check src/test/java functional directory (in case files are placed there)
        Path functionalTestBase = root.resolve("backend/src/test/java/com/hivearmor/functional");
        if (Files.exists(functionalTestBase)) {
            try (Stream<Path> stream = Files.walk(functionalTestBase)) {
                stream.filter(p -> {
                            String name = p.getFileName().toString();
                            return name.startsWith("Sprint23") && name.endsWith(".java");
                        })
                      .forEach(files::add);
            }
        }

        Assume.that(!files.isEmpty());

        // Shuffle so the 100 trials sample across different orderings
        Collections.shuffle(files);
        return Arbitraries.of(files);
    }

    // =========================================================================
    // Repository root discovery
    // =========================================================================

    /**
     * Walks up the directory tree from the JVM working directory to find the
     * repository root — the directory containing both {@code frontend-v3/} and
     * {@code backend/} sub-directories.
     *
     * <p>Falls back to the working directory if no such parent is found, which
     * is correct when Maven is already running from the repo root.
     *
     * @return the resolved repository root {@link Path}
     */
    private static Path findRepoRoot() {
        Path dir = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        while (dir != null) {
            if (Files.exists(dir.resolve("frontend-v3")) && Files.exists(dir.resolve("backend"))) {
                return dir;
            }
            dir = dir.getParent();
        }
        // Fallback: working directory (backend/) — walk one level up to the repo root
        Path cwd = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        Path parent = cwd.getParent();
        if (parent != null
                && Files.exists(parent.resolve("frontend-v3"))
                && Files.exists(parent.resolve("backend"))) {
            return parent;
        }
        return cwd;
    }
}
