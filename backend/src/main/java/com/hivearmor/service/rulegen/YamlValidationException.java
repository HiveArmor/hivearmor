package com.hivearmor.service.rulegen;

import java.util.Set;

/**
 * Thrown when a YAML document fails structural validation — either the document
 * cannot be parsed by SnakeYAML or required top-level keys are missing/null.
 *
 * <p>This is an unchecked exception so callers can decide whether to propagate
 * or handle (e.g., retry the LLM call) without polluting method signatures.
 */
public class YamlValidationException extends RuntimeException {

    private final Set<String> missingKeys;

    public YamlValidationException(String message) {
        super(message);
        this.missingKeys = Set.of();
    }

    public YamlValidationException(String message, Throwable cause) {
        super(message, cause);
        this.missingKeys = Set.of();
    }

    public YamlValidationException(String message, Set<String> missingKeys) {
        super(message);
        this.missingKeys = missingKeys != null ? Set.copyOf(missingKeys) : Set.of();
    }

    /**
     * Returns the set of required keys that were missing from the YAML document.
     * Empty if the failure was a parse error rather than a missing-key error.
     */
    public Set<String> getMissingKeys() {
        return missingKeys;
    }
}
