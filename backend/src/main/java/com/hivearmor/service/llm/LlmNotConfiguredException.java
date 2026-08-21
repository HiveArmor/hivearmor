package com.hivearmor.service.llm;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * Thrown when a caller attempts to use an LLM provider that is not configured.
 * Annotated with {@code @ResponseStatus(HttpStatus.SERVICE_UNAVAILABLE)} so that
 * Spring MVC automatically translates this exception to an HTTP 503 response when
 * it propagates out of a controller.
 *
 * <p>Validates: Requirement 1.3</p>
 */
@ResponseStatus(HttpStatus.SERVICE_UNAVAILABLE)
public class LlmNotConfiguredException extends RuntimeException {

    public LlmNotConfiguredException(String provider) {
        super("LLM provider '" + provider + "' is not configured");
    }
}
