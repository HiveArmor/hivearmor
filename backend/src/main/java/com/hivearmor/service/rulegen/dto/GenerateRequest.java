package com.hivearmor.service.rulegen.dto;

/**
 * Plain service-layer request for rule generation.
 *
 * <p>Decoupled from Jakarta validation concerns — produced by
 * {@link GenerateRequestDTO#toRequest()} after the controller layer
 * has validated the incoming payload.
 */
public record GenerateRequest(String signalKey, Long minCount) {}
