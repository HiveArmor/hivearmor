package com.hivearmor.repository.compliance;

/**
 * Projection record holding the aggregate pass/fail counts for a single tenant.
 *
 * <p>Instantiated directly by the JPQL constructor expression in
 * {@link ComplianceResultRepository#rollupForClient(Long)}.
 *
 * <p>Sprint 24 — S24-T02: aggregate rollup for {@code MsspAggregateReportService}.
 */
public record ComplianceRollup(int passed, int failed) {

    /**
     * Returns the total number of evaluated controls ({@code passed + failed}).
     *
     * @return sum of passed and failed counts
     */
    public int total() {
        return passed + failed;
    }
}
