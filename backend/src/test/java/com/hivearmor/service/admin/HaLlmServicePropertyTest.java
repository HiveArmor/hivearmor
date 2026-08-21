package com.hivearmor.service.admin;

import com.hivearmor.domain.UtmConfigurationParameter;
import com.hivearmor.repository.UtmConfigurationParameterRepository;
import com.hivearmor.util.CipherUtil;
import net.jqwik.api.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.lang.reflect.Field;
import java.time.Instant;
import java.util.Collections;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Property-based tests for {@link HaLlmService} probe-failure sanitization.
 *
 * <h3>Property 13: LLM probe failure response never leaks apiKey</h3>
 * <p>For any arbitrary non-empty {@code apiKey} string, when that key is the
 * currently-persisted value and a probe failure produces an exception whose
 * message contains the key verbatim, calling
 * {@link HaLlmService#sanitize(Throwable)} must return a string that does
 * <em>not</em> contain the plaintext {@code apiKey}.</p>
 *
 * <p><strong>Validates: Requirements 2.6</strong></p>
 *
 * <p>Test strategy:
 * <ol>
 *   <li>Generate an arbitrary non-empty {@code apiKey} string.</li>
 *   <li>Encrypt it with a fixed test encryption key and persist the encrypted
 *       value via a mocked {@link UtmConfigurationParameterRepository}.</li>
 *   <li>Set the {@code ENCRYPTION_KEY} environment variable to the same fixed
 *       test key using a reflective env-map override so that
 *       {@link CipherUtil#decrypt} recovers the plaintext during
 *       {@code sanitize()}.</li>
 *   <li>Construct a {@link Throwable} whose message embeds the plaintext
 *       {@code apiKey} (simulating a failure that would leak the key).</li>
 *   <li>Call {@code sanitize(throwable)} on the service under test.</li>
 *   <li>Assert the returned string does NOT contain the plaintext
 *       {@code apiKey}.</li>
 * </ol>
 * </p>
 */
class HaLlmServicePropertyTest {

    // -------------------------------------------------------------------------
    // Test infrastructure
    // -------------------------------------------------------------------------

    /**
     * Fixed test encryption key used for AES-128/PBKDF2 in all property
     * invocations. Must be consistent between encrypt() and the value exposed
     * via the spoofed ENCRYPTION_KEY env var so CipherUtil.decrypt() recovers
     * the plaintext.
     */
    private static final String TEST_ENCRYPTION_KEY = "ha-test-cipher-key-sprint20-pbt!";

    // =========================================================================
    // Property 13: LLM probe failure response never leaks apiKey
    // Validates: Requirements 2.6
    // =========================================================================

    /**
     * **Validates: Requirements 2.6**
     *
     * <p>For every arbitrary non-empty {@code apiKey} string, when the service's
     * repository holds that key encrypted at rest and an exception is raised whose
     * message contains the plaintext key, {@link HaLlmService#sanitize(Throwable)}
     * must return a message that does NOT contain the plaintext {@code apiKey}.
     *
     * <p>The environment variable {@code ENCRYPTION_KEY} is injected via JVM-level
     * reflection so that {@link CipherUtil#decrypt} can recover the plaintext from
     * the mock-persisted encrypted value without requiring a live environment.
     */
    @Property(tries = 200)
    void property13_sanitizeNeverLeaksApiKey(
            @ForAll("apiKeyStrings") String apiKey) throws Exception {

        UtmConfigurationParameterRepository configRepo =
                mock(UtmConfigurationParameterRepository.class);

        // Arrange: encrypt the plaintext apiKey with the test key, then persist it
        // via the mocked repository (simulating the encrypted-at-rest state).
        String encryptedApiKey = CipherUtil.encrypt(apiKey, TEST_ENCRYPTION_KEY);

        UtmConfigurationParameter keyParam = configParam(
                HaLlmService.KEY_AI_API_KEY, encryptedApiKey);
        when(configRepo.findByConfParamShort(eq(HaLlmService.KEY_AI_API_KEY)))
                .thenReturn(Optional.of(keyParam));

        // Arrange: inject ENCRYPTION_KEY into the process environment so that
        // CipherUtil.decrypt() recovers the plaintext inside sanitize().
        setEnv("ENCRYPTION_KEY", TEST_ENCRYPTION_KEY);

        try {
            HaLlmService service = new HaLlmService(configRepo);

            // Build a throwable whose message verbatim contains the plaintext apiKey.
            // This simulates e.g. an HTTP client leaking the Bearer token in its
            // exception message (a realistic failure mode).
            String leakyMessage = "Connection refused while calling endpoint with key=" + apiKey
                    + " — check network and credentials.";
            RuntimeException leakyException = new RuntimeException(leakyMessage);

            // Act: sanitize must strip the apiKey from the error message.
            String sanitized = service.sanitize(leakyException);

            // Assert: the returned string must not contain the plaintext apiKey.
            assertThat(sanitized)
                    .as("sanitize() must not leak the plaintext apiKey in the error message "
                            + "(Req 2.6). apiKey='%s', leakyMessage='%s', sanitized='%s'",
                            apiKey, leakyMessage, sanitized)
                    .doesNotContain(apiKey);
        } finally {
            // Restore env var to prevent test pollution across property tries.
            unsetEnv("ENCRYPTION_KEY");
        }
    }

    /**
     * **Validates: Requirements 2.6**
     *
     * <p>Variant: when the exception message contains the apiKey multiple times
     * (e.g. in URL, in header, and in a retry message), all occurrences must be
     * stripped by {@code sanitize()}.
     */
    @Property(tries = 100)
    void property13b_sanitizeStripsAllOccurrencesOfApiKey(
            @ForAll("apiKeyStrings") String apiKey) throws Exception {

        UtmConfigurationParameterRepository configRepo =
                mock(UtmConfigurationParameterRepository.class);

        String encryptedApiKey = CipherUtil.encrypt(apiKey, TEST_ENCRYPTION_KEY);

        UtmConfigurationParameter keyParam = configParam(
                HaLlmService.KEY_AI_API_KEY, encryptedApiKey);
        when(configRepo.findByConfParamShort(eq(HaLlmService.KEY_AI_API_KEY)))
                .thenReturn(Optional.of(keyParam));

        setEnv("ENCRYPTION_KEY", TEST_ENCRYPTION_KEY);

        try {
            HaLlmService service = new HaLlmService(configRepo);

            // Message contains the key three times across different contexts.
            String messageWithMultipleOccurrences =
                    "Auth failed: Bearer " + apiKey + ". "
                    + "Retry with token=" + apiKey + " also failed. "
                    + "Leaked again: " + apiKey;
            RuntimeException ex = new RuntimeException(messageWithMultipleOccurrences);

            String sanitized = service.sanitize(ex);

            assertThat(sanitized)
                    .as("sanitize() must strip ALL occurrences of the apiKey, not just the first "
                            + "(Req 2.6). apiKey='%s', sanitized='%s'", apiKey, sanitized)
                    .doesNotContain(apiKey);
        } finally {
            unsetEnv("ENCRYPTION_KEY");
        }
    }

    /**
     * **Validates: Requirements 2.6**
     *
     * <p>Robustness variant: when the exception message does NOT contain the apiKey
     * at all, {@code sanitize()} must return a non-null string that equals the
     * original message (no corruption of clean messages).
     */
    @Property(tries = 100)
    void property13c_sanitizeDoesNotCorruptCleanMessages(
            @ForAll("apiKeyStrings")      String apiKey,
            @ForAll("safeMessageStrings") String cleanMessage) throws Exception {

        // Filter: only run when the generated cleanMessage genuinely doesn't contain
        // the apiKey (to test the no-op redaction path cleanly).
        Assume.that(!cleanMessage.contains(apiKey));

        UtmConfigurationParameterRepository configRepo =
                mock(UtmConfigurationParameterRepository.class);

        String encryptedApiKey = CipherUtil.encrypt(apiKey, TEST_ENCRYPTION_KEY);

        UtmConfigurationParameter keyParam = configParam(
                HaLlmService.KEY_AI_API_KEY, encryptedApiKey);
        when(configRepo.findByConfParamShort(eq(HaLlmService.KEY_AI_API_KEY)))
                .thenReturn(Optional.of(keyParam));

        setEnv("ENCRYPTION_KEY", TEST_ENCRYPTION_KEY);

        try {
            HaLlmService service = new HaLlmService(configRepo);

            RuntimeException ex = new RuntimeException(cleanMessage);

            String sanitized = service.sanitize(ex);

            assertThat(sanitized)
                    .as("sanitize() must return a non-null string for any input (Req 2.6)")
                    .isNotNull();
            assertThat(sanitized)
                    .as("sanitize() must not corrupt a message that has no apiKey to strip "
                            + "(Req 2.6). cleanMessage='%s', sanitized='%s'", cleanMessage, sanitized)
                    .isEqualTo(cleanMessage);
        } finally {
            unsetEnv("ENCRYPTION_KEY");
        }
    }

    // =========================================================================
    // Arbitraries (generators)
    // =========================================================================

    /**
     * Generates realistic API key strings: non-empty, no whitespace, drawn
     * from a safe alphanumeric + special-char alphabet to exercise the
     * string-replace path in {@code sanitize()} across a wide token space.
     *
     * <p>Min length 8 ensures the key is non-trivial; max length 64 covers
     * typical bearer token sizes.
     */
    @Provide
    Arbitrary<String> apiKeyStrings() {
        return Arbitraries.strings()
                .withCharRange('a', 'z')
                .withCharRange('A', 'Z')
                .withCharRange('0', '9')
                .withChars("-_")
                .ofMinLength(8)
                .ofMaxLength(64)
                .filter(s -> !s.isBlank() && !"***".equals(s));
    }

    /**
     * Generates safe non-empty messages that represent realistic probe-failure
     * descriptions (without embedding an apiKey). Used in property13c to
     * verify sanitize() does not corrupt clean messages.
     */
    @Provide
    Arbitrary<String> safeMessageStrings() {
        return Arbitraries.of(
                "Connection refused to https://api.openai.com/v1",
                "java.net.SocketTimeoutException: Read timed out after 10000ms",
                "HTTP 503 Service Unavailable",
                "LLM endpoint returned unexpected response format",
                "SSL handshake failed: certificate expired",
                "Network is unreachable",
                "HTTP 429 Too Many Requests",
                "Unknown host: llm.internal.hivearmor.local"
        );
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Creates a {@link UtmConfigurationParameter} with the given key and value,
     * suitable for use as a repository mock return value.
     */
    private static UtmConfigurationParameter configParam(String key, String value) {
        UtmConfigurationParameter p = new UtmConfigurationParameter();
        p.setSectionId(1L);
        p.setConfParamShort(key);
        p.setConfParamValue(value);
        p.setConfParamDatatype("password");
        p.setModificationTime(Instant.now());
        return p;
    }

    /**
     * Injects a key-value pair into the process environment using JVM-internal
     * reflection. This is a well-known idiom for test environments where
     * environment variables must be overridden without restarting the JVM.
     *
     * <p><strong>Warning:</strong> this modifies the live {@code ProcessEnvironment}
     * map. Always call {@link #unsetEnv(String)} in a {@code finally} block to
     * restore a clean state between property trials.
     *
     * <p>Supports both the {@code java.lang.ProcessEnvironment$StringEnvironment}
     * (Linux/macOS) and the {@code ProcessEnvironmentW} (Windows) internal
     * class layouts used in OpenJDK 17.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private static void setEnv(String key, String value) throws Exception {
        try {
            // OpenJDK Linux/macOS path
            Class<?> processEnv = Class.forName("java.lang.ProcessEnvironment");
            Field theEnvField = processEnv.getDeclaredField("theEnvironment");
            theEnvField.setAccessible(true);
            Map<String, String> env = (Map<String, String>) theEnvField.get(null);
            env.put(key, value);

            Field theCaseInsensitiveEnvField = processEnv.getDeclaredField("theCaseInsensitiveEnvironment");
            theCaseInsensitiveEnvField.setAccessible(true);
            Map<String, String> ciEnv = (Map<String, String>) theCaseInsensitiveEnvField.get(null);
            ciEnv.put(key, value);
        } catch (NoSuchFieldException e) {
            // Windows JDK path — environment is stored in Collections.unmodifiableMap
            Class<?>[] classes = Collections.class.getDeclaredClasses();
            Map<String, String> env = System.getenv();
            for (Class<?> c : classes) {
                if ("java.util.Collections$UnmodifiableMap".equals(c.getName())) {
                    Field m = c.getDeclaredField("m");
                    m.setAccessible(true);
                    Map<String, String> innerMap = (Map<String, String>) m.get(env);
                    innerMap.put(key, value);
                }
            }
        }
    }

    /**
     * Removes a key previously injected by {@link #setEnv(String, String)} to
     * restore the environment to its pre-test state.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private static void unsetEnv(String key) throws Exception {
        try {
            Class<?> processEnv = Class.forName("java.lang.ProcessEnvironment");
            Field theEnvField = processEnv.getDeclaredField("theEnvironment");
            theEnvField.setAccessible(true);
            Map<String, String> env = (Map<String, String>) theEnvField.get(null);
            env.remove(key);

            Field theCaseInsensitiveEnvField = processEnv.getDeclaredField("theCaseInsensitiveEnvironment");
            theCaseInsensitiveEnvField.setAccessible(true);
            Map<String, String> ciEnv = (Map<String, String>) theCaseInsensitiveEnvField.get(null);
            ciEnv.remove(key);
        } catch (NoSuchFieldException e) {
            Class<?>[] classes = Collections.class.getDeclaredClasses();
            Map<String, String> env = System.getenv();
            for (Class<?> c : classes) {
                if ("java.util.Collections$UnmodifiableMap".equals(c.getName())) {
                    Field m = c.getDeclaredField("m");
                    m.setAccessible(true);
                    Map<String, String> innerMap = (Map<String, String>) m.get(env);
                    innerMap.remove(key);
                }
            }
        }
    }
}
