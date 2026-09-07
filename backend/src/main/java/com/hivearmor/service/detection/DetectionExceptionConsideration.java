package com.hivearmor.service.detection;

/**
 * Result of loading and considering active detection exceptions during Java dry-run.
 *
 * <p>{@code exceptionsApplied} is true only when the exception store was reachable
 * and active rows were considered — even if none matched. Store failures stay honest
 * ({@code exceptionsApplied=false}).
 *
 * <p>STAGING CANDIDATE.
 */
public record DetectionExceptionConsideration(
    boolean exceptionsApplied,
    boolean suppressed,
    int consideredCount,
    Long matchingExceptionId,
    String matchingExceptionTitle,
    String honesty
) {
    public static DetectionExceptionConsideration notApplied(String reason) {
        return new DetectionExceptionConsideration(
            false,
            false,
            0,
            null,
            null,
            "exceptionsApplied=false. " + reason
        );
    }

    public static DetectionExceptionConsideration considered(int count) {
        return new DetectionExceptionConsideration(
            true,
            false,
            count,
            null,
            null,
            "exceptionsApplied=true — loaded " + count
                + " active exception(s) from PostgreSQL and considered with EP operators "
                + "(is/is_not/contains/starts_with/ends_with/in)."
        );
    }

    public static DetectionExceptionConsideration suppressed(int count, Long id, String title) {
        String label = title != null && !title.isBlank() ? " (" + title + ")" : "";
        return new DetectionExceptionConsideration(
            true,
            true,
            count,
            id,
            title,
            "exceptionsApplied=true — expression match suppressed by active exception #"
                + id + label
                + " using EP-parity operators (is/is_not/contains/starts_with/ends_with/in)."
        );
    }
}
