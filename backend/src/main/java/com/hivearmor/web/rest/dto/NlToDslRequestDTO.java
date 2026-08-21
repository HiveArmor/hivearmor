package com.hivearmor.web.rest.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * DTO for a natural-language-to-DSL translation request.
 *
 * @param query        The analyst's plain-English search request — must not be blank
 *                     and must not exceed 500 characters.
 * @param indexPattern The OpenSearch index pattern to search against; when null or
 *                     blank the service falls back to the MSSP-resolved alert pattern.
 */
public record NlToDslRequestDTO(
    @NotBlank
    @Size(max = 500)
    String query,

    String indexPattern
) {}
