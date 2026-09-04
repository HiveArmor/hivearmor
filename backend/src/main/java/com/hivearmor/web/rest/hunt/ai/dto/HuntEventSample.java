package com.hivearmor.web.rest.hunt.ai.dto;

/**
 * Minimal event projection the verdict service reasons over (clustering + prompt).
 * Decouples the AI layer from the full {@code HuntEventDTO}; the resource adapts real events
 * (or the mock, in contract-first mode) into this shape.
 */
public record HuntEventSample(
    String id,
    String timestamp,
    String severity,
    String category,
    String action,
    String user,
    String sourceIp,
    String message
) {}
