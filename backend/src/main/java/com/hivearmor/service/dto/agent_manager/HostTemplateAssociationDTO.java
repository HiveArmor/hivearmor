package com.hivearmor.service.dto.agent_manager;

import com.hivearmor.domain.agents_manager.HostTemplateAssociation;

import java.time.Instant;

/**
 * PT-3 — a host→template association table (the ranked, first-match binding). Carries the
 * metadata columns plus the whole ordered {@code rows} table as JSON matching the frozen PT-0
 * {@code host-template-association.schema.json}.
 *
 * <p>{@code rowsJson} on the wire is the PT-0 document {@code {scope, orgId, rows:[...]}} —
 * the FE edits it as a rows array; the service validates the invariant (one reachable
 * {@code any} catch-all) before persist. {@code versionNum} and {@code tenantId} are
 * server-owned and never trusted from the payload.
 */
public class HostTemplateAssociationDTO {
    private Long id;
    private String name;
    private String scope;
    private String orgId;
    /** PT-0 host-template-association JSON document ({scope, orgId, rows:[...]}). */
    private String rowsJson;
    private Integer versionNum;
    private String createdBy;
    private Instant createdAt;
    private Instant updatedAt;
    private Instant lastAppliedAt;

    public HostTemplateAssociationDTO() {}

    public HostTemplateAssociationDTO(HostTemplateAssociation a) {
        this.id = a.getId();
        this.name = a.getName();
        this.scope = a.getScope();
        this.orgId = a.getOrgId();
        this.rowsJson = a.getRowsJson();
        this.versionNum = a.getVersionNum();
        this.createdBy = a.getCreatedBy();
        this.createdAt = a.getCreatedAt();
        this.updatedAt = a.getUpdatedAt();
        this.lastAppliedAt = a.getLastAppliedAt();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
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
