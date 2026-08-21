package com.hivearmor.service.hunt.dto;

import java.util.List;

/**
 * Request DTO for the detection exception preview endpoint.
 *
 * <p>Contains the proposed exception condition as a list of field/operator/value tuples.
 * The client submits this when requesting a read-only impact analysis of a proposed
 * detection rule exception.
 *
 * <p>Sprint 37 — ALT-021 (Requirement 2.2).
 */
public record ExceptionPreviewRequest(
    List<ConditionTuple> conditions
) {}
