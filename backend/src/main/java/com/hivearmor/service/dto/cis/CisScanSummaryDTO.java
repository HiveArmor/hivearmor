package com.hivearmor.service.dto.cis;

/**
 * Per-host CIS scan summary from the net-new OpenSearch index {@code v3-hive-cis-*}
 * (PT-5, Option A). The {@code scanned} flag drives the UI's honest "not scanned yet"
 * state — a host with no CIS scan is NOT reported as 100% compliant. No Lombok.
 */
public class CisScanSummaryDTO {

    /** False when no CIS scan has been ingested for this host/profile yet. */
    private boolean scanned;
    private String scanId;
    private String agentId;
    private String hostname;
    private String profile;
    private String benchmark;
    private String contentHash;
    private String mode;
    private int total;
    private int passCount;
    private int failCount;
    private int errorCount;
    private int naCount;
    private int notCheckedCount;
    private double scorePct;
    private long durationMs;
    private String scannedAt;

    public static CisScanSummaryDTO notScanned(String agentId) {
        CisScanSummaryDTO dto = new CisScanSummaryDTO();
        dto.scanned = false;
        dto.agentId = agentId;
        dto.total = 0;
        dto.scorePct = 0.0;
        return dto;
    }

    public boolean isScanned() { return scanned; }
    public void setScanned(boolean scanned) { this.scanned = scanned; }

    public String getScanId() { return scanId; }
    public void setScanId(String scanId) { this.scanId = scanId; }

    public String getAgentId() { return agentId; }
    public void setAgentId(String agentId) { this.agentId = agentId; }

    public String getHostname() { return hostname; }
    public void setHostname(String hostname) { this.hostname = hostname; }

    public String getProfile() { return profile; }
    public void setProfile(String profile) { this.profile = profile; }

    public String getBenchmark() { return benchmark; }
    public void setBenchmark(String benchmark) { this.benchmark = benchmark; }

    public String getContentHash() { return contentHash; }
    public void setContentHash(String contentHash) { this.contentHash = contentHash; }

    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }

    public int getTotal() { return total; }
    public void setTotal(int total) { this.total = total; }

    public int getPassCount() { return passCount; }
    public void setPassCount(int passCount) { this.passCount = passCount; }

    public int getFailCount() { return failCount; }
    public void setFailCount(int failCount) { this.failCount = failCount; }

    public int getErrorCount() { return errorCount; }
    public void setErrorCount(int errorCount) { this.errorCount = errorCount; }

    public int getNaCount() { return naCount; }
    public void setNaCount(int naCount) { this.naCount = naCount; }

    public int getNotCheckedCount() { return notCheckedCount; }
    public void setNotCheckedCount(int notCheckedCount) { this.notCheckedCount = notCheckedCount; }

    public double getScorePct() { return scorePct; }
    public void setScorePct(double scorePct) { this.scorePct = scorePct; }

    public long getDurationMs() { return durationMs; }
    public void setDurationMs(long durationMs) { this.durationMs = durationMs; }

    public String getScannedAt() { return scannedAt; }
    public void setScannedAt(String scannedAt) { this.scannedAt = scannedAt; }
}
