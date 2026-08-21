package com.hivearmor.domain.hunt;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.time.Instant;

/**
 * SOC Manager approval record for gated hunt promotion actions (HNT-007).
 */
@Entity
@Table(name = "ha_hunt_promotion_approval")
public class HuntPromotionApproval implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_APPROVED = "APPROVED";
    public static final String STATUS_REJECTED = "REJECTED";
    public static final String STATUS_EXPIRED = "EXPIRED";
    public static final String STATUS_CONSUMED = "CONSUMED";

    @Id
    @Column(name = "id", length = 36, nullable = false)
    private String id;

    @Column(name = "search_id", length = 128, nullable = false)
    private String searchId;

    @Column(name = "action", length = 64, nullable = false)
    private String action;

    @Column(name = "event_ids_hash", length = 64, nullable = false)
    private String eventIdsHash;

    @Column(name = "requester", length = 255, nullable = false)
    private String requester;

    @Column(name = "tenant_key", length = 128, nullable = false)
    private String tenantKey;

    @Column(name = "status", length = 32, nullable = false)
    private String status;

    @Column(name = "request_rationale", columnDefinition = "text")
    private String requestRationale;

    @Column(name = "decision_rationale", columnDefinition = "text")
    private String decisionRationale;

    @Column(name = "decided_by", length = 255)
    private String decidedBy;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "consumed_at")
    private Instant consumedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getSearchId() { return searchId; }
    public void setSearchId(String searchId) { this.searchId = searchId; }

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }

    public String getEventIdsHash() { return eventIdsHash; }
    public void setEventIdsHash(String eventIdsHash) { this.eventIdsHash = eventIdsHash; }

    public String getRequester() { return requester; }
    public void setRequester(String requester) { this.requester = requester; }

    public String getTenantKey() { return tenantKey; }
    public void setTenantKey(String tenantKey) { this.tenantKey = tenantKey; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getRequestRationale() { return requestRationale; }
    public void setRequestRationale(String requestRationale) { this.requestRationale = requestRationale; }

    public String getDecisionRationale() { return decisionRationale; }
    public void setDecisionRationale(String decisionRationale) { this.decisionRationale = decisionRationale; }

    public String getDecidedBy() { return decidedBy; }
    public void setDecidedBy(String decidedBy) { this.decidedBy = decidedBy; }

    public Instant getDecidedAt() { return decidedAt; }
    public void setDecidedAt(Instant decidedAt) { this.decidedAt = decidedAt; }

    public Instant getConsumedAt() { return consumedAt; }
    public void setConsumedAt(Instant consumedAt) { this.consumedAt = consumedAt; }

    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
