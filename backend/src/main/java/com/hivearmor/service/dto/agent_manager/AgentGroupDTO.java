package com.hivearmor.service.dto.agent_manager;

import com.hivearmor.domain.agents_manager.UtmAgentGroup;

import java.time.Instant;
import java.util.List;

public class AgentGroupDTO {
    private Long id;
    private String groupName;
    private String description;
    private String platform;
    private String createdBy;
    private Instant createdAt;
    private Instant updatedAt;
    private int memberCount;
    private List<Integer> memberAgentIds;

    public AgentGroupDTO() {}

    public AgentGroupDTO(UtmAgentGroup g) {
        this.id = g.getId();
        this.groupName = g.getGroupName();
        this.description = g.getDescription();
        this.platform = g.getPlatform();
        this.createdBy = g.getCreatedBy();
        this.createdAt = g.getCreatedAt();
        this.updatedAt = g.getUpdatedAt();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getGroupName() { return groupName; }
    public void setGroupName(String groupName) { this.groupName = groupName; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getPlatform() { return platform; }
    public void setPlatform(String platform) { this.platform = platform; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public int getMemberCount() { return memberCount; }
    public void setMemberCount(int memberCount) { this.memberCount = memberCount; }
    public List<Integer> getMemberAgentIds() { return memberAgentIds; }
    public void setMemberAgentIds(List<Integer> memberAgentIds) { this.memberAgentIds = memberAgentIds; }
}
