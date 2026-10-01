package com.hivearmor.service.dto.agent_manager;

import java.util.List;

/**
 * PT-3 — per-host "effective policy" preview: which association row won for a host, and the
 * resolved (merged) policy document. Answers the FE preview "which row won, resolved sections".
 *
 * <p>{@code resolved} is null only when the table is invalid (no reachable {@code any} catch-all) —
 * a state the validator rejects on save, so in practice a resolved host always has a winning row.
 */
public class EffectivePolicyDTO {

    /** The host identifier this was resolved for (agent connector id as string). */
    private String host;
    /** rank of the winning row, or null if unresolved. */
    private Integer matchedRank;
    /** name of the winning row, or null. */
    private String matchedRowName;
    /** which predicate matched: "group" | "host" | "tag" | "any", or null. */
    private String matchedBy;
    /** the templates listed on the winning row, in application order. */
    private List<String> templates;
    /** the merged schema-v1 policyConfig JSON (union+dedupe per PT-0 §3), or null if unresolved. */
    private String resolved;
    /** true when a template name on the winning row could not be found in the library. */
    private boolean hasMissingTemplate;
    /** names of templates the winning row lists but the library does not contain. */
    private List<String> missingTemplates;

    public EffectivePolicyDTO() {}

    public String getHost() { return host; }
    public void setHost(String host) { this.host = host; }
    public Integer getMatchedRank() { return matchedRank; }
    public void setMatchedRank(Integer matchedRank) { this.matchedRank = matchedRank; }
    public String getMatchedRowName() { return matchedRowName; }
    public void setMatchedRowName(String matchedRowName) { this.matchedRowName = matchedRowName; }
    public String getMatchedBy() { return matchedBy; }
    public void setMatchedBy(String matchedBy) { this.matchedBy = matchedBy; }
    public List<String> getTemplates() { return templates; }
    public void setTemplates(List<String> templates) { this.templates = templates; }
    public String getResolved() { return resolved; }
    public void setResolved(String resolved) { this.resolved = resolved; }
    public boolean isHasMissingTemplate() { return hasMissingTemplate; }
    public void setHasMissingTemplate(boolean hasMissingTemplate) { this.hasMissingTemplate = hasMissingTemplate; }
    public List<String> getMissingTemplates() { return missingTemplates; }
    public void setMissingTemplates(List<String> missingTemplates) { this.missingTemplates = missingTemplates; }
}
