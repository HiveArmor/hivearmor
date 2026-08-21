package com.hivearmor.web.rest.errors;

import com.hivearmor.ai.LlmNotConfiguredException;
import org.springframework.core.annotation.Order;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;

import java.util.Map;

/**
 * Maps {@link LlmNotConfiguredException} to an HTTP 503 response with a plain
 * JSON body.
 *
 * <p>Because AI chat endpoints are reactive ({@code Flux<String>}), the exception
 * is thrown during subscription. Spring's reactive error pipeline routes it to this
 * {@code @ControllerAdvice} handler before any SSE frame is written, so clients
 * receive an HTTP 503 with a JSON body instead of a partial SSE stream.
 *
 * <p>Requirements: 6.2, 6.3, 13.7
 */
@ControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class HaAiExceptionHandler {

    /**
     * Handles {@link LlmNotConfiguredException} thrown by any AI endpoint.
     *
     * @param ex the exception (unused beyond triggering this handler)
     * @return 503 Service Unavailable with a user-facing error message
     */
    @ExceptionHandler(LlmNotConfiguredException.class)
    public ResponseEntity<Map<String, String>> handleLlmNotConfigured(
            LlmNotConfiguredException ex) {
        return ResponseEntity
                .status(HttpStatus.SERVICE_UNAVAILABLE)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of(
                        "error",
                        "AI features are disabled — configure an AI provider in Admin → Settings"));
    }
}
