package com.hivearmor.service.dto.admin;

/**
 * DTO for the AI/LLM settings tab.
 *
 * <h3>apiKey preservation rule (Req 2.7, 3.4)</h3>
 * <ul>
 *   <li>On {@code GET}: {@code apiKey} is always {@code "***"};
 *       {@code apiKeyTouched} is always {@code false}.</li>
 *   <li>On {@code PUT}: if {@code apiKeyTouched} is {@code false} or absent the
 *       service ignores the incoming {@code apiKey} and preserves the persisted value.
 *       If {@code apiKeyTouched} is {@code true} and {@code apiKey} equals {@code "***"}
 *       the service rejects the request with HTTP 400 / error-key {@code apiKey.invalid}.</li>
 * </ul>
 *
 * <p>Use {@link #masked()} to build a response-safe copy of this DTO before returning
 * it to callers (Req 3.2).
 */
public class SystemSettingsAiDTO {

    /** LLM provider identifier, e.g. {@code "openai"}, {@code "azure"}, {@code "ollama"}. */
    private String provider;

    /** Model name, e.g. {@code "gpt-4o"}, {@code "claude-3-opus-20240229"}. */
    private String model;

    /** Base URL of the LLM API endpoint. */
    private String endpoint;

    /**
     * LLM API key.
     *
     * <ul>
     *   <li>On GET: always {@code "***"} (masked)</li>
     *   <li>On PUT: respected only when {@code apiKeyTouched} is {@code true}.</li>
     * </ul>
     */
    private String apiKey;

    /**
     * Signals that the user deliberately provided a new API key value during the
     * current form session.  Defaults to {@code false}.
     *
     * <p>The frontend sets this to {@code true} only when the user edits the
     * {@code apiKey} field to a value that differs from the server-returned {@code "***"}
     * placeholder (Req 1.6).
     */
    private boolean apiKeyTouched = false;

    // -------------------------------------------------------------------------
    // Factory helpers
    // -------------------------------------------------------------------------

    /**
     * Returns a copy of this DTO with {@code apiKey} replaced by {@code "***"} and
     * {@code apiKeyTouched} reset to {@code false}, safe to return to callers (Req 3.2).
     */
    public SystemSettingsAiDTO masked() {
        SystemSettingsAiDTO copy = new SystemSettingsAiDTO();
        copy.provider      = this.provider;
        copy.model         = this.model;
        copy.endpoint      = this.endpoint;
        copy.apiKey        = "***";
        copy.apiKeyTouched = false;
        return copy;
    }

    // -------------------------------------------------------------------------
    // Accessors
    // -------------------------------------------------------------------------

    public String getProvider() {
        return provider;
    }

    public void setProvider(String provider) {
        this.provider = provider;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public String getEndpoint() {
        return endpoint;
    }

    public void setEndpoint(String endpoint) {
        this.endpoint = endpoint;
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    public boolean isApiKeyTouched() {
        return apiKeyTouched;
    }

    public void setApiKeyTouched(boolean apiKeyTouched) {
        this.apiKeyTouched = apiKeyTouched;
    }
}
