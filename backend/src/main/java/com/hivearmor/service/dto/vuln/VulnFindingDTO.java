package com.hivearmor.service.dto.vuln;

import java.util.List;

/**
 * DTO for a single CVE vulnerability finding on an endpoint.
 * Populated from {@code ha_vuln_finding} table.
 *
 * No Lombok — all accessors are explicit public methods.
 */
public class VulnFindingDTO {

    private Long id;
    private String agentId;
    private String agentHostname;
    private String cveId;
    private String purl;
    private String packageName;
    private String installedVersion;
    private String fixedVersion;
    private Double cvssV3;
    private String severity;
    private boolean isKev;
    private String description;
    private List<String> references;
    private String publishedAt;
    private String firstSeenAt;
    private String lastSeenAt;
    private Double epssScore;
    private Double epssPercentile;
    private String epssAsOf;
    private String epssState;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getAgentId() { return agentId; }
    public void setAgentId(String agentId) { this.agentId = agentId; }

    public String getAgentHostname() { return agentHostname; }
    public void setAgentHostname(String agentHostname) { this.agentHostname = agentHostname; }

    public String getCveId() { return cveId; }
    public void setCveId(String cveId) { this.cveId = cveId; }

    public String getPurl() { return purl; }
    public void setPurl(String purl) { this.purl = purl; }

    public String getPackageName() { return packageName; }
    public void setPackageName(String packageName) { this.packageName = packageName; }

    public String getInstalledVersion() { return installedVersion; }
    public void setInstalledVersion(String installedVersion) { this.installedVersion = installedVersion; }

    public String getFixedVersion() { return fixedVersion; }
    public void setFixedVersion(String fixedVersion) { this.fixedVersion = fixedVersion; }

    public Double getCvssV3() { return cvssV3; }
    public void setCvssV3(Double cvssV3) { this.cvssV3 = cvssV3; }

    public String getSeverity() { return severity; }
    public void setSeverity(String severity) { this.severity = severity; }

    public boolean isKev() { return isKev; }
    public void setKev(boolean kev) { isKev = kev; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public List<String> getReferences() { return references; }
    public void setReferences(List<String> references) { this.references = references; }

    public String getPublishedAt() { return publishedAt; }
    public void setPublishedAt(String publishedAt) { this.publishedAt = publishedAt; }

    public String getFirstSeenAt() { return firstSeenAt; }
    public void setFirstSeenAt(String firstSeenAt) { this.firstSeenAt = firstSeenAt; }

    public String getLastSeenAt() { return lastSeenAt; }
    public void setLastSeenAt(String lastSeenAt) { this.lastSeenAt = lastSeenAt; }

    public Double getEpssScore() { return epssScore; }
    public void setEpssScore(Double epssScore) { this.epssScore = epssScore; }

    public Double getEpssPercentile() { return epssPercentile; }
    public void setEpssPercentile(Double epssPercentile) { this.epssPercentile = epssPercentile; }

    public String getEpssAsOf() { return epssAsOf; }
    public void setEpssAsOf(String epssAsOf) { this.epssAsOf = epssAsOf; }

    public String getEpssState() { return epssState; }
    public void setEpssState(String epssState) { this.epssState = epssState; }
}
