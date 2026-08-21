package com.hivearmor.ai;

/**
 * Thrown by {@link HaLlmService} when no AI provider is configured or when
 * the configured provider name equals the string {@code "disabled"}.
 *
 * <p>This exception is mapped to HTTP 503 by
 * {@code com.hivearmor.web.rest.errors.HaAiExceptionHandler}.
 */
public class LlmNotConfiguredException extends RuntimeException {

    public LlmNotConfiguredException(String message) {
        super(message);
    }

    public LlmNotConfiguredException(String message, Throwable cause) {
        super(message, cause);
    }
}
