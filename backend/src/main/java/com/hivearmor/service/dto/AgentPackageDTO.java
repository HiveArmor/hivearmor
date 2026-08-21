package com.hivearmor.service.dto;

/**
 * Catalog entry for a HiveArmor agent installer binary.
 */
public class AgentPackageDTO {

    private String filename;
    private String href;
    private boolean available;
    private Long sizeBytes;

    public AgentPackageDTO() {
    }

    public AgentPackageDTO(String filename, String href, boolean available, Long sizeBytes) {
        this.filename = filename;
        this.href = href;
        this.available = available;
        this.sizeBytes = sizeBytes;
    }

    public String getFilename() {
        return filename;
    }

    public void setFilename(String filename) {
        this.filename = filename;
    }

    public String getHref() {
        return href;
    }

    public void setHref(String href) {
        this.href = href;
    }

    public boolean isAvailable() {
        return available;
    }

    public void setAvailable(boolean available) {
        this.available = available;
    }

    public Long getSizeBytes() {
        return sizeBytes;
    }

    public void setSizeBytes(Long sizeBytes) {
        this.sizeBytes = sizeBytes;
    }
}
