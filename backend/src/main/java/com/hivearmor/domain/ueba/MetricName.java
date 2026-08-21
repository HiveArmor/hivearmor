package com.hivearmor.domain.ueba;

/**
 * Enumeration of the five behavioral metrics tracked by the UEBA baseline engine.
 *
 * <p>These correspond exactly to the {@code Metric_Set} defined in the Sprint 29 requirements.
 * Each value is persisted as its lowercase name in the {@code metric_name} column
 * of the {@code ha_ueba_baseline} and {@code ha_ueba_deviation} tables.
 *
 * <p>The set is fixed by Requirement 2.4 and MUST NOT be extended without a schema change.
 */
public enum MetricName {

    /** Daily logon count for the user. */
    logon_count_per_day,

    /** Count of unique source IP addresses observed for the user. */
    unique_src_ips,

    /** Total data volume in bytes transferred by the user. */
    data_volume_bytes,

    /** Count of logon events occurring outside business hours. */
    after_hours_logons,

    /** Ratio of failed logon attempts to total logon attempts. */
    failed_logon_ratio
}
