package com.hivearmor.web.rest.dto;

import java.util.List;

/**
 * DTO carrying the AI-generated summary for an incident.
 *
 * <p>The {@code riskLevel} field is normalised by {@code HaAiChatService.normalizeRiskLevel}
 * to always be a member of {@code {low, medium, high, critical}} before this record
 * is returned to callers.
 *
 * @param narrative        Free-text narrative description of the incident produced by the LLM.
 * @param threatActorType  Classification of the suspected threat actor (e.g. "APT", "Insider").
 * @param recommendedSteps Ordered list of analyst action items recommended by the LLM.
 * @param riskLevel        Normalised risk level — one of: low, medium, high, critical.
 */
public record AiIncidentSummaryDTO(
    String narrative,
    String threatActorType,
    List<String> recommendedSteps,
    String riskLevel
) {}
