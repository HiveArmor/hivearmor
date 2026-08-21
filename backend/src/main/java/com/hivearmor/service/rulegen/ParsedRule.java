package com.hivearmor.service.rulegen;

/**
 * Holds the result of a successful YAML parse-and-validate operation.
 *
 * @param name    the value of the {@code name} top-level key extracted from the YAML
 * @param rawText the original YAML text (preserved verbatim for storage and approval)
 */
public record ParsedRule(String name, String rawText) {
}
