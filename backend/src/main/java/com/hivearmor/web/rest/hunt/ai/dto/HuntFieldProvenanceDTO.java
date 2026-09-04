package com.hivearmor.web.rest.hunt.ai.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Per-field provenance for the "show AI's hand" lens (frozen contract {@code HuntFieldProvenance},
 * HUNT-AI-CONTRACT §4). {@code origin} is raw | enrichment | model — only enrichment/model get the
 * violet thread + ✦ in the grid; raw log fields get none. {@code agent} names the producer for
 * non-raw fields.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record HuntFieldProvenanceDTO(String field, String origin, String agent) {

    public static HuntFieldProvenanceDTO raw(String field) {
        return new HuntFieldProvenanceDTO(field, "raw", null);
    }

    public static HuntFieldProvenanceDTO of(String field, String origin, String agent) {
        return new HuntFieldProvenanceDTO(field, origin, agent);
    }
}
