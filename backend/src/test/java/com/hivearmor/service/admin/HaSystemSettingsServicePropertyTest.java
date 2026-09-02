package com.hivearmor.service.admin;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.AppenderBase;
import com.hivearmor.domain.UtmConfigurationParameter;
import com.hivearmor.repository.UtmConfigurationParameterRepository;
import com.hivearmor.service.admin.event.LlmConfigChangedEvent;
import com.hivearmor.service.dto.admin.SystemSettingsAiDTO;
import com.hivearmor.service.dto.admin.SystemSettingsEmailDTO;
import com.hivearmor.service.dto.admin.SystemSettingsDTO;
import com.hivearmor.util.crypto.HaCipherUtil;
import net.jqwik.api.*;
import net.jqwik.api.constraints.IntRange;
import net.jqwik.api.lifecycle.BeforeTry;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Property-based tests for {@link HaSystemSettingsService} and related components.
 *
 * <p><strong>Properties covered:</strong>
 * <ul>
 *   <li>Property 1: apiKey preservation when apiKeyTouched is not true
 *       — Validates: Requirements 2.7, 3.4</li>
 *   <li>Property 2: Sensitive fields are always masked in GET
 *       — Validates: Requirements 3.2, 3.3</li>
 *   <li>Property 3: Encrypted-at-rest round trip for secrets
 *       — Validates: Requirements 3.1</li>
 *   <li>Property 4: Plaintext secrets never appear in application logs
 *       — Validates: Requirements 3.5</li>
 *   <li>Property 11: One-shot LlmConfigChangedEvent triggers one reload
 *       — Validates: Requirements 2.2, 2.3</li>
 *   <li>Property 12: reloadClient reflects persisted settings
 *       — Validates: Requirements 2.4</li>
 * </ul>
 *
 * <p>jqwik runs {@code @Property} methods in its own lifecycle. Mocks are created
 * fresh via Mockito.mock() and initialized via {@link BeforeTry} so every trial
 * gets a clean state.
 */
class HaSystemSettingsServicePropertyTest {

    // -------------------------------------------------------------------------
    // Test infrastructure
    // -------------------------------------------------------------------------

    /** A well-formed 32-char key for AES-128/PBKDF2. */
    static final String TEST_ENCRYPTION_KEY = "ha-test-cipher-key-sprint20-pbt!";

    /**
     * Thin substitute for {@link HaCipherUtil} that uses a fixed test encryption key
     * so tests do not depend on the {@code ENCRYPTION_KEY} environment variable.
     */
    static class TestCipherUtil extends HaCipherUtil {
        @Override
        public String encrypt(String plaintext) {
            return com.hivearmor.util.CipherUtil.encrypt(plaintext, TEST_ENCRYPTION_KEY);
        }

        @Override
        public String decrypt(String ciphertext) {
            return com.hivearmor.util.CipherUtil.decrypt(ciphertext, TEST_ENCRYPTION_KEY);
        }
    }

    // Fields re-initialised before every jqwik trial via @BeforeTry
    private UtmConfigurationParameterRepository configRepo;
    private HaSystemSettingsService service;
    private TestCipherUtil testCipher;

    @BeforeTry
    void setUp() {
        configRepo  = mock(UtmConfigurationParameterRepository.class);
        testCipher  = new TestCipherUtil();
        service     = new HaSystemSettingsService(configRepo, testCipher, mock(com.hivearmor.service.MailService.class));

        // Default: no persisted params (empty store)
        when(configRepo.findAll()).thenReturn(List.of());
        when(configRepo.findByConfParamShort(anyString())).thenReturn(Optional.empty());
        when(configRepo.save(any(UtmConfigurationParameter.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    // =========================================================================
    // Property 1: apiKey preservation when apiKeyTouched is not true
    // Validates: Requirements 2.7, 3.4
    // =========================================================================

    /**
     * **Validates: Requirements 2.7, 3.4**
     *
     * <p>For any SystemSettingsAiDTO with {@code apiKeyTouched=false}, regardless of
     * what {@code apiKey} value is provided, updateAi() must NOT write a new API key
     * to the repository — the persisted key row is left untouched.
     */
    @Property(tries = 150)
    void property1_apiKeyPreservation_whenApiKeyTouchedFalse(
            @ForAll("nonSentinelStrings") String randomApiKey,
            @ForAll("providerStrings")    String provider,
            @ForAll("modelStrings")       String model,
            @ForAll("endpointStrings")    String endpoint) {

        // Arrange: pre-persist a known encrypted API key
        String originalPlaintext = "original-secret-key-" + UUID.randomUUID();
        String originalEncrypted = testCipher.encrypt(originalPlaintext);

        UtmConfigurationParameter existingKeyParam = param(HaSystemSettingsService.KEY_AI_API_KEY, originalEncrypted);
        when(configRepo.findByConfParamShort(HaSystemSettingsService.KEY_AI_API_KEY))
                .thenReturn(Optional.of(existingKeyParam));

        // DTO with apiKeyTouched = false
        SystemSettingsAiDTO dto = new SystemSettingsAiDTO();
        dto.setProvider(provider);
        dto.setModel(model);
        dto.setEndpoint(endpoint);
        dto.setApiKey(randomApiKey);
        dto.setApiKeyTouched(false);

        // Act
        service.updateAi(dto);

        // Assert: the KEY_AI_API_KEY row was never saved with a different encrypted value
        verify(configRepo, never()).save(argThat(p ->
                HaSystemSettingsService.KEY_AI_API_KEY.equals(p.getConfParamShort())
                        && !originalEncrypted.equals(p.getConfParamValue())));
    }

    /**
     * **Validates: Requirements 2.7, 3.4**
     *
     * <p>When {@code apiKeyTouched=false}, getMasked() still returns "***" for the
     * ai.apiKey field (the key is preserved, but masked in GET responses).
     */
    @Property(tries = 100)
    void property1b_apiKeyMaskedAfterPreservation(
            @ForAll("nonSentinelStrings") String randomApiKey) {

        SystemSettingsAiDTO dto = new SystemSettingsAiDTO();
        dto.setProvider("openai");
        dto.setModel("gpt-4o");
        dto.setEndpoint("https://api.openai.com");
        dto.setApiKey(randomApiKey);
        dto.setApiKeyTouched(false);

        service.updateAi(dto);

        SystemSettingsDTO masked = service.getMasked();
        assertThat(masked.getAi().getApiKey())
                .as("getMasked() must return *** for apiKey regardless of persisted value")
                .isEqualTo("***");
    }

    // =========================================================================
    // Property 2: Sensitive fields are always masked in GET
    // Validates: Requirements 3.2, 3.3
    // =========================================================================

    /**
     * **Validates: Requirements 3.2, 3.3**
     *
     * <p>For any persisted state — including any arbitrary encrypted value stored for
     * {@code ai.apiKey} and {@code smtp.password} — {@link HaSystemSettingsService#getMasked()}
     * must return {@code "***"} for both fields.
     */
    @Property(tries = 200)
    void property2_sensitiveFieldsAlwaysMasked(
            @ForAll("nonSentinelStrings") String rawApiKey,
            @ForAll("nonSentinelStrings") String rawSmtpPassword) {

        // Persist arbitrary encrypted values
        String encApiKey  = testCipher.encrypt(rawApiKey);
        String encSmtpPwd = testCipher.encrypt(rawSmtpPassword);

        when(configRepo.findAll()).thenReturn(List.of(
                param(HaSystemSettingsService.KEY_AI_API_KEY,  encApiKey),
                param(HaSystemSettingsService.KEY_SMTP_PASSWORD, encSmtpPwd)
        ));

        SystemSettingsDTO result = service.getMasked();

        assertThat(result.getAi().getApiKey())
                .as("ai.apiKey must be masked as *** in GET (Req 3.2)")
                .isEqualTo("***");
        assertThat(result.getEmail().getPassword())
                .as("smtp.password must be masked as *** in GET (Req 3.3)")
                .isEqualTo("***");
    }

    /**
     * **Validates: Requirements 3.2, 3.3**
     *
     * <p>Even when the repository has no stored values at all (first boot),
     * getMasked() must return "***" for the secret fields, not null or empty.
     */
    @Property(tries = 50)
    void property2b_sensitiveFieldsMasked_whenNoPersistedValues() {
        when(configRepo.findAll()).thenReturn(List.of());

        SystemSettingsDTO result = service.getMasked();

        assertThat(result.getAi().getApiKey())
                .as("ai.apiKey must be *** even when no row is persisted")
                .isEqualTo("***");
        assertThat(result.getEmail().getPassword())
                .as("smtp.password must be *** even when no row is persisted")
                .isEqualTo("***");
    }

    // =========================================================================
    // Property 3: Encrypted-at-rest round trip for secrets
    // Validates: Requirements 3.1
    // =========================================================================

    /**
     * **Validates: Requirements 3.1**
     *
     * <p>For any non-empty plaintext string, {@code cipher.encrypt(x)} followed by
     * {@code cipher.decrypt(result)} must recover the original value exactly.
     * This ensures the AES/CBC/PKCS5Padding + PBKDF2 scheme used by HaCipherUtil is
     * bijective for all valid input strings.
     */
    @Property(tries = 300)
    void property3_encryptDecryptRoundTrip(
            @ForAll("nonSentinelStrings") String plaintext) {

        String ciphertext = testCipher.encrypt(plaintext);

        // Round-trip: decrypt must recover the original plaintext exactly.
        String recovered = testCipher.decrypt(ciphertext);

        assertThat(recovered)
                .as("decrypt(encrypt(x)) must equal x for any plaintext x (Req 3.1)")
                .isEqualTo(plaintext);
    }

    /**
     * **Validates: Requirements 3.1**
     *
     * <p>encrypt() must produce ciphertext that differs from the plaintext input
     * (i.e. encryption actually transforms the value — not an identity function).
     */
    @Property(tries = 100)
    void property3b_encryptedValueDiffersFromPlaintext(
            @ForAll("nonSentinelStrings") String plaintext) {

        String ciphertext = testCipher.encrypt(plaintext);

        assertThat(ciphertext)
                .as("Ciphertext must differ from plaintext (encryption must be non-identity)")
                .isNotEqualTo(plaintext);
    }

    // =========================================================================
    // Property 4: Plaintext secrets never appear in application logs
    // Validates: Requirements 3.5
    // =========================================================================

    /**
     * **Validates: Requirements 3.5**
     *
     * <p>After calling {@code updateAi()} with a real {@code apiKey} (apiKeyTouched=true),
     * no log appender at any level must have captured the plaintext key value.
     * This guards against accidental {@code log.info("Saving key={}", plaintext)} calls.
     */
    @Property(tries = 100)
    void property4_plaintextApiKeyNeverInLogs(
            @ForAll("nonSentinelStrings") String plaintextApiKey) {

        // Attach a capturing appender to the service logger
        Logger serviceLogger = (Logger) LoggerFactory.getLogger(HaSystemSettingsService.class);
        CapturingAppender capturer = new CapturingAppender();
        capturer.start();
        serviceLogger.addAppender(capturer);
        Level originalLevel = serviceLogger.getLevel();
        serviceLogger.setLevel(Level.ALL);

        try {
            SystemSettingsAiDTO dto = new SystemSettingsAiDTO();
            dto.setProvider("openai");
            dto.setModel("gpt-4o");
            dto.setEndpoint("https://api.openai.com");
            dto.setApiKey(plaintextApiKey);
            dto.setApiKeyTouched(true);

            service.updateAi(dto);

            // Assert no captured log message contains the plaintext key
            for (ILoggingEvent event : capturer.getEvents()) {
                assertThat(event.getFormattedMessage())
                        .as("Log message at level %s must not contain the plaintext apiKey (Req 3.5)",
                                event.getLevel())
                        .doesNotContain(plaintextApiKey);
            }
        } finally {
            serviceLogger.setLevel(originalLevel);
            serviceLogger.detachAppender(capturer);
            capturer.stop();
        }
    }

    /**
     * **Validates: Requirements 3.5**
     *
     * <p>Same guarantee for smtp.password: calling {@code updateEmail()} with a real
     * password must not leak the plaintext into any log statement.
     */
    @Property(tries = 100)
    void property4b_plaintextSmtpPasswordNeverInLogs(
            @ForAll("nonSentinelStrings") String plaintextPassword) {

        Logger serviceLogger = (Logger) LoggerFactory.getLogger(HaSystemSettingsService.class);
        CapturingAppender capturer = new CapturingAppender();
        capturer.start();
        serviceLogger.addAppender(capturer);
        Level originalLevel = serviceLogger.getLevel();
        serviceLogger.setLevel(Level.ALL);

        try {
            SystemSettingsEmailDTO emailDto = new SystemSettingsEmailDTO();
            emailDto.setHost("mail.example.com");
            emailDto.setPort(587);
            emailDto.setUsername("user@example.com");
            emailDto.setPassword(plaintextPassword);
            emailDto.setFrom("noreply@example.com");
            emailDto.setUseTls(true);

            service.updateEmail(emailDto);

            for (ILoggingEvent event : capturer.getEvents()) {
                assertThat(event.getFormattedMessage())
                        .as("Log message must not contain the plaintext smtp.password (Req 3.5)")
                        .doesNotContain(plaintextPassword);
            }
        } finally {
            serviceLogger.setLevel(originalLevel);
            serviceLogger.detachAppender(capturer);
            capturer.stop();
        }
    }

    // =========================================================================
    // Property 11: One-shot LlmConfigChangedEvent triggers exactly one reload
    // Validates: Requirements 2.2, 2.3
    // =========================================================================

    /**
     * **Validates: Requirements 2.2, 2.3**
     *
     * <p>Each {@link LlmConfigChangedEvent} received by {@link HaLlmService} must
     * cause exactly one {@code reloadClient()} invocation — no more, no less.
     * This is verified by a spy that counts how many times {@code reloadClient()} is
     * called after N sequential events are fired.
     */
    @Property(tries = 50)
    void property11_oneLlmConfigChangedEventTriggersOneReload(
            @ForAll @IntRange(min = 1, max = 20) int eventCount) {

        // Create spy with a fresh configRepo per trial
        UtmConfigurationParameterRepository repoForLlm = mock(UtmConfigurationParameterRepository.class);
        when(repoForLlm.findByConfParamShort(anyString())).thenReturn(Optional.empty());

        HaLlmService spyLlmService = spy(new HaLlmService(repoForLlm));

        // Intercept reloadClient() to count calls without real side effects
        AtomicInteger reloadCount = new AtomicInteger(0);
        doAnswer(inv -> {
            reloadCount.incrementAndGet();
            return null;
        }).when(spyLlmService).reloadClient();

        // Fire N events
        for (int i = 0; i < eventCount; i++) {
            spyLlmService.onLlmConfigChanged(new LlmConfigChangedEvent("test-source-" + i));
        }

        assertThat(reloadCount.get())
                .as("Exactly one reloadClient() call per LlmConfigChangedEvent (Req 2.2, 2.3). "
                        + "Expected %d reloads for %d events", eventCount, eventCount)
                .isEqualTo(eventCount);
    }

    // =========================================================================
    // Property 12: reloadClient reflects persisted settings
    // Validates: Requirements 2.4
    // =========================================================================

    /**
     * **Validates: Requirements 2.4**
     *
     * <p>When {@code reloadClient()} is called, it must read settings from the
     * repository. Specifically, the repo is consulted for the endpoint and api key
     * during rebuild — proving the service does not use a stale in-memory cache.
     */
    @Property(tries = 50)
    void property12_reloadClientReadsPersistedSettings(
            @ForAll("endpointStrings") String endpointValue) {

        UtmConfigurationParameterRepository repoForLlm = mock(UtmConfigurationParameterRepository.class);
        // Persist endpoint value in repo
        UtmConfigurationParameter endpointParam = param(HaLlmService.KEY_AI_ENDPOINT, endpointValue);
        when(repoForLlm.findByConfParamShort(HaLlmService.KEY_AI_ENDPOINT))
                .thenReturn(Optional.of(endpointParam));
        when(repoForLlm.findByConfParamShort(HaLlmService.KEY_AI_API_KEY))
                .thenReturn(Optional.empty());

        HaLlmService llmService = new HaLlmService(repoForLlm);

        // Act: trigger reload
        llmService.reloadClient();

        // Assert: the repo was consulted for the endpoint key during reload (Req 2.4)
        verify(repoForLlm, atLeastOnce()).findByConfParamShort(HaLlmService.KEY_AI_ENDPOINT);
    }

    /**
     * **Validates: Requirements 2.4**
     *
     * <p>After two sequential reloadClient() calls with different persisted endpoint
     * values, the repo is consulted both times — proving no stale caching occurs.
     */
    @Property(tries = 50)
    void property12b_reloadClientAlwaysReflectsMostRecentPersistedValue(
            @ForAll("endpointStrings") String firstEndpoint,
            @ForAll("endpointStrings") String secondEndpoint) {

        Assume.that(!firstEndpoint.equals(secondEndpoint));

        UtmConfigurationParameterRepository repoForLlm = mock(UtmConfigurationParameterRepository.class);
        when(repoForLlm.findByConfParamShort(HaLlmService.KEY_AI_API_KEY))
                .thenReturn(Optional.empty());

        // First persisted state
        UtmConfigurationParameter firstParam = param(HaLlmService.KEY_AI_ENDPOINT, firstEndpoint);
        when(repoForLlm.findByConfParamShort(HaLlmService.KEY_AI_ENDPOINT))
                .thenReturn(Optional.of(firstParam));

        HaLlmService llmService = new HaLlmService(repoForLlm);
        llmService.reloadClient();

        // Second persisted state
        UtmConfigurationParameter secondParam = param(HaLlmService.KEY_AI_ENDPOINT, secondEndpoint);
        when(repoForLlm.findByConfParamShort(HaLlmService.KEY_AI_ENDPOINT))
                .thenReturn(Optional.of(secondParam));

        llmService.reloadClient();

        // Verify the repo was consulted twice (once per reload)
        verify(repoForLlm, times(2)).findByConfParamShort(HaLlmService.KEY_AI_ENDPOINT);
    }

    // =========================================================================
    // Arbitraries (generators)
    // =========================================================================

    /** Generates non-empty strings that are not the masked sentinel "***". */
    @Provide
    Arbitrary<String> nonSentinelStrings() {
        return Arbitraries.strings()
                .withCharRange('a', 'z')
                .withCharRange('A', 'Z')
                .withCharRange('0', '9')
                .ofMinLength(8)
                .ofMaxLength(64)
                .filter(s -> !"***".equals(s) && !s.isBlank());
    }

    /** Generates realistic LLM provider names. */
    @Provide
    Arbitrary<String> providerStrings() {
        return Arbitraries.of("openai", "azure", "anthropic", "ollama", "custom", "");
    }

    /** Generates realistic model name strings. */
    @Provide
    Arbitrary<String> modelStrings() {
        return Arbitraries.of("gpt-4o", "gpt-4", "claude-3-opus", "mistral-7b", "llama3", "");
    }

    /** Generates URL-like endpoint strings (including empty for unconfigured state). */
    @Provide
    Arbitrary<String> endpointStrings() {
        return Arbitraries.of(
                "https://api.openai.com/v1",
                "https://api.anthropic.com/v1",
                "http://localhost:11434",
                "https://hivearmor-llm.internal/api",
                "https://azure.openai.hivearmor.com",
                ""
        );
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /** Creates a configuration parameter with the given key and value. */
    private static UtmConfigurationParameter param(String key, String value) {
        UtmConfigurationParameter p = new UtmConfigurationParameter();
        p.setSectionId(1L);
        p.setConfParamShort(key);
        p.setConfParamValue(value);
        p.setConfParamDatatype("string");
        p.setModificationTime(Instant.now());
        return p;
    }

    // =========================================================================
    // Logback capturing appender (for Property 4)
    // =========================================================================

    /**
     * In-memory Logback appender that collects log events for assertion.
     * Attached and detached around each property invocation to avoid cross-trial pollution.
     */
    static class CapturingAppender extends AppenderBase<ILoggingEvent> {
        private final List<ILoggingEvent> events = new ArrayList<>();

        @Override
        protected void append(ILoggingEvent event) {
            events.add(event);
        }

        List<ILoggingEvent> getEvents() {
            return List.copyOf(events);
        }
    }
}
