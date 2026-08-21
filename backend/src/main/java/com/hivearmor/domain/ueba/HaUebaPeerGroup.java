package com.hivearmor.domain.ueba;

import jakarta.persistence.*;

import java.time.Instant;
import java.time.LocalDate;

/**
 * JPA entity mapped to {@code ha_ueba_peer_group} table.
 *
 * <p>Represents one peer-group assignment for a user on a given day.
 * The {@code groupKey} is derived from the user's Active Directory department
 * (when non-blank) or from their most recent source IPv4 /24 subnet.
 *
 * <p>Unique constraint: {@code (user_id, computed_on)}.
 */
@Entity
@Table(name = "ha_ueba_peer_group")
public class HaUebaPeerGroup {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, length = 128)
    private String userId;

    @Column(name = "group_key", nullable = false, length = 255)
    private String groupKey;

    @Column(name = "group_source", nullable = false, length = 16)
    @Enumerated(EnumType.STRING)
    private GroupSource groupSource;

    @Column(name = "tenant_id", length = 64)
    private String tenantId;

    @Column(name = "computed_on", nullable = false)
    private LocalDate computedOn;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    private void prePersist() {
        if (this.createdAt == null) {
            this.createdAt = Instant.now();
        }
    }

    // --- Getters and Setters ---

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getGroupKey() {
        return groupKey;
    }

    public void setGroupKey(String groupKey) {
        this.groupKey = groupKey;
    }

    public GroupSource getGroupSource() {
        return groupSource;
    }

    public void setGroupSource(GroupSource groupSource) {
        this.groupSource = groupSource;
    }

    public String getTenantId() {
        return tenantId;
    }

    public void setTenantId(String tenantId) {
        this.tenantId = tenantId;
    }

    public LocalDate getComputedOn() {
        return computedOn;
    }

    public void setComputedOn(LocalDate computedOn) {
        this.computedOn = computedOn;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
