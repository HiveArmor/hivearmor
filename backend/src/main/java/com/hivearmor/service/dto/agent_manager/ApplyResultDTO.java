package com.hivearmor.service.dto.agent_manager;

import java.util.List;

/**
 * PT-3 — result of an Apply: which hosts were affected and, per host, which effective policy
 * was pushed via APPLY_POLICY plus the initial delivery status. Draft edits do NOT ship until
 * Apply, so this is the single place a push is recorded for an association table.
 */
public class ApplyResultDTO {

    /** association table id that was applied. */
    private Long associationId;
    /** total hosts the resolver considered (union of all match targets). */
    private int affectedHostCount;
    /** number of hosts a push was dispatched to (== affectedHostCount unless a host was unresolved). */
    private int pushedCount;
    private List<HostApply> hosts;

    public ApplyResultDTO() {}

    public Long getAssociationId() { return associationId; }
    public void setAssociationId(Long associationId) { this.associationId = associationId; }
    public int getAffectedHostCount() { return affectedHostCount; }
    public void setAffectedHostCount(int affectedHostCount) { this.affectedHostCount = affectedHostCount; }
    public int getPushedCount() { return pushedCount; }
    public void setPushedCount(int pushedCount) { this.pushedCount = pushedCount; }
    public List<HostApply> getHosts() { return hosts; }
    public void setHosts(List<HostApply> hosts) { this.hosts = hosts; }

    /** Per-host Apply outcome. */
    public static class HostApply {
        private String host;
        private Integer matchedRank;
        private String matchedRowName;
        private List<String> templates;
        /** the ephemeral effective-policy id the merged doc was materialized under (for APPLY_POLICY). */
        private Long effectivePolicyId;
        /** "PUSHED" | "SKIPPED_UNRESOLVED" — initial dispatch status; agent ACK arrives via report-state. */
        private String status;
        private String detail;

        public String getHost() { return host; }
        public void setHost(String host) { this.host = host; }
        public Integer getMatchedRank() { return matchedRank; }
        public void setMatchedRank(Integer matchedRank) { this.matchedRank = matchedRank; }
        public String getMatchedRowName() { return matchedRowName; }
        public void setMatchedRowName(String matchedRowName) { this.matchedRowName = matchedRowName; }
        public List<String> getTemplates() { return templates; }
        public void setTemplates(List<String> templates) { this.templates = templates; }
        public Long getEffectivePolicyId() { return effectivePolicyId; }
        public void setEffectivePolicyId(Long effectivePolicyId) { this.effectivePolicyId = effectivePolicyId; }
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        public String getDetail() { return detail; }
        public void setDetail(String detail) { this.detail = detail; }
    }
}
