package com.hivearmor.web.rest.hunt.ai.dto;

/**
 * Trust-calibration block (frozen contract {@code AiCalibration}, HUNT-AI-CONTRACT §2).
 *
 * <p>Pairs an AI confidence score with the agent's track record so a confidence value never
 * stands alone. {@code agreementRate} is a 0..1 float; {@code overrideTrend} is up|flat|down.
 * On cold start (few or no feedback rows) {@code sampleSize} is low and the UI styles it as
 * "limited history" — the number is shown honestly, never fabricated.
 */
public record AiCalibrationDTO(
    double agreementRate,
    long sampleSize,
    String window,
    String scope,
    String overrideTrend
) {}
