package com.hivearmor.service.ueba;

import net.jqwik.api.*;
import org.junit.jupiter.api.Tag;

import java.io.IOException;
import java.nio.file.*;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Property 6: {@code X-Internal-Key} is the only credential channel.
 *
 * <p><strong>Feature: sprint-29-ueba-baseline, Property 6: X-Internal-Key is the
 * only credential channel</strong>
 *
 * <p><strong>Validates: Requirements 3.8, 7.5</strong>
 *
 * <h2>What is checked</h2>
 * <p>Every outbound HTTP request emitted by {@code HaUebaDeviationEngine} to
 * {@code EventProcessor_Injection_Endpoint} carries {@code X-Internal-Key: ${INTERNAL_KEY}};
 * the request URL contains no query parameters carrying the key, the request body does
 * not embed the key, and no log statement in the scoring path emits the key.
 *
 * <p>This test performs static source-code analysis of {@code SyntheticAlertInjector.java}
 * and {@code HaUebaDeviationEngine.java} to verify:
 * <ul>
 *   <li>The {@code X-Internal-Key} header is present in the HTTP request construction</li>
 *   <li>No {@code .addQueryParameter(} or {@code ?key=} patterns in URL construction</li>
 *   <li>No log statement references the internal key variable value directly</li>
 *   <li>The internal key is NOT serialized into the request body (the
 *       {@link SyntheticAlertPayload} record does not contain a key field)</li>
 * </ul>
 *
 * <h2>Minimum iterations</h2>
 * <p>100 (enforced via {@code @Property(tries = 100)}).
 */
@Tag("Feature: sprint-29-ueba-baseline")
@Tag("Property 6")
class HaUebaDeviationEngineInternalKeyHeaderSafetyPropertyTest {

    // =========================================================================
    // Constants — forbidden patterns
    // =========================================================================

    /** The header that MUST be present in the injector source. */
    private static final String REQUIRED_HEADER = "X-Internal-Key";

    /**
     * Pattern detecting query-parameter-based key injection.
     * Matches: .addQueryParameter("key"...) or .addQueryParameter("internalKey"...)
     */
    private static final Pattern QUERY_PARAM_PATTERN =
        Pattern.compile("\\.addQueryParameter\\s*\\(", Pattern.CASE_INSENSITIVE);

    /**
     * Pattern detecting URL-embedded key patterns like {@code ?key=} or {@code &key=}.
     */
    private static final Pattern URL_KEY_PATTERN =
        Pattern.compile("[?&](key|internal_key|internalKey|INTERNAL_KEY)=",
            Pattern.CASE_INSENSITIVE);

    /**
     * Pattern detecting the internal key variable being passed directly to a log
     * statement. Matches: log.{level}(...internalKey...) where {level} is info/warn/error/debug/trace.
     * The variable name in source is {@code internalKey}.
     */
    private static final Pattern LOG_WITH_KEY_PATTERN =
        Pattern.compile("log\\.(info|warn|error|debug|trace)\\s*\\([^)]*internalKey[^)]*\\)");

    /**
     * Pattern detecting the internal key variable interpolated in a log format string
     * using String concatenation. Matches: log.warn("..." + internalKey + ...) etc.
     */
    private static final Pattern LOG_CONCAT_KEY_PATTERN =
        Pattern.compile("log\\.(info|warn|error|debug|trace)\\s*\\([^;]*\\+\\s*internalKey");

    /**
     * Pattern detecting the key being written directly into an ObjectMapper
     * serialization call. Matches patterns like:
     * {@code mapper.writeValueAsBytes(internalKey)} or
     * {@code mapper.writeValueAsString(internalKey)} — proving the key itself
     * is being serialized into the body rather than a domain payload object.
     */
    private static final Pattern BODY_KEY_EMBEDDING_PATTERN =
        Pattern.compile("writeValue(AsBytes|AsString|)\\s*\\([^)]*internalKey[^)]*\\)");

    /** Pattern that matches single-line comments: // ... */
    private static final Pattern SINGLE_LINE_COMMENT =
        Pattern.compile("//.*$", Pattern.MULTILINE);

    /** Pattern that matches block and Javadoc comments. */
    private static final Pattern BLOCK_COMMENT =
        Pattern.compile("/\\*[\\s\\S]*?\\*/");

    // =========================================================================
    // Property 6
    // =========================================================================

    /**
     * <strong>Validates: Requirements 3.8, 7.5</strong>
     *
     * <p>For each source file sampled by the generator, verifies:
     * <ul>
     *   <li>No query-parameter-based key injection ({@code .addQueryParameter(})</li>
     *   <li>No URL-embedded key patterns ({@code ?key=} or {@code &key=})</li>
     *   <li>No log statement references the internal key variable value</li>
     *   <li>No explicit embedding of the key into the request body</li>
     * </ul>
     */
    @Property(tries = 100)
    @Label("Property 6: X-Internal-Key is the only credential channel — no key in URL, body, or logs")
    void property6_internalKeyHeaderOnlyChannel(
            @ForAll("internalKeyPathFiles") Path filePath) throws IOException {
        String content = Files.readString(filePath);

        // Strip comments for code-only analysis
        String codeOnly = stripComments(content);

        // 1. No .addQueryParameter( usage — key must not be passed as a URL query param
        assertThat(QUERY_PARAM_PATTERN.matcher(codeOnly).find())
            .as("File %s must not use .addQueryParameter() — "
                + "internal key must travel exclusively in the X-Internal-Key header",
                filePath.getFileName())
            .isFalse();

        // 2. No ?key= or &key= URL patterns — key must not be embedded in URLs
        assertThat(URL_KEY_PATTERN.matcher(codeOnly).find())
            .as("File %s must not embed the key in URL query parameters (?key= or &key=)",
                filePath.getFileName())
            .isFalse();

        // 3. No log statement that directly references the internalKey variable
        assertThat(LOG_WITH_KEY_PATTERN.matcher(codeOnly).find())
            .as("File %s must not log the internalKey variable in any log statement",
                filePath.getFileName())
            .isFalse();

        // 4. No log statement that concatenates the internalKey variable
        assertThat(LOG_CONCAT_KEY_PATTERN.matcher(codeOnly).find())
            .as("File %s must not concatenate internalKey into log statements",
                filePath.getFileName())
            .isFalse();

        // 5. No explicit embedding of the key into the HTTP request body
        assertThat(BODY_KEY_EMBEDDING_PATTERN.matcher(codeOnly).find())
            .as("File %s must not embed the internalKey into the request body",
                filePath.getFileName())
            .isFalse();
    }

    /**
     * <strong>Validates: Requirements 3.8, 7.5</strong>
     *
     * <p>The {@code SyntheticAlertInjector} source file MUST contain the
     * {@code X-Internal-Key} header string, proving the header is set on
     * outbound requests to the event-processor injection endpoint.
     */
    @Property(tries = 100)
    @Label("Property 6b: SyntheticAlertInjector sets X-Internal-Key header on every request")
    void property6b_injectorSetsXInternalKeyHeader(
            @ForAll("injectorFile") Path filePath) throws IOException {
        String content = Files.readString(filePath);

        // The injector MUST contain the X-Internal-Key header literal
        assertThat(content)
            .as("File %s must set the X-Internal-Key header on outbound requests",
                filePath.getFileName())
            .contains(REQUIRED_HEADER);

        // The header must be added via .addHeader("X-Internal-Key", ...) pattern
        Pattern addHeaderPattern = Pattern.compile(
            "\\.addHeader\\s*\\(\\s*\"X-Internal-Key\"");
        assertThat(addHeaderPattern.matcher(content).find())
            .as("File %s must use .addHeader(\"X-Internal-Key\", ...) to set the header",
                filePath.getFileName())
            .isTrue();
    }

    /**
     * <strong>Validates: Requirements 3.8, 7.5</strong>
     *
     * <p>The {@code SyntheticAlertPayload} record must NOT contain any field that
     * could carry the internal key into the serialized JSON request body. The record
     * fields must be limited to domain-relevant data (userId, runTs, totalScore,
     * contributingMetrics, tenantId).
     */
    @Property(tries = 100)
    @Label("Property 6c: SyntheticAlertPayload does not contain a key field")
    void property6c_payloadRecordDoesNotContainKeyField(
            @ForAll("payloadFile") Path filePath) throws IOException {
        String content = Files.readString(filePath);
        String codeOnly = stripComments(content);

        // The payload record must NOT contain fields named key, internalKey, secret, etc.
        Pattern keyFieldPattern = Pattern.compile(
            "\\b(String|char\\[\\])\\s+(internalKey|key|secret|apiKey|token|credential)\\b",
            Pattern.CASE_INSENSITIVE);

        assertThat(keyFieldPattern.matcher(codeOnly).find())
            .as("File %s (SyntheticAlertPayload) must not contain a credential field — "
                + "the internal key must NOT be serialized into the request body",
                filePath.getFileName())
            .isFalse();
    }

    // =========================================================================
    // Helper — strip comments
    // =========================================================================

    /**
     * Strips Java comments (block, Javadoc, and single-line) from the given source content.
     * Returns only the executable code portions for pattern matching.
     */
    private static String stripComments(String source) {
        String withoutBlock = BLOCK_COMMENT.matcher(source).replaceAll("");
        return SINGLE_LINE_COMMENT.matcher(withoutBlock).replaceAll("");
    }

    // =========================================================================
    // Generators
    // =========================================================================

    /**
     * Provides an {@link Arbitrary} that samples from source files in the scoring
     * and injection path that handle the internal key:
     * <ul>
     *   <li>{@code SyntheticAlertInjector.java} — sends the HTTP request with the key</li>
     *   <li>{@code HaUebaDeviationEngine.java} — orchestrates scoring and triggers injection</li>
     * </ul>
     */
    @Provide
    Arbitrary<Path> internalKeyPathFiles() throws IOException {
        List<Path> files = new ArrayList<>();

        Path root = findRepoRoot();
        Path uebaServiceDir = root.resolve("backend/src/main/java/com/hivearmor/service/ueba");

        String[] scoringPathSources = {
            "SyntheticAlertInjector.java",
            "HaUebaDeviationEngine.java"
        };

        for (String fileName : scoringPathSources) {
            Path path = uebaServiceDir.resolve(fileName);
            if (Files.exists(path)) {
                files.add(path);
            }
        }

        Assume.that(!files.isEmpty());
        Collections.shuffle(files);
        return Arbitraries.of(files);
    }

    /**
     * Provides the {@code SyntheticAlertInjector.java} file specifically for
     * testing that the X-Internal-Key header is set.
     */
    @Provide
    Arbitrary<Path> injectorFile() throws IOException {
        Path root = findRepoRoot();
        Path injector = root.resolve(
            "backend/src/main/java/com/hivearmor/service/ueba/SyntheticAlertInjector.java");
        Assume.that(Files.exists(injector));
        return Arbitraries.just(injector);
    }

    /**
     * Provides the {@code SyntheticAlertPayload.java} file specifically for
     * verifying the record does not contain a key field.
     */
    @Provide
    Arbitrary<Path> payloadFile() throws IOException {
        Path root = findRepoRoot();
        Path payload = root.resolve(
            "backend/src/main/java/com/hivearmor/service/ueba/SyntheticAlertPayload.java");
        Assume.that(Files.exists(payload));
        return Arbitraries.just(payload);
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
