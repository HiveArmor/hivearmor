package com.hivearmor.service.dto.intelligence;

import java.util.List;

public record IntelligenceFindingDTO(
    Long id,
    String title,
    String summary,
    String answer,
    List<IntelligenceFactDTO> facts,
    List<IntelligenceInferenceDTO> inferences,
    List<IntelligenceInferenceDTO> contradictions,
    List<String> missingEvidence,
    double confidence,
    String confidenceExplanation,
    List<String> sources,
    String provenance,
    String contextType,
    String contextRef,
    String createdAt,
    String createdBy
) {}
