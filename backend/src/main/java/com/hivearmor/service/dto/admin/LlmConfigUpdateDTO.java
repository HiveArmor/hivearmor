package com.hivearmor.service.dto.admin;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Request DTO for {@code POST /api/ha-admin/llm/config}.
 *
 * <p>Carries the full LLM configuration update. All six fields map directly to their
 * corresponding rows in {@code hive_configuration_parameter}:
 *
 * <pre>
 *   provider    → LLM_PROVIDER
 *   baseUrl     → LLM_BASE_URL
 *   model       → LLM_MODEL
 *   apiKey      → LLM_API_KEY
 *   temperature → LLM_TEMPERATURE
 *   maxTokens   → LLM_MAX_TOKENS
 * </pre>
 *
 * <p>Bean Validation is enforced at the controller via {@code @Valid}. A successful
 * persist fires exactly one {@link com.hivearmor.service.llm.event.LlmConfigChangedEvent}
 * on the Spring application event bus, triggering a provider hot-reload.
 *
 * @param provider    required; must be one of {@code disabled}, {@code openai},
 *                    {@code azure}, or {@code ollama}
 * @param baseUrl     optional provider base URL; max 512 characters
 * @param model       optional model name; max 128 characters
 * @param apiKey      optional API key or bearer token; max 4096 characters
 * @param temperature optional sampling temperature in the range [0.0, 2.0]
 * @param maxTokens   optional maximum response token count in the range [1, 32768]
 *
 * <p>Requirements: 6.1, 6.2
 */
public record LlmConfigUpdateDTO(

        @NotBlank
        @Pattern(regexp = "disabled|openai|azure|ollama")
        String provider,

        @Size(max = 512)
        String baseUrl,

        @Size(max = 128)
        String model,

        @Size(max = 4096)
        String apiKey,

        @DecimalMin("0.0")
        @DecimalMax("2.0")
        Double temperature,

        @Min(1)
        @Max(32768)
        Integer maxTokens

) {}
