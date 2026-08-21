package com.hivearmor.service.dto;

/**
 * DTO representing a single quarantined file entry.
 *
 * Serialized as JSON in the responses of the GET /api/ha-edr/quarantine,
 * PATCH /api/ha-edr/quarantine/{id}, and POST /api/ha-edr/quarantine/bulk
 * endpoints.
 *
 * The {@code quarantineTime} field is serialized as an ISO-8601 string.
 *
 * No Lombok — all accessors are explicit public methods.
 */
public class QuarantinedFileDTO {

    private Long id;
    private String agentId;
    private String agentName;
    private String filename;
    private String filePath;
    private String sha256Hash;
    private Long fileSize;
    private String quarantineTime;
    private String status;
    private String quarantinedBy;
    private String notes;

    // ---- getters / setters ----

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getAgentId() {
        return agentId;
    }

    public void setAgentId(String agentId) {
        this.agentId = agentId;
    }

    public String getAgentName() {
        return agentName;
    }

    public void setAgentName(String agentName) {
        this.agentName = agentName;
    }

    public String getFilename() {
        return filename;
    }

    public void setFilename(String filename) {
        this.filename = filename;
    }

    public String getFilePath() {
        return filePath;
    }

    public void setFilePath(String filePath) {
        this.filePath = filePath;
    }

    public String getSha256Hash() {
        return sha256Hash;
    }

    public void setSha256Hash(String sha256Hash) {
        this.sha256Hash = sha256Hash;
    }

    public Long getFileSize() {
        return fileSize;
    }

    public void setFileSize(Long fileSize) {
        this.fileSize = fileSize;
    }

    public String getQuarantineTime() {
        return quarantineTime;
    }

    public void setQuarantineTime(String quarantineTime) {
        this.quarantineTime = quarantineTime;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getQuarantinedBy() {
        return quarantinedBy;
    }

    public void setQuarantinedBy(String quarantinedBy) {
        this.quarantinedBy = quarantinedBy;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }
}
