package com.hivearmor.service.dto.sca;

/**
 * Per-agent SCA summary DTO from {@code ha_sca_summary}.
 * No Lombok.
 */
public class ScaSummaryDTO {

    private Long id;
    private String agentId;
    private String agentHostname;
    private String packId;
    private int total;
    private int passCount;
    private int failCount;
    private int naCount;
    private int errorCount;
    private double scorePct;
    private String scannedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getAgentId() { return agentId; }
    public void setAgentId(String agentId) { this.agentId = agentId; }

    public String getAgentHostname() { return agentHostname; }
    public void setAgentHostname(String agentHostname) { this.agentHostname = agentHostname; }

    public String getPackId() { return packId; }
    public void setPackId(String packId) { this.packId = packId; }

    public int getTotal() { return total; }
    public void setTotal(int total) { this.total = total; }

    public int getPassCount() { return passCount; }
    public void setPassCount(int passCount) { this.passCount = passCount; }

    public int getFailCount() { return failCount; }
    public void setFailCount(int failCount) { this.failCount = failCount; }

    public int getNaCount() { return naCount; }
    public void setNaCount(int naCount) { this.naCount = naCount; }

    public int getErrorCount() { return errorCount; }
    public void setErrorCount(int errorCount) { this.errorCount = errorCount; }

    public double getScorePct() { return scorePct; }
    public void setScorePct(double scorePct) { this.scorePct = scorePct; }

    public String getScannedAt() { return scannedAt; }
    public void setScannedAt(String scannedAt) { this.scannedAt = scannedAt; }
}
