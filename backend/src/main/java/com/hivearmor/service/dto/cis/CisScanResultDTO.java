package com.hivearmor.service.dto.cis;

/**
 * One CIS benchmark control result from the net-new OpenSearch index
 * {@code v3-hive-cis-*} (PT-5, Option A). Distinct from {@code ScaResultDTO}
 * (the legacy Postgres observed-SSH SCA pack) — the two surfaces are kept
 * separate per SPEC-PT-5 §4. No Lombok.
 */
public class CisScanResultDTO {

    private String scanId;
    private String agentId;
    private String hostname;
    private String profile;
    private String benchmark;
    private String contentHash;
    private String mode;
    private String controlId;
    private String title;
    private String severity;
    private String status;
    private String idref;
    private String remediation;
    private String scannedAt;

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

    public String getControlId() { return controlId; }
    public void setControlId(String controlId) { this.controlId = controlId; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getSeverity() { return severity; }
    public void setSeverity(String severity) { this.severity = severity; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getIdref() { return idref; }
    public void setIdref(String idref) { this.idref = idref; }

    public String getRemediation() { return remediation; }
    public void setRemediation(String remediation) { this.remediation = remediation; }

    public String getScannedAt() { return scannedAt; }
    public void setScannedAt(String scannedAt) { this.scannedAt = scannedAt; }
}
