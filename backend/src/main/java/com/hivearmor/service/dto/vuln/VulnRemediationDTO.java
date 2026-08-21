package com.hivearmor.service.dto.vuln;

/**
 * Honest remediation projection. HiveArmor does not invent patch jobs or execute changes.
 */
public class VulnRemediationDTO {

    private String state;
    private String reason;

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }

    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
}
