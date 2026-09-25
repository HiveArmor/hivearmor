package com.hivearmor.domain.agents_manager;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * PT-3 — a tenant's ranked, first-match host→template binding table (FortiSIEM
 * "Host To Template Associations"). One row per tenant/scope holds the whole ordered
 * association table as a JSON document ({@code rows[]} per the frozen PT-0
 * {@code host-template-association.schema.json}); the resolver evaluates it by
 * ascending rank and returns the first matching row's templates.
 *
 * <p>TENANT ISOLATION — this is a NET-NEW table NOT covered by the W1b RLS changeset
 * ({@code 20260914001_rls_w1b_safe_three.xml}), so it carries its own authoritative
 * {@code tenant_id} column (stamped server-side, never from payload) and its own
 * {@code tenant_isolation} RLS policy added in {@code 20260923001_host_template_association.xml},
 * following the exact same pattern as the three W1b tables.
 *
 * <p>ORG-scoped tables are tenant-isolated by RLS; a GLOBAL default table is readable
 * cross-tenant (a second permissive SELECT-only policy, same shape as PT-1's
 * {@code global_template_read}). There is at most one active table per (tenant, scope).
 *
 * <p>STAGING CANDIDATE — not PRODUCTION READY.
 */
@Entity
@Table(name = "hive_host_template_association")
public class HostTemplateAssociation implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * Authoritative tenant, assigned server-side at create (never from payload).
     * Nullable during rollout; single-tenant carries 0. RLS keys on this column.
     */
    @Column(name = "tenant_id")
    private Long tenantId;

    /** Human label for this binding table (e.g. "Default host associations"). */
    @Column(name = "name", length = 128, nullable = false)
    private String name;

    /** Visibility scope: ORG (tenant-scoped) | GLOBAL (cross-tenant default binding). */
    @Column(name = "scope", length = 10, nullable = false)
    private String scope = "ORG";

    /** Optional ORG qualifier (metadata; forbidden on GLOBAL). */
    @Column(name = "org_id", length = 64)
    private String orgId;

    /**
     * The ordered association table as JSON: the frozen PT-0
     * {@code host-template-association} document ({@code {scope, orgId, rows:[...]}}).
     * Validated + normalized (invariant: exactly one reachable {@code any} catch-all) by
     * {@code HostTemplateAssociationService} before persist.
     */
    @Column(name = "rows_json", columnDefinition = "TEXT", nullable = false)
    private String rowsJson;

    @Column(name = "version_num", nullable = false)
    private Integer versionNum = 1;

    @Column(name = "created_by", length = 100, nullable = false)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt;

    /** Timestamp of the last successful Apply (draft edits after this are un-applied). */
    @Column(name = "last_applied_at")
    private Instant lastAppliedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getTenantId() { return tenantId; }
    public void setTenantId(Long tenantId) { this.tenantId = tenantId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getScope() { return scope; }
    public void setScope(String scope) { this.scope = scope; }
    public String getOrgId() { return orgId; }
    public void setOrgId(String orgId) { this.orgId = orgId; }
    public String getRowsJson() { return rowsJson; }
    public void setRowsJson(String rowsJson) { this.rowsJson = rowsJson; }
    public Integer getVersionNum() { return versionNum; }
    public void setVersionNum(Integer versionNum) { this.versionNum = versionNum; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public Instant getLastAppliedAt() { return lastAppliedAt; }
    public void setLastAppliedAt(Instant lastAppliedAt) { this.lastAppliedAt = lastAppliedAt; }
}
