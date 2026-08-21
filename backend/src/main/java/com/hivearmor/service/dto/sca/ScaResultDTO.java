package com.hivearmor.service.dto.sca;

import java.util.List;

/**
 * DTO for a single SCA check result row from {@code ha_sca_result}.
 * No Lombok.
 */
public class ScaResultDTO {

    private Long id;
    private String agentId;
    private String agentHostname;
    private String checkId;
    private String checkTitle;
    private String packId;
    private String level;
    private String status;
    private String observedValue;
    private String expectedValue;
    private String remediation;
    private List<String> mitre;
    private List<String> complianceTags;
    private String scannedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getAgentId() { return agentId; }
    public void setAgentId(String agentId) { this.agentId = agentId; }

    public String getAgentHostname() { return agentHostname; }
    public void setAgentHostname(String agentHostname) { this.agentHostname = agentHostname; }

    public String getCheckId() { return checkId; }
    public void setCheckId(String checkId) { this.checkId = checkId; }

    public String getCheckTitle() { return checkTitle; }
    public void setCheckTitle(String checkTitle) { this.checkTitle = checkTitle; }

    public String getPackId() { return packId; }
    public void setPackId(String packId) { this.packId = packId; }

    public String getLevel() { return level; }
    public void setLevel(String level) { this.level = level; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getObservedValue() { return observedValue; }
    public void setObservedValue(String observedValue) { this.observedValue = observedValue; }

    public String getExpectedValue() { return expectedValue; }
    public void setExpectedValue(String expectedValue) { this.expectedValue = expectedValue; }

    public String getRemediation() { return remediation; }
    public void setRemediation(String remediation) { this.remediation = remediation; }

    public List<String> getMitre() { return mitre; }
    public void setMitre(List<String> mitre) { this.mitre = mitre; }

    public List<String> getComplianceTags() { return complianceTags; }
    public void setComplianceTags(List<String> complianceTags) { this.complianceTags = complianceTags; }

    public String getScannedAt() { return scannedAt; }
    public void setScannedAt(String scannedAt) { this.scannedAt = scannedAt; }
}
