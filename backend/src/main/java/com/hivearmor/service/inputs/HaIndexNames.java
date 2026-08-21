package com.hivearmor.service.inputs;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

/**
 * HiveArmor index-name builder helpers for the inputs service layer.
 *
 * <p>All OpenSearch index names in HiveArmor follow the immutable pattern:
 * <pre>
 *   Standard:        v3-hive-&lt;type&gt;-YYYY.MM.DD
 *   Wildcard:        v3-hive-&lt;type&gt;-*
 *   Tenant standard: v3-hive-&lt;type&gt;-&lt;tenantPrefix&gt;-YYYY.MM.DD
 *   Tenant wildcard: v3-hive-&lt;type&gt;-&lt;tenantPrefix&gt;-*
 * </pre>
 *
 * <p>This class mirrors the Go SDK functions
 * {@code BuildCurrentDayIndex}, {@code BuildIndexPattern},
 * {@code BuildTenantIndex}, and {@code BuildTenantIndexPattern} so that the Java
 * backend never constructs index names by inline string concatenation.
 *
 * <p>Callers should always use these methods instead of concatenating
 * {@code "v3-hive-"} directly — doing so would violate the platform invariant
 * documented in the HiveArmor steering rules and Requirement 8.5.
 *
 * <p>Requirements: 8.5, 13.1
 */
public final class HaIndexNames {

    private static final String INDEX_PREFIX = "v3-hive-";
    private static final DateTimeFormatter DATE_FMT =
            DateTimeFormatter.ofPattern("yyyy.MM.dd");

    private HaIndexNames() {
        // utility class — do not instantiate
    }

    /**
     * Builds the today's index name for the given data type.
     *
     * <p>Example: {@code buildCurrentDayIndex("log")} → {@code "v3-hive-log-2026.07.25"}
     *
     * @param dataType the index data type (e.g. "log", "alert", "event")
     * @return the standard single-day index name
     */
    public static String buildCurrentDayIndex(String dataType) {
        String today = LocalDate.now(ZoneOffset.UTC).format(DATE_FMT);
        return INDEX_PREFIX + dataType + "-" + today;
    }

    /**
     * Builds a wildcard index pattern for the given data type.
     *
     * <p>Example: {@code buildIndexPattern("log")} → {@code "v3-hive-log-*"}
     *
     * @param dataType the index data type (e.g. "log", "alert", "event")
     * @return the wildcard index pattern
     */
    public static String buildIndexPattern(String dataType) {
        return INDEX_PREFIX + dataType + "-*";
    }

    /**
     * Builds a single-day tenant-scoped index name.
     *
     * <p>When {@code tenantPrefix} is blank or {@code null}, the standard
     * (non-tenant) index name is returned — identical to
     * {@link #buildCurrentDayIndex(String)}.
     *
     * <p>Example: {@code buildTenantIndex("log", "acme")}
     *    → {@code "v3-hive-log-acme-2026.07.25"}
     *
     * @param dataType     the index data type
     * @param tenantPrefix the MSSP tenant prefix; blank/null for single-tenant
     * @return the tenant-scoped (or standard) single-day index name
     */
    public static String buildTenantIndex(String dataType, String tenantPrefix) {
        if (tenantPrefix == null || tenantPrefix.isBlank()) {
            return buildCurrentDayIndex(dataType);
        }
        String today = LocalDate.now(ZoneOffset.UTC).format(DATE_FMT);
        return INDEX_PREFIX + dataType + "-" + tenantPrefix + "-" + today;
    }

    /**
     * Builds a wildcard tenant-scoped index pattern.
     *
     * <p>When {@code tenantPrefix} is blank or {@code null}, the standard
     * wildcard pattern is returned — identical to {@link #buildIndexPattern(String)}.
     *
     * <p>Example: {@code buildTenantIndexPattern("log", "acme")}
     *    → {@code "v3-hive-log-acme-*"}
     *
     * @param dataType     the index data type
     * @param tenantPrefix the MSSP tenant prefix; blank/null for single-tenant
     * @return the tenant-scoped (or standard) wildcard index pattern
     */
    public static String buildTenantIndexPattern(String dataType, String tenantPrefix) {
        if (tenantPrefix == null || tenantPrefix.isBlank()) {
            return buildIndexPattern(dataType);
        }
        return INDEX_PREFIX + dataType + "-" + tenantPrefix + "-*";
    }
}
