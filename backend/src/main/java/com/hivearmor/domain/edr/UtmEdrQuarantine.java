package com.hivearmor.domain.edr;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "hive_edr_quarantine")
public class UtmEdrQuarantine implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "agent_id", length = 150, nullable = false)
    private String agentId;

    @Column(name = "hostname", length = 200)
    private String hostname;

    @Column(name = "file_path", columnDefinition = "TEXT", nullable = false)
    private String filePath;

    @Column(name = "file_hash", length = 128)
    private String fileHash;

    @Column(name = "file_size")
    private Long fileSize;

    @Column(name = "original_path", columnDefinition = "TEXT")
    private String originalPath;

    @Column(name = "quarantine_path", columnDefinition = "TEXT")
    private String quarantinePath;

    @Column(name = "reason", length = 500)
    private String reason;

    @Column(name = "status", length = 20, nullable = false)
    private String status = "QUARANTINED";

    @Column(name = "quarantined_at", nullable = false)
    private Instant quarantinedAt;

    @Column(name = "restored_at")
    private Instant restoredAt;

    @Column(name = "actioned_by", length = 100)
    private String actionedBy;

    @Column(name = "edr_event_id")
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
