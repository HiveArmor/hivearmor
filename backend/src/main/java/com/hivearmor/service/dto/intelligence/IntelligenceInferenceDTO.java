package com.hivearmor.service.dto.intelligence;

public record IntelligenceInferenceDTO(
    Long id,
    String text,
    Double confidence
) {}
