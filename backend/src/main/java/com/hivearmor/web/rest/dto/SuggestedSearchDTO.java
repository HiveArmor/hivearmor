package com.hivearmor.web.rest.dto;

/**
 * DTO representing a single AI-generated or static suggested search.
 *
 * @param label       Human-readable display name for the suggestion, e.g.
 *                    {@code "Failed logins in last hour"}.
 * @param dsl         Compact JSON string representing the pre-built OpenSearch query
 *                    DSL object ready for execution.
 * @param description One-sentence explanation of what the suggestion detects or shows.
 */
public record SuggestedSearchDTO(String label, String dsl, String description) {}
