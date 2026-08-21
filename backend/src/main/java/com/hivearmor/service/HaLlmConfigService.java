package com.hivearmor.service;

import com.hivearmor.domain.UtmConfigurationParameter;
import com.hivearmor.repository.UtmConfigurationParameterRepository;
import com.hivearmor.service.dto.admin.LlmConfigUpdateDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

/**
 * Upsert helper for LLM configuration rows in {@code hive_configuration_parameter}.
 *
 * <p>Writes all six well-known LLM config rows in a single transaction, using the same
 * find-then-update-or-insert pattern established by {@link HivePlatformSettingsService}.
 * The caller ({@code HaLlmAdminResource}) publishes a {@code LlmConfigChangedEvent}
 * <em>after</em> this method returns so the event fires only on a consistent, fully-written
 * state.
 *
 * <h3>Row-to-field mapping</h3>
 * <table>
 *   <tr><th>conf_param_short</th><th>DTO field</th></tr>
 *   <tr><td>LLM_PROVIDER</td>    <td>{@link LlmConfigUpdateDTO#provider()}</td></tr>
 *   <tr><td>LLM_BASE_URL</td>    <td>{@link LlmConfigUpdateDTO#baseUrl()}</td></tr>
 *   <tr><td>LLM_MODEL</td>       <td>{@link LlmConfigUpdateDTO#model()}</td></tr>
 *   <tr><td>LLM_API_KEY</td>     <td>{@link LlmConfigUpdateDTO#apiKey()}</td></tr>
 *   <tr><td>LLM_TEMPERATURE</td> <td>{@link LlmConfigUpdateDTO#temperature()}</td></tr>
 *   <tr><td>LLM_MAX_TOKENS</td>  <td>{@link LlmConfigUpdateDTO#maxTokens()}</td></tr>
 * </table>
 *
 * <p>Requirements: 6.2
 */
@Service
@Transactional
public class HaLlmConfigService {

    private static final Logger log = LoggerFactory.getLogger(HaLlmConfigService.class);

    // ---- well-known parameter short-keys ----
    static final String KEY_LLM_PROVIDER    = "LLM_PROVIDER";
    static final String KEY_LLM_BASE_URL    = "LLM_BASE_URL";
    static final String KEY_LLM_MODEL       = "LLM_MODEL";
    static final String KEY_LLM_API_KEY     = "LLM_API_KEY";
    static final String KEY_LLM_TEMPERATURE = "LLM_TEMPERATURE";
    static final String KEY_LLM_MAX_TOKENS  = "LLM_MAX_TOKENS";

    private final UtmConfigurationParameterRepository configRepo;

    public HaLlmConfigService(UtmConfigurationParameterRepository configRepo) {
        this.configRepo = configRepo;
    }

    /**
     * Persists all six LLM configuration rows in a single transaction.
     *
     * <p>Each row is upserted: if a row with the given {@code conf_param_short} already exists
     * it is updated in place; otherwise a new row is inserted.  Numeric fields
     * ({@code temperature}, {@code maxTokens}) are converted to their string representation
     * before storage.  Null values are written as-is — callers are expected to pass validated
     * DTOs so no field should be null for a provider that requires it.
     *
     * @param dto the validated update DTO; must not be {@code null}
     *
     * <p>Requirements: 6.2
     */
    public void persist(LlmConfigUpdateDTO dto) {
        log.debug("HaLlmConfigService.persist — writing LLM configuration rows for provider={}",
                dto.provider());

        upsert(KEY_LLM_PROVIDER,    dto.provider());
        upsert(KEY_LLM_BASE_URL,    dto.baseUrl());
        upsert(KEY_LLM_MODEL,       dto.model());
        upsert(KEY_LLM_API_KEY,     dto.apiKey());
        upsert(KEY_LLM_TEMPERATURE, dto.temperature()  != null ? String.valueOf(dto.temperature())  : null);
        upsert(KEY_LLM_MAX_TOKENS,  dto.maxTokens()    != null ? String.valueOf(dto.maxTokens())    : null);

        log.debug("HaLlmConfigService.persist — all six LLM rows written successfully");
    }

    // ---- helpers ----

    /**
     * Upsert a single {@code hive_configuration_parameter} row.
     *
     * <p>Mirrors the upsert helper in {@link HivePlatformSettingsService}: look up the
     * existing row by {@code conf_param_short}; update its value if found, otherwise build
     * and insert a new row.  The {@code modification_time} is always stamped to {@code now()}.
     *
     * @param key   the {@code conf_param_short} value; must not be {@code null}
     * @param value the new {@code conf_param_value}; may be {@code null}
     */
    private void upsert(String key, String value) {
        if (key == null) return;

        Optional<UtmConfigurationParameter> existing = configRepo.findByConfParamShort(key);
        UtmConfigurationParameter param = existing.orElseGet(() -> {
            UtmConfigurationParameter p = new UtmConfigurationParameter();
            p.setSectionId(1L);                 // default section — consistent with HivePlatformSettingsService
            p.setConfParamShort(key);
            p.setConfParamDatatype("string");
            return p;
        });

        param.setConfParamValue(value);
        param.setModificationTime(Instant.now());
        configRepo.save(param);
    }
}
