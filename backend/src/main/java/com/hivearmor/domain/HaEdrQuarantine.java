package com.hivearmor.domain;

import jakarta.persistence.*;

import java.io.Serializable;
import java.time.Instant;

/**
 * JPA entity for the ha_edr_quarantine table.
 *
 * Stores quarantined files collected by EDR agents across the fleet.
 * Supports per-row and bulk Restore/Delete actions.
 *
 * Backs GET/PATCH/POST /api/ha-edr/quarantine*
 *
 * No Lombok — all accessors are explicit public methods.
 */
@Entity
@Table(name = "ha_edr_quarantine")
public class HaEdrQuarantine implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "agent_id", nullable = false)
    private String agentId;

    @Column(name = "agent_name")
    private String agentName;

    @Column(name = "filename", nullable = false, length = 1000)
    private String filename;

    @Column(name = "file_path", nullable = false, length = 4000)
    private String filePath;

    @Column(name = "sha256_hash", length = 64)
    private String sha256Hash;

    @Column(name = "file_size")
    private Long fileSize;

    @Column(name = "quarantine_time", nullable = false)
    private Instant quarantineTime;

    @Column(name = "status", nullable = false, length = 20)
    private String status;

    @Column(name = "quarantined_by", length = 50)
    private String quarantinedBy;

    @Column(name = "notes", columnDefinition = "TEXT")
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

    public Instant getQuarantineTime() {
        return quarantineTime;
    }

    public void setQuarantineTime(Instant quarantineTime) {
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
