package com.hivearmor.domain;

import jakarta.persistence.*;

import java.io.Serializable;
import java.time.Instant;

/**
 * JPA entity for the ha_agent_policy table.
 *
 * Stores EDR agent monitoring policies (file paths, registry paths, network/process
 * monitoring toggles, and the set of agents a policy is assigned to).
 * JSON-encoded lists are stored as TEXT columns.
 *
 * Backs GET/POST/PUT/DELETE /api/ha-edr/agent-policies
 *
 * No Lombok — all accessors are explicit public methods.
 */
@Entity
@Table(name = "ha_agent_policy")
public class HaAgentPolicy implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(name = "os_type")
    private String osType;

    /** JSON-encoded list of file paths to monitor. Stored as TEXT. */
    @Column(name = "file_paths", columnDefinition = "TEXT")
    private String filePaths;

    /** JSON-encoded list of Windows registry paths to monitor. Stored as TEXT. */
    @Column(name = "registry_paths", columnDefinition = "TEXT")
    private String registryPaths;

    @Column(name = "network_monitor")
    private Boolean networkMonitor;

    @Column(name = "process_monitor")
    private Boolean processMonitor;

    /** JSON-encoded list of agent IDs this policy is assigned to. Stored as TEXT. */
    @Column(name = "assigned_agent_ids", columnDefinition = "TEXT")
    private String assignedAgentIds;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    // ---- getters / setters ----

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getOsType() {
        return osType;
    }

    public void setOsType(String osType) {
        this.osType = osType;
    }

    public String getFilePaths() {
        return filePaths;
    }

    public void setFilePaths(String filePaths) {
        this.filePaths = filePaths;
    }

    public String getRegistryPaths() {
        return registryPaths;
    }

    public void setRegistryPaths(String registryPaths) {
        this.registryPaths = registryPaths;
    }

    public Boolean getNetworkMonitor() {
        return networkMonitor;
    }

    public void setNetworkMonitor(Boolean networkMonitor) {
        this.networkMonitor = networkMonitor;
    }

    public Boolean getProcessMonitor() {
        return processMonitor;
    }

    public void setProcessMonitor(Boolean processMonitor) {
        this.processMonitor = processMonitor;
    }

    public String getAssignedAgentIds() {
        return assignedAgentIds;
    }

    public void setAssignedAgentIds(String assignedAgentIds) {
        this.assignedAgentIds = assignedAgentIds;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
