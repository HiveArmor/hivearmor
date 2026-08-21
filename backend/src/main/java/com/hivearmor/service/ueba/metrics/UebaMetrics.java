package com.hivearmor.service.ueba.metrics;

import java.util.Set;

/**
 * Constants for the five behavioral metrics tracked by the UEBA baseline engine.
 *
 * <p>Corresponds exactly to {@code Metric_Set} defined in Sprint 29 requirements.
 * The set is fixed by Requirement 2.4 and MUST NOT be extended without a schema change.
 */
public final class UebaMetrics {

    public static final String LOGON_COUNT_PER_DAY = "logon_count_per_day";
    public static final String UNIQUE_SRC_IPS      = "unique_src_ips";
    public static final String DATA_VOLUME_BYTES   = "data_volume_bytes";
    public static final String AFTER_HOURS_LOGONS  = "after_hours_logons";
    public static final String FAILED_LOGON_RATIO  = "failed_logon_ratio";

    public static final Set<String> METRIC_SET = Set.of(
        LOGON_COUNT_PER_DAY, UNIQUE_SRC_IPS, DATA_VOLUME_BYTES,
        AFTER_HOURS_LOGONS, FAILED_LOGON_RATIO
    );

    private UebaMetrics() {
        // utility class
    }
}
