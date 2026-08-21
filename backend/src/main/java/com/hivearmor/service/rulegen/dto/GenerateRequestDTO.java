package com.hivearmor.service.rulegen.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

/**
 * Request body DTO for the rule generation endpoint.
 *
 * <p>Validated by Jakarta Bean Validation constraints before reaching
 * the service layer. Converts to a plain {@link GenerateRequest} for
 * internal service consumption.
 */
public record GenerateRequestDTO(
    @NotBlank String signalKey,
    @Min(1) Long minCount
) {

    /**
     * Converts this validated DTO into a plain service-layer request.
     *
     * @return a new {@link GenerateRequest} with the same field values
     */
    public GenerateRequest toRequest() {
        return new GenerateRequest(signalKey, minCount);
    }
}
