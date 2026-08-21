package com.hivearmor.service.rulegen;

/**
 * Thrown when rule generation fails — covers YAML parse/validation failures
 * after retry exhaustion, LLM communication errors, and other unrecoverable
 * conditions during the rule generation workflow.
 *
 * <p>This is an unchecked exception. The REST layer translates it into an
 * appropriate HTTP error response.
 */
public class RuleGenerationException extends RuntimeException {

    public RuleGenerationException(String message) {
        super(message);
    }

    public RuleGenerationException(String message, Throwable cause) {
        super(message, cause);
    }
}
