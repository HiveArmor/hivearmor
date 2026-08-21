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
 * Property 7: No raw index strings or raw query bodies in scoring or REST paths.
 *
 * <p><strong>Feature: sprint-29-ueba-baseline, Property 7: No raw index strings or
 * raw query bodies in scoring or REST paths</strong>
 *
 * <p><strong>Validates: Requirements 3.10, 4.9, 7.3, 7.4</strong>
 *
 * <h2>What is checked</h2>
 * <p>Every OpenSearch call issued by {@code HaUebaDeviationEngine} and
 * {@code HaUebaResource} uses an index pattern returned by {@code MsspIndexResolver}
 * and a query body built through {@code SearchUtil} DSL. Static analysis of the
 * source files rejects:
 * <ul>
 *   <li>Any occurrence of the literal substring {@code v3-hive-} (raw index string)</li>
 *   <li>Any occurrence of {@code .rawJson(} (raw JSON query builder pattern)</li>
 *   <li>Any occurrence of {@code .wrapper(} (raw JSON wrapper query pattern)</li>
 *   <li>Any occurrence of {@code new JsonData(} (raw JSON data construction)</li>
 * </ul>
 *
 * <p>Additionally:
 * <ul>
 *   <li>{@code HaUebaResource} must reference {@code MsspIndexResolver} (import or field),
 *       confirming index resolution is available for any OpenSearch operations.</li>
 *   <li>{@code HaUebaDeviationEngine} must reference {@code MetricObservationReader},
 *       which enforces the MsspIndexResolver + SearchUtil invariant by contract.</li>
 * </ul>
 *
 * <h2>Minimum iterations</h2>
 * <p>100 (enforced via {@code @Property(tries = 100)}).
 */
@Tag("Feature: sprint-29-ueba-baseline")
@Tag("Property 7")
class HaUebaDeviationEngineAndResourceMsspSearchUtilPropertyTest {

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

    /** Pattern to detect MsspIndexResolver reference (import or field). */
    private static final Pattern MSSP_RESOLVER_REFERENCE =
        Pattern.compile("MsspIndexResolver");

    /** Pattern to detect MetricObservationReader reference (import or field). */
    private static final Pattern METRIC_OBSERVATION_READER_REFERENCE =
        Pattern.compile("MetricObservationReader");

    /** Pattern that matches single-line comments: // ... */
    private static final Pattern SINGLE_LINE_COMMENT =
        Pattern.compile("//.*$", Pattern.MULTILINE);

    /** Pattern that matches block and Javadoc comments. */
    private static final Pattern BLOCK_COMMENT =
        Pattern.compile("/\\*[\\s\\S]*?\\*/");

    // =========================================================================
    // Property 7
    // =========================================================================

    /**
     * **Validates: Requirements 3.10, 4.9, 7.3, 7.4**
     *
     * <p>For any scoring-path or REST-path source file sampled by the generator,
     * the following invariants hold:
     * <ul>
     *   <li>No occurrence of the literal {@code v3-hive-} (raw index string).</li>
     *   <li>No occurrence of {@code .rawJson(} (raw JSON query builder).</li>
     *   <li>No occurrence of {@code .wrapper(} (raw JSON wrapper query).</li>
     *   <li>No occurrence of {@code new JsonData(} (raw JSON data construction).</li>
     *   <li>{@code HaUebaResource} references {@code MsspIndexResolver} (confirming
     *       index resolution is available).</li>
     *   <li>{@code HaUebaDeviationEngine} references {@code MetricObservationReader}
     *       (which enforces the MsspIndexResolver + SearchUtil invariant by contract).</li>
     * </ul>
     */
    @Property(tries = 100)
    @Label("Feature: sprint-29-ueba-baseline, Property 7: No raw index strings or raw query bodies in scoring or REST paths")
    void property7_noRawIndexOrQueryInScoringAndRestPaths(
            @ForAll("scoringAndRestPathFiles") Path filePath) throws IOException {
        String content = Files.readString(filePath);

        // Strip comments before checking for forbidden patterns.
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

        // 5. HaUebaResource must reference MsspIndexResolver
        String fileName = filePath.getFileName().toString();
        if (fileName.equals("HaUebaResource.java")) {
            assertThat(MSSP_RESOLVER_REFERENCE.matcher(content).find())
                .as("HaUebaResource must reference MsspIndexResolver for index pattern resolution")
                .isTrue();
        }

        // 6. HaUebaDeviationEngine must delegate to MetricObservationReader
        //    (which enforces the MsspIndexResolver + SearchUtil invariant)
        if (fileName.equals("HaUebaDeviationEngine.java")) {
            assertThat(METRIC_OBSERVATION_READER_REFERENCE.matcher(content).find())
                .as("HaUebaDeviationEngine must reference MetricObservationReader, "
                    + "which enforces the MsspIndexResolver + SearchUtil invariant by contract")
                .isTrue();
        }
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
     * Provides an {@link Arbitrary} that samples from the scoring-path and REST-path
     * source files that perform or may perform OpenSearch operations:
     * <ul>
     *   <li>{@code HaUebaDeviationEngine.java} — scoring engine</li>
     *   <li>{@code HaUebaResource.java} — REST controller</li>
     * </ul>
     *
     * <p>Only classes that directly issue or route OpenSearch calls are included.
     */
    @Provide
    Arbitrary<Path> scoringAndRestPathFiles() throws IOException {
        List<Path> files = new ArrayList<>();

        Path root = findRepoRoot();

        // HaUebaDeviationEngine — scoring path
        Path deviationEngine = root.resolve(
            "backend/src/main/java/com/hivearmor/service/ueba/HaUebaDeviationEngine.java");
        if (Files.exists(deviationEngine)) {
            files.add(deviationEngine);
        }

        // HaUebaResource — REST path
        Path resource = root.resolve(
            "backend/src/main/java/com/hivearmor/web/rest/ueba/HaUebaResource.java");
        if (Files.exists(resource)) {
            files.add(resource);
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
