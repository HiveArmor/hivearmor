package com.hivearmor.service.dto;

import java.time.Instant;

/**
 * Credential-free host isolation inventory projection for
 * {@code GET /api/ha-edr/isolation}.
 *
 * <p>STAGING CANDIDATE — read inventory only. Does not expose governed
 * release/lift preview, approval, or idempotent delivery state.
 *
 * <p>No Lombok — explicit accessors.
 */
public class IsolatedHostDTO {

    private Long id;
    private String agentId;
    private String hostname;
    private String isolationType;
    private String status;
    private String reason;
    private String allowedIps;
    private Instant isolatedAt;
    private Instant liftedAt;
    private String actionedBy;
    private Long edrEventId;

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

    public String getHostname() {
        return hostname;
    }

    public void setHostname(String hostname) {
        this.hostname = hostname;
    }

    public String getIsolationType() {
        return isolationType;
    }

    public void setIsolationType(String isolationType) {
        this.isolationType = isolationType;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public String getAllowedIps() {
        return allowedIps;
    }

    public void setAllowedIps(String allowedIps) {
        this.allowedIps = allowedIps;
    }

    public Instant getIsolatedAt() {
        return isolatedAt;
    }

    public void setIsolatedAt(Instant isolatedAt) {
        this.isolatedAt = isolatedAt;
    }

    public Instant getLiftedAt() {
        return liftedAt;
    }

    public void setLiftedAt(Instant liftedAt) {
        this.liftedAt = liftedAt;
    }

    public String getActionedBy() {
        return actionedBy;
    }

    public void setActionedBy(String actionedBy) {
        this.actionedBy = actionedBy;
    }

    public Long getEdrEventId() {
        return edrEventId;
    }

    public void setEdrEventId(Long edrEventId) {
        this.edrEventId = edrEventId;
    }
}
