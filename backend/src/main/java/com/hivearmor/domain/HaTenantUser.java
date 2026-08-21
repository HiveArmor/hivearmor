package com.hivearmor.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * JPA entity for the {@code ha_tenant_user} table.
 *
 * <p>Associates a JHipster {@code jhi_user} record with a managed MSSP tenant
 * ({@code ha_client}). Foreign keys are stored as raw {@code Long} values rather
 * than {@code @ManyToOne} references so that the {@code TenantContextFilter} can
 * read {@code clientId} without triggering a lazy-load of the full {@code HaClient}
 * graph.
 *
 * <p>Sprint 21 — MSSP foundation layer.
 *
 * @see com.hivearmor.repository.HaTenantUserRepository
 */
@Entity
@Table(name = "ha_tenant_user")
public class HaTenantUser implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "client_id", nullable = false)
    private Long clientId;

    @Column(name = "jhi_user_id", nullable = false)
    private Long jhiUserId;

    @Column(name = "tenant_role", length = 50, nullable = false)
    private String tenantRole = "ANALYST";

    @Column(name = "assigned_at", nullable = false)
    private Instant assignedAt = Instant.now();

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getClientId() {
        return clientId;
    }

    public void setClientId(Long clientId) {
        this.clientId = clientId;
    }

    public Long getJhiUserId() {
        return jhiUserId;
    }

    public void setJhiUserId(Long jhiUserId) {
        this.jhiUserId = jhiUserId;
    }

    public String getTenantRole() {
        return tenantRole;
    }

    public void setTenantRole(String tenantRole) {
        this.tenantRole = tenantRole;
    }

    public Instant getAssignedAt() {
        return assignedAt;
    }

    public void setAssignedAt(Instant assignedAt) {
        this.assignedAt = assignedAt;
    }
}
