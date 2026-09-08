package com.hivearmor.service.hunt.crosstab;

/**
 * Why a field is or is not usable as a crosstab dimension / distinct measure.
 *
 * <p>PR-A P1. Computed by the backend field-capability resolver (authoritative — the browser only
 * learns "can this field be used?" plus this reason, never the physical aggregation path).
 */
public enum CrosstabCapabilityReason {

    /** The field can be used (axisAllowed = true). */
    OK,

    /** The field is not aggregatable (e.g. analyzed text without a keyword sub-field). */
    NOT_AGGREGATABLE,

    /** A date/time field: usable only with bucketing, which is not offered in P1. */
    DATE_REQUIRES_BUCKETING,

    /** The field is not present in the mapping. */
    UNMAPPED,

    /** The field maps to conflicting types across the resolved indices. */
    MAPPING_CONFLICT,

    /** The field's type is not supported as a crosstab dimension/measure. */
    UNSUPPORTED_TYPE
}
