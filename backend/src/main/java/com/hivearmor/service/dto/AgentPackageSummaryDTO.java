package com.hivearmor.service.dto;

/**
 * Fleet-facing summary of published agent installer packages.
 *
 * <p>{@code latestVersion} comes from {@code version.json} beside the binaries
 * ({@code version} / {@code updater_version} keys). Null when no manifest exists.
 */
public class AgentPackageSummaryDTO {

    private String latestVersion;
    private String updaterVersion;
    private int publishedCount;
    private int totalCount;
    private java.util.List<AgentPackageDTO> packages;

    public AgentPackageSummaryDTO() {
    }

    public AgentPackageSummaryDTO(
        String latestVersion,
        String updaterVersion,
        int publishedCount,
        int totalCount,
        java.util.List<AgentPackageDTO> packages
    ) {
        this.latestVersion = latestVersion;
        this.updaterVersion = updaterVersion;
        this.publishedCount = publishedCount;
        this.totalCount = totalCount;
        this.packages = packages;
    }

    public String getLatestVersion() {
        return latestVersion;
    }

    public void setLatestVersion(String latestVersion) {
        this.latestVersion = latestVersion;
    }

    public String getUpdaterVersion() {
        return updaterVersion;
    }

    public void setUpdaterVersion(String updaterVersion) {
        this.updaterVersion = updaterVersion;
    }

    public int getPublishedCount() {
        return publishedCount;
    }

    public void setPublishedCount(int publishedCount) {
        this.publishedCount = publishedCount;
    }

    public int getTotalCount() {
        return totalCount;
    }

    public void setTotalCount(int totalCount) {
        this.totalCount = totalCount;
    }

    public java.util.List<AgentPackageDTO> getPackages() {
        return packages;
    }

    public void setPackages(java.util.List<AgentPackageDTO> packages) {
        this.packages = packages;
    }
}
