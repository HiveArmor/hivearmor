package com.hivearmor.service.admin;

import com.hivearmor.domain.UtmConfigurationParameter;
import com.hivearmor.repository.UtmConfigurationParameterRepository;
import com.hivearmor.service.dto.admin.SystemSettingsAiDTO;
import com.hivearmor.service.dto.admin.SystemSettingsDTO;
import com.hivearmor.service.dto.admin.SystemSettingsEmailDTO;
import com.hivearmor.service.dto.admin.SystemSettingsGeneralDTO;
import com.hivearmor.service.dto.admin.SystemSettingsSecurityDTO;
import com.hivearmor.util.crypto.HaCipherUtil;
import com.hivearmor.web.rest.errors.BadRequestAlertException;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Service backing {@code /api/ha-admin/settings/*}.
 *
 * <h3>Persistence model</h3>
 * All settings are stored as rows in the {@code hive_configuration_parameter} table
 * via the existing {@link UtmConfigurationParameterRepository}, using the well-known
 * key constants below.  This matches the pattern used by
 * {@link com.hivearmor.service.HivePlatformSettingsService}.
 *
 * <h3>Secret hygiene (Req 3.1, 3.2, 3.3, 3.5)</h3>
 * <ul>
 *   <li>{@code ai.apiKey} and {@code smtp.password} are persisted AES-encrypted via
 *       {@link HaCipherUtil}.</li>
 *   <li>{@link #getMasked()} always returns {@code "***"} for both fields; it never
 *       decrypts them.</li>
 *   <li>No plaintext secret value is ever written to a log statement at any level.</li>
 * </ul>
 *
 * <h3>apiKey preservation rule (Req 2.7, 3.4)</h3>
 * <p>{@link #updateAi(SystemSettingsAiDTO)} applies the following logic:
 * <ol>
 *   <li>If {@code apiKeyTouched} is {@code false} or absent → discard the incoming
 *       {@code apiKey}; keep the persisted value unchanged.</li>
 *   <li>If {@code apiKeyTouched} is {@code true} and {@code apiKey.equals("***")} →
 *       reject with HTTP 400, error key {@code apiKey.invalid}.</li>
 *   <li>If {@code apiKeyTouched} is {@code true} and {@code apiKey} is a non-sentinel
 *       value → encrypt and persist the new key.</li>
 * </ol>
 */
@Service
@Transactional
@RequiredArgsConstructor
public class HaSystemSettingsService {

    private static final Logger log = LoggerFactory.getLogger(HaSystemSettingsService.class);

    // ---- General ----
    static final String KEY_SITE_NAME      = "hivearmor.system.siteName";
    static final String KEY_TIMEZONE       = "hivearmor.system.timezone";
    static final String KEY_DEFAULT_LOCALE = "hivearmor.system.defaultLocale";

    // ---- Email/SMTP ----
    static final String KEY_SMTP_HOST     = "hivearmor.smtp.host";
    static final String KEY_SMTP_PORT     = "hivearmor.smtp.port";
    static final String KEY_SMTP_USERNAME = "hivearmor.smtp.username";
    /** Stored encrypted (datatype "password"). Decrypted only at send time, never in GET. */
    static final String KEY_SMTP_PASSWORD = "hivearmor.smtp.password";
    static final String KEY_SMTP_FROM     = "hivearmor.smtp.from";
    static final String KEY_SMTP_USE_TLS  = "hivearmor.smtp.useTls";

    // ---- AI/LLM (mirrors keys used in HaLlmService) ----
    static final String KEY_AI_PROVIDER = "hivearmor.ai.provider";
    static final String KEY_AI_MODEL    = "hivearmor.ai.model";
    static final String KEY_AI_ENDPOINT = "hivearmor.ai.endpoint";
    /** Stored encrypted (datatype "password"). */
    static final String KEY_AI_API_KEY  = "hivearmor.ai.apiKey";

    // ---- Security ----
    static final String KEY_SESSION_TIMEOUT   = "hivearmor.security.sessionTimeoutMinutes";
    static final String KEY_MFA_REQUIRED      = "hivearmor.security.mfaRequired";
    static final String KEY_PASSWORD_MIN_LEN  = "hivearmor.security.passwordMinLength";

    /** Default section ID used when creating new configuration rows. */
    private static final Long DEFAULT_SECTION_ID = 1L;

    /** The sentinel value that always hides secret fields in GET responses. */
    static final String MASKED = "***";

    private final UtmConfigurationParameterRepository configRepo;
    private final HaCipherUtil cipher;

    // =========================================================================
    // GET (masked)
    // =========================================================================

    /**
     * Returns the complete settings aggregate with all secret fields replaced by
     * {@code "***"} (Req 3.2, 3.3).
     *
     * <p>This method never decrypts stored secrets; it always returns the sentinel
     * string for {@code ai.apiKey} and {@code smtp.password}.
     *
     * @return masked settings DTO; never {@code null}
     */
    @Transactional(readOnly = true)
    public SystemSettingsDTO getMasked() {
        Map<String, String> params = loadAllAsMap();

        SystemSettingsGeneralDTO general = new SystemSettingsGeneralDTO();
        general.setSiteName(params.getOrDefault(KEY_SITE_NAME, "HiveArmor"));
        general.setTimezone(params.getOrDefault(KEY_TIMEZONE, "UTC"));
        general.setDefaultLocale(params.getOrDefault(KEY_DEFAULT_LOCALE, "en"));

        SystemSettingsEmailDTO email = new SystemSettingsEmailDTO();
        email.setHost(params.getOrDefault(KEY_SMTP_HOST, ""));
        email.setPort(parseInt(params.get(KEY_SMTP_PORT), 25));
        email.setUsername(params.getOrDefault(KEY_SMTP_USERNAME, ""));
        email.setPassword(MASKED);   // never return the decrypted value (Req 3.3)
        email.setFrom(params.getOrDefault(KEY_SMTP_FROM, ""));
        email.setUseTls(parseBool(params.get(KEY_SMTP_USE_TLS), false));

        SystemSettingsAiDTO ai = new SystemSettingsAiDTO();
        ai.setProvider(params.getOrDefault(KEY_AI_PROVIDER, ""));
        ai.setModel(params.getOrDefault(KEY_AI_MODEL, ""));
        ai.setEndpoint(params.getOrDefault(KEY_AI_ENDPOINT, ""));
        ai.setApiKey(MASKED);        // never return the decrypted value (Req 3.2)
        ai.setApiKeyTouched(false);

        SystemSettingsSecurityDTO security = new SystemSettingsSecurityDTO();
        security.setSessionTimeoutMinutes(parseInt(params.get(KEY_SESSION_TIMEOUT), 60));
        security.setMfaRequired(parseBool(params.get(KEY_MFA_REQUIRED), false));
        security.setPasswordMinLength(parseInt(params.get(KEY_PASSWORD_MIN_LEN), 8));

        SystemSettingsDTO dto = new SystemSettingsDTO();
        dto.setGeneral(general);
        dto.setEmail(email);
        dto.setAi(ai);
        dto.setSecurity(security);
        return dto;
    }

    // =========================================================================
    // UPDATE — AI/LLM
    // =========================================================================

    /**
     * Persists updated AI/LLM settings, applying the apiKey preservation rule.
     *
     * <p>apiKey preservation rule (Req 2.7, 3.4):
     * <ul>
     *   <li>If {@code apiKeyTouched} is {@code false} or absent the incoming
     *       {@code apiKey} is discarded; the persisted value remains unchanged.</li>
     *   <li>If {@code apiKeyTouched} is {@code true} and {@code apiKey.equals("***")}
     *       the request is rejected with HTTP 400 / error-key {@code apiKey.invalid}.</li>
     *   <li>Otherwise the new key is encrypted and persisted.</li>
     * </ul>
     *
     * @param dto the incoming AI settings; must not be {@code null}
     * @return the persisted state with {@code apiKey} masked as {@code "***"}
     * @throws BadRequestAlertException if {@code apiKeyTouched=true && apiKey=="***"}
     */
    public SystemSettingsAiDTO updateAi(SystemSettingsAiDTO dto) {
        if (dto == null) {
            throw new IllegalArgumentException("HaSystemSettingsService.updateAi: dto must not be null");
        }

        // Enforce apiKey.invalid guard (Req 3.4)
        if (dto.isApiKeyTouched() && MASKED.equals(dto.getApiKey())) {
            throw new BadRequestAlertException(
                "Submitted apiKey is invalid: apiKeyTouched is true but apiKey value is '***'",
                "systemSettings",
                "apiKey.invalid"
            );
        }

        upsert(KEY_AI_PROVIDER, dto.getProvider(), false);
        upsert(KEY_AI_MODEL,    dto.getModel(),    false);
        upsert(KEY_AI_ENDPOINT, dto.getEndpoint(), false);

        // apiKey: only persist if the user explicitly touched the field (Req 2.7)
        if (dto.isApiKeyTouched()) {
            String newKey = dto.getApiKey();
            if (StringUtils.hasText(newKey)) {
                // Encrypt before storing (Req 3.1) — do not log the plaintext value
                upsert(KEY_AI_API_KEY, cipher.encrypt(newKey), false);
            }
        }
        // If apiKeyTouched is false, the KEY_AI_API_KEY row is left untouched.

        return getMasked().getAi();
    }

    // =========================================================================
    // UPDATE — Email/SMTP
    // =========================================================================

    /**
     * Persists updated Email/SMTP settings.
     *
     * <p>Password preservation rule: if the submitted {@code password} equals
     * {@code "***"} the persisted value is not overwritten, matching the same
     * sentinel-based preservation logic used for the AI API key.
     *
     * @param dto the incoming email settings; must not be {@code null}
     * @return the persisted state with {@code password} masked as {@code "***"}
     */
    public SystemSettingsEmailDTO updateEmail(SystemSettingsEmailDTO dto) {
        if (dto == null) {
            throw new IllegalArgumentException("HaSystemSettingsService.updateEmail: dto must not be null");
        }

        upsert(KEY_SMTP_HOST,    dto.getHost(),    false);
        upsert(KEY_SMTP_PORT,    String.valueOf(dto.getPort()), false);
        upsert(KEY_SMTP_USERNAME, dto.getUsername(), false);
        upsert(KEY_SMTP_FROM,    dto.getFrom(),    false);
        upsert(KEY_SMTP_USE_TLS, boolStr(dto.isUseTls()), false);

        // Only overwrite the stored password if the caller sent a real value
        // (i.e. not the sentinel "***"). Secret is encrypted at rest (Req 3.1).
        String submittedPassword = dto.getPassword();
        if (StringUtils.hasText(submittedPassword) && !MASKED.equals(submittedPassword)) {
            // Encrypt before storing (Req 3.1) — never log the plaintext value
            upsert(KEY_SMTP_PASSWORD, cipher.encrypt(submittedPassword), false);
        }

        return getMasked().getEmail();
    }

    // =========================================================================
    // UPDATE — General
    // =========================================================================

    /**
     * Persists updated General settings.
     *
     * @param dto the incoming general settings; must not be {@code null}
     * @return the persisted state
     */
    public SystemSettingsGeneralDTO updateGeneral(SystemSettingsGeneralDTO dto) {
        if (dto == null) {
            throw new IllegalArgumentException("HaSystemSettingsService.updateGeneral: dto must not be null");
        }

        upsert(KEY_SITE_NAME,      dto.getSiteName(),      false);
        upsert(KEY_TIMEZONE,       dto.getTimezone(),       false);
        upsert(KEY_DEFAULT_LOCALE, dto.getDefaultLocale(),  false);

        return getMasked().getGeneral();
    }

    // =========================================================================
    // UPDATE — Security
    // =========================================================================

    /**
     * Persists updated Security settings.
     *
     * @param dto the incoming security settings; must not be {@code null}
     * @return the persisted state
     */
    public SystemSettingsSecurityDTO updateSecurity(SystemSettingsSecurityDTO dto) {
        if (dto == null) {
            throw new IllegalArgumentException("HaSystemSettingsService.updateSecurity: dto must not be null");
        }

        upsert(KEY_SESSION_TIMEOUT,  String.valueOf(dto.getSessionTimeoutMinutes()), false);
        upsert(KEY_MFA_REQUIRED,     boolStr(dto.isMfaRequired()),                   false);
        upsert(KEY_PASSWORD_MIN_LEN, String.valueOf(dto.getPasswordMinLength()),      false);

        return getMasked().getSecurity();
    }

    // =========================================================================
    // Internals
    // =========================================================================

    private Map<String, String> loadAllAsMap() {
        List<UtmConfigurationParameter> all = configRepo.findAll();
        return all.stream()
            .filter(p -> p.getConfParamShort() != null && p.getConfParamValue() != null)
            .collect(Collectors.toMap(
                UtmConfigurationParameter::getConfParamShort,
                UtmConfigurationParameter::getConfParamValue,
                (a, b) -> b  // last-write-wins on duplicates
            ));
    }

    /**
     * Upserts a configuration parameter row.
     *
     * @param key       the well-known parameter key
     * @param value     the value to persist (may be {@code null} to clear)
     * @param encrypted {@code true} if {@code value} is already encrypted (not used
     *                  in this method — callers encrypt before calling)
     */
    private void upsert(String key, String value, @SuppressWarnings("unused") boolean encrypted) {
        if (key == null) return;
        Optional<UtmConfigurationParameter> existing = configRepo.findByConfParamShort(key);
        UtmConfigurationParameter param = existing.orElseGet(() -> {
            UtmConfigurationParameter p = new UtmConfigurationParameter();
            p.setSectionId(DEFAULT_SECTION_ID);
            p.setConfParamShort(key);
            p.setConfParamDatatype("string");
            return p;
        });
        param.setConfParamValue(value);
        param.setModificationTime(Instant.now());
        configRepo.save(param);
    }

    // ---- Type-coercion helpers ----

    private static boolean parseBool(String value, boolean defaultVal) {
        if (value == null) return defaultVal;
        return "true".equalsIgnoreCase(value) || "1".equals(value);
    }

    private static int parseInt(String value, int defaultVal) {
        if (value == null) return defaultVal;
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return defaultVal;
        }
    }

    private static String boolStr(boolean value) {
        return value ? "true" : "false";
    }
}
