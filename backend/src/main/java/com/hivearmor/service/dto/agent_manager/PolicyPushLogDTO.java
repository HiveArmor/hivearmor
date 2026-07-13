package com.hivearmor.service.dto.agent_manager;

import com.hivearmor.domain.agents_manager.UtmPolicyPushLog;

import java.time.Instant;

public class PolicyPushLogDTO {
    private Long id;
    private Long policyId;
    private String policyName;
    private String agentId;
    private Instant pushedAt;
    private String pushStatus;
    private String errorMsg;
    private Instant ackAt;

    public PolicyPushLogDTO() {}

    public PolicyPushLogDTO(UtmPolicyPushLog l) {
        this.id = l.getId();
        this.policyId = l.getPolicyId();
        this.policyName = l.getPolicyName();
        this.agentId = l.getAgentId();
        this.pushedAt = l.getPushedAt();
        this.pushStatus = l.getPushStatus();
        this.errorMsg = l.getErrorMsg();
        this.ackAt = l.getAckAt();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getPolicyId() { return policyId; }
    public void setPolicyId(Long policyId) { this.policyId = policyId; }
    public String getPolicyName() { return policyName; }
    public void setPolicyName(String policyName) { this.policyName = policyName; }
    public String getAgentId() { return agentId; }
    public void setAgentId(String agentId) { this.agentId = agentId; }
    public Instant getPushedAt() { return pushedAt; }
    public void setPushedAt(Instant pushedAt) { this.pushedAt = pushedAt; }
    public String getPushStatus() { return pushStatus; }
    public void setPushStatus(String pushStatus) { this.pushStatus = pushStatus; }
    public String getErrorMsg() { return errorMsg; }
    public void setErrorMsg(String errorMsg) { this.errorMsg = errorMsg; }
    public Instant getAckAt() { return ackAt; }
    public void setAckAt(Instant ackAt) { this.ackAt = ackAt; }
}
