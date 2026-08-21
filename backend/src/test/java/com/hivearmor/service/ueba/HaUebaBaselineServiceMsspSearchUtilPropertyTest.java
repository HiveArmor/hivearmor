package com.hivearmor.service.ueba;

import net.jqwik.api.*;
import org.junit.jupiter.api.Tag;

import java.io.IOException;
import java.nio.file.*;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Property 3: No raw index strings or raw query bodies in baseline paths.
 *
 * <p><strong>Feature: sprint-29-ueba-baseline, Property 3: No raw index strings or
 * raw query bodies in baseline paths</strong>
 *
 * <p><strong>Validates: Requirements 2.7, 2.8, 7.3, 7.4</strong>
 *
 * <h2>What is checked</h2>
 * <p>Every OpenSearch call issued by {@code HaUebaBaselineService} and its supporting
 * reader ({@code OpenSearchMetricObservationReader}) uses an index pattern returned by
 * {@code MsspIndexResolver} and a query body built through {@code SearchUtil} DSL.
 * Static analysis of the source files rejects:
 * <ul>
 *   <li>Any occurrence of the literal substring {@code v3-hive-} (raw index string)</li>
 *   <li>Any occurrence of {@code .rawJson(} (raw JSON query builder pattern)</li>
 *   <li>Any occurrence of {@code .wrapper(} (raw JSON wrapper query pattern)</li>
 *   <li>Any occurrence of {@code new JsonData(} (raw JSON data construction)</li>
 * </ul>
 *
 * <p>Additionally, the test verifies that {@code MsspIndexResolver} is injected via
 * constructor injection in both {@code HaUebaBaselineService} and
 * {@code OpenSearchMetricObservationReader}, ensuring the resolver is available for
 * all OpenSearch operations.
 *
 * <h2>Minimum iterations</h2>
 * <p>100 (enforced via {@code @Property(tries = 100)}).
 */
@Tag("Feature: sprint-29-ueba-baseline")
@Tag("Property 3")
class HaUebaBaselineServiceMsspSearchUtilPropertyTest {

    // =========================================================================
    // Constants
    // =========================================================================

    /** Literal substring that must NOT appear in non-comment code lines. */
    private static final String RAW_INDEX_LITERAL = "v3-hive-";

    /** Pattern for raw JSON query builder usage — .rawJson( */
    private static final Pattern RAW_JSON_PATTERN =
        Pattern.compile("\\.rawJson\\s*\\(");

    /** Pattern for raw JSON wrapper query — .wrapper( */
    private static final Pattern WRAPPER_PATTERN =
        Pattern.compile("\\.wrapper\\s*\\(");

    /** Pattern for raw JsonData construction — new JsonData( */
    private static final Pattern JSON_DATA_PATTERN =
        Pattern.compile("new\\s+JsonData\\s*\\(");

    /** Pattern to detect MsspIndexResolver constructor injection. */
    private static final Pattern MSSP_RESOLVER_FIELD =
        Pattern.compile("MsspIndexResolver\\s+\\w+");

    /** Pattern to detect SearchUtil usage (import or method call). */
    private static final Pattern SEARCH_UTIL_USAGE =
        Pattern.compile("SearchUtil");

    /** Pattern that matches single-line comments: // ... */
    private static final Pattern SINGLE_LINE_COMMENT =
        Pattern.compile("//.*$", Pattern.MULTILINE);

    /** Pattern that matches block and Javadoc comments. */
    private static final Pattern BLOCK_COMMENT =
        Pattern.compile("/\\*[\\s\\S]*?\\*/");

    // =========================================================================
    // Property 3
    // =========================================================================

    /**
     * **Validates: Requirements 2.7, 2.8, 7.3, 7.4**
     *
     * <p>For any baseline-path source file sampled by the generator, the following
     * invariants hold:
     * <ul>
     *   <li>No occurrence of the literal {@code v3-hive-} (raw index string).</li>
     *   <li>No occurrence of {@code .rawJson(} (raw JSON query builder).</li>
     *   <li>No occurrence of {@code .wrapper(} (raw JSON wrapper query).</li>
     *   <li>No occurrence of {@code new JsonData(} (raw JSON data construction).</li>
     * </ul>
     */
    @Property(tries = 100)
    @Label("Feature: sprint-29-ueba-baseline, Property 3: No raw index strings or raw query bodies in baseline paths")
    void property3_noRawIndexOrQueryInBaselinePaths(
            @ForAll("baselinePathFiles") Path filePath) throws IOException {
        String content = Files.readString(filePath);

        // Strip comments before checking for forbidden patterns.
        // Comments (Javadoc, block, single-line) may reference v3-hive- for
        // documentation purposes; only executable code lines matter.
        String codeOnly = stripComments(content);

        // 1. No raw v3-hive- index strings in executable code
        assertThat(codeOnly)
            .as("File %s must not contain raw index literal '%s' in executable code — "
                + "all index patterns must come from MsspIndexResolver",
                filePath.getFileName(), RAW_INDEX_LITERAL)
            .doesNotContain(RAW_INDEX_LITERAL);

        // 2. No .rawJson( usage (raw JSON query body construction)
        assertThat(RAW_JSON_PATTERN.matcher(codeOnly).find())
            .as("File %s must not use .rawJson() — "
                + "all queries must be built through SearchUtil DSL",
                filePath.getFileName())
            .isFalse();

        // 3. No .wrapper( usage (raw JSON wrapper queries)
        assertThat(WRAPPER_PATTERN.matcher(codeOnly).find())
            .as("File %s must not use .wrapper() — "
                + "all queries must be built through SearchUtil DSL",
                filePath.getFileName())
            .isFalse();

        // 4. No new JsonData( usage (raw JSON data construction)
        assertThat(JSON_DATA_PATTERN.matcher(codeOnly).find())
            .as("File %s must not use new JsonData() — "
                + "all queries must be built through SearchUtil DSL",
                filePath.getFileName())
            .isFalse();

        // 5. Must reference MsspIndexResolver (injected dependency) — checked in full content
        //    including imports
        assertThat(MSSP_RESOLVER_FIELD.matcher(content).find())
            .as("File %s must inject MsspIndexResolver for index pattern resolution",
                filePath.getFileName())
            .isTrue();

        // 6. Must reference SearchUtil (DSL query construction) — checked in full content
        //    including imports
        assertThat(SEARCH_UTIL_USAGE.matcher(content).find())
            .as("File %s must use SearchUtil for DSL query construction",
                filePath.getFileName())
            .isTrue();
    }

    /**
     * Strips Java comments (block, Javadoc, and single-line) from the given source content.
     * Returns only the executable code portions for pattern matching.
     */
    private static String stripComments(String source) {
        // Remove block and Javadoc comments first (/* ... */ and /** ... */)
        String withoutBlock = BLOCK_COMMENT.matcher(source).replaceAll("");
        // Remove single-line comments (// ...)
        return SINGLE_LINE_COMMENT.matcher(withoutBlock).replaceAll("");
    }

    // =========================================================================
    // Generator
    // =========================================================================

    /**
     * Provides an {@link Arbitrary} that samples from the baseline-path source files
     * that perform OpenSearch operations:
     * <ul>
     *   <li>{@code HaUebaBaselineService.java}</li>
     *   <li>{@code OpenSearchMetricObservationReader.java}</li>
     *   <li>{@code OpenSearchActiveUserDirectory.java}</li>
     * </ul>
     *
     * <p>Only classes that directly issue OpenSearch calls are included.
     * Interfaces, enums, and pure data classes are excluded since they do
     * not perform OpenSearch operations directly.
     */
    @Provide
    Arbitrary<Path> baselinePathFiles() throws IOException {
        List<Path> files = new ArrayList<>();

        Path root = findRepoRoot();
        Path uebaServiceDir = root.resolve("backend/src/main/java/com/hivearmor/service/ueba");

        // Files that perform OpenSearch operations in the baseline path
        // (i.e., they call MsspIndexResolver + SearchUtil for index resolution + query building)
        String[] baselinePathSources = {
            "HaUebaBaselineService.java",
            "OpenSearchActiveUserDirectory.java"
        };

        for (String fileName : baselinePathSources) {
            Path path = uebaServiceDir.resolve(fileName);
            if (Files.exists(path)) {
                files.add(path);
            }
        }

        // OpenSearchMetricObservationReader — the primary OpenSearch reader
        Path observationReader = uebaServiceDir.resolve(
            "metrics/OpenSearchMetricObservationReader.java");
        if (Files.exists(observationReader)) {
            files.add(observationReader);
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
