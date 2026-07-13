package com.hivearmor.service.dto.edr;

import java.time.Instant;

public class EdrQuarantineDTO {
    private Long id;
    private String agentId;
    private String hostname;
    private String filePath;
    private String fileHash;
    private Long fileSize;
    private String originalPath;
    private String quarantinePath;
    private String reason;
    private String status;
    private Instant quarantinedAt;
    private Instant restoredAt;
    private String actionedBy;
    private Long edrEventId;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getAgentId() { return agentId; }
    public void setAgentId(String agentId) { this.agentId = agentId; }
    public String getHostname() { return hostname; }
    public void setHostname(String hostname) { this.hostname = hostname; }
    public String getFilePath() { return filePath; }
    public void setFilePath(String filePath) { this.filePath = filePath; }
    public String getFileHash() { return fileHash; }
    public void setFileHash(String fileHash) { this.fileHash = fileHash; }
    public Long getFileSize() { return fileSize; }
    public void setFileSize(Long fileSize) { this.fileSize = fileSize; }
    public String getOriginalPath() { return originalPath; }
    public void setOriginalPath(String originalPath) { this.originalPath = originalPath; }
    public String getQuarantinePath() { return quarantinePath; }
    public void setQuarantinePath(String quarantinePath) { this.quarantinePath = quarantinePath; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Instant getQuarantinedAt() { return quarantinedAt; }
    public void setQuarantinedAt(Instant quarantinedAt) { this.quarantinedAt = quarantinedAt; }
    public Instant getRestoredAt() { return restoredAt; }
    public void setRestoredAt(Instant restoredAt) { this.restoredAt = restoredAt; }
    public String getActionedBy() { return actionedBy; }
    public void setActionedBy(String actionedBy) { this.actionedBy = actionedBy; }
    public Long getEdrEventId() { return edrEventId; }
    public void setEdrEventId(Long edrEventId) { this.edrEventId = edrEventId; }
}
