package com.hivearmor.service.dto;

import java.util.List;

/**
 * Top-level FIM summary DTO returned by {@code GET /api/ha-edr/fim/summary}.
 * Carries three panels' worth of data: a time-series of change counts,
 * a ranked list of most-changed paths, and a list of suspicious hashes.
 *
 * <p>No Lombok — every accessor is an explicit public method.
 */
public class FimSummaryDTO {

    private List<TimeSeriesPointDTO> changesOverTime;
    private List<PathCountDTO> topPaths;
    private List<SuspiciousHashDTO> suspiciousHashes;

    // ---- Getters ----

    public List<TimeSeriesPointDTO> getChangesOverTime() {
        return changesOverTime;
    }

    public List<PathCountDTO> getTopPaths() {
        return topPaths;
    }

    public List<SuspiciousHashDTO> getSuspiciousHashes() {
        return suspiciousHashes;
    }

    // ---- Setters ----

    public void setChangesOverTime(List<TimeSeriesPointDTO> changesOverTime) {
        this.changesOverTime = changesOverTime;
    }

    public void setTopPaths(List<PathCountDTO> topPaths) {
        this.topPaths = topPaths;
    }

    public void setSuspiciousHashes(List<SuspiciousHashDTO> suspiciousHashes) {
        this.suspiciousHashes = suspiciousHashes;
    }
}
