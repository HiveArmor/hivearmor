package com.hivearmor.service.dto;

/**
 * Immutable result DTO returned by the Sigma community rule sync endpoint.
 * Carries counts from a single sync run: rules processed from the archive,
 * new rows inserted, existing rows updated, and parse/processing errors.
 *
 * Requirement 2.13 — POST /api/ha-sigma/sync success body.
 * Requirement 5.2  — Java side of the SigmaSyncResultDTO contract.
 */
public class SigmaSyncResultDTO {

    private final int processed;
    private final int inserted;
    private final int updated;
    private final int errors;

    public SigmaSyncResultDTO(int processed, int inserted, int updated, int errors) {
        this.processed = processed;
        this.inserted = inserted;
        this.updated = updated;
        this.errors = errors;
    }

    /** Total number of rule YAML entries iterated from the archive. */
    public int getProcessed() {
        return processed;
    }

    /** Number of new rows inserted into ha_sigma_rule. */
    public int getInserted() {
        return inserted;
    }

    /** Number of existing rows updated in ha_sigma_rule. */
    public int getUpdated() {
        return updated;
    }

    /** Number of entries that could not be parsed or persisted. */
    public int getErrors() {
        return errors;
    }
}
