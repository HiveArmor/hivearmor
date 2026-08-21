package com.hivearmor.service.hunt.dto;

import java.util.List;

/**
 * Request DTO for the suppression preview endpoint.
 *
 * <p>Contains the proposed suppression condition as a list of field/operator/value tuples.
 * The client submits this when requesting a read-only impact analysis of a proposed
 * suppression rule.
 *
 * <p>Sprint 37 — ALT-021 (Requirement 2.1).
 */
public record SuppressionPreviewRequest(
    List<ConditionTuple> conditions
) {}
