package com.hivearmor.service.search;

/**
 * Unchecked exception thrown by {@link NlSearchDslValidator} when a
 * generated OpenSearch DSL fails structural validation (length bound,
 * JSON well-formedness, required top-level key, or blocklist match).
 *
 * <p>The exception message MUST only carry a short, non-revealing
 * category label (e.g. {@code "DSL validation failed: blocklisted
 * construct"}). It MUST NEVER contain the raw DSL body, the caller's
 * user input, or any other content that could leak the failing payload
 * to logs, error responses, or the LLM prompt path. Callers are
 * responsible for logging the failure reason separately (typically the
 * authenticated username plus the exception message) at WARN level.
 *
 * <p>This exception is intentionally unchecked so it can propagate out
 * of validator calls without polluting method signatures, and does not
 * expose a {@code cause}-taking constructor to prevent inadvertent
 * wrapping of upstream exceptions that may themselves contain the raw
 * DSL body.
 */
public class NlSearchSecurityException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public NlSearchSecurityException(String message) {
        super(message);
    }
}
