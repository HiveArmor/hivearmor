package com.hivearmor.service.dto.posture;

import java.util.ArrayList;
import java.util.List;

/**
 * Posture-over-time for the fleet (SPEC-PT-6 §1): a CIS pass/fail series bucketed by
 * day, plus the most-recent-vs-previous drift deltas. Built from the per-scan CIS
 * summary documents' {@code scannedAt} + {@code scorePct}, tenant-scoped.
 *
 * <p>Honesty: a bucket with no scans is omitted rather than zero-filled to a fake 0%,
 * and {@link #driftAvailable} is false when there is fewer than two distinct scan
 * points — a single scan cannot establish a trend. No Lombok.
 */
public class PostureTrendDTO {

    /** Granularity of each bucket ("day"). */
    private String interval = "day";

    /** Chronological CIS pass-rate points (only non-empty buckets). */
    private List<TrendPoint> cisScore = new ArrayList<>();

    /** True only when at least two distinct scan points exist to compute drift. */
    private boolean driftAvailable;

    /** Latest fleet CIS pass-rate minus the previous point; null when not available. */
    private Double cisScoreDrift;
    /** Latest fleet fail-count minus the previous point; null when not available. */
    private Integer failCountDrift;

    public String getInterval() { return interval; }
    public void setInterval(String interval) { this.interval = interval; }

    public List<TrendPoint> getCisScore() { return cisScore; }
    public void setCisScore(List<TrendPoint> cisScore) { this.cisScore = cisScore; }

    public boolean isDriftAvailable() { return driftAvailable; }
    public void setDriftAvailable(boolean driftAvailable) { this.driftAvailable = driftAvailable; }

    public Double getCisScoreDrift() { return cisScoreDrift; }
    public void setCisScoreDrift(Double cisScoreDrift) { this.cisScoreDrift = cisScoreDrift; }

    public Integer getFailCountDrift() { return failCountDrift; }
    public void setFailCountDrift(Integer failCountDrift) { this.failCountDrift = failCountDrift; }

    /** One day-bucket: the fleet pass rate and raw counts observed in scans that day. */
    public static class TrendPoint {
        /** Bucket start, ISO-8601 date (yyyy-MM-dd). */
        private String bucket;
        private int passCount;
        private int failCount;
        private int errorCount;
        private Double scorePct;
        /** Distinct hosts with a scan in this bucket. */
        private int hostsScanned;

        public TrendPoint() {
        }

        public TrendPoint(String bucket) {
            this.bucket = bucket;
        }

        public String getBucket() { return bucket; }
        public void setBucket(String bucket) { this.bucket = bucket; }

        public int getPassCount() { return passCount; }
        public void setPassCount(int passCount) { this.passCount = passCount; }

        public int getFailCount() { return failCount; }
        public void setFailCount(int failCount) { this.failCount = failCount; }

        public int getErrorCount() { return errorCount; }
        public void setErrorCount(int errorCount) { this.errorCount = errorCount; }

        public Double getScorePct() { return scorePct; }
        public void setScorePct(Double scorePct) { this.scorePct = scorePct; }

        public int getHostsScanned() { return hostsScanned; }
        public void setHostsScanned(int hostsScanned) { this.hostsScanned = hostsScanned; }
    }
}
