package com.hivearmor.service.dto.sca;

/**
 * Observed CIS pack projection. This is not an official applicability catalog.
 */
public class CisPackCatalogDTO {

    private String packId;
    private String packVersion;
    private String authority;
    private String licenseState;
    private Boolean officialBenchmark;
    private String platform;
    private String title;
    private String note;
    private int reportingAgents;
    private String lastScannedAt;
    private String source;

    public String getPackId() { return packId; }
    public void setPackId(String packId) { this.packId = packId; }

    public String getPackVersion() { return packVersion; }
    public void setPackVersion(String packVersion) { this.packVersion = packVersion; }

    public String getAuthority() { return authority; }
    public void setAuthority(String authority) { this.authority = authority; }

    public String getLicenseState() { return licenseState; }
    public void setLicenseState(String licenseState) { this.licenseState = licenseState; }

    public Boolean getOfficialBenchmark() { return officialBenchmark; }
    public void setOfficialBenchmark(Boolean officialBenchmark) { this.officialBenchmark = officialBenchmark; }

    public String getPlatform() { return platform; }
    public void setPlatform(String platform) { this.platform = platform; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }

    public int getReportingAgents() { return reportingAgents; }
    public void setReportingAgents(int reportingAgents) { this.reportingAgents = reportingAgents; }

    public String getLastScannedAt() { return lastScannedAt; }
    public void setLastScannedAt(String lastScannedAt) { this.lastScannedAt = lastScannedAt; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
}
