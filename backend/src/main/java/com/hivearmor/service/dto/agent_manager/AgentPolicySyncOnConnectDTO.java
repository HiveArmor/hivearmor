package com.hivearmor.service.dto.agent_manager;

import java.util.ArrayList;
import java.util.List;

/**
 * Response for agent {@code POST /api/agent-policies/sync-on-connect}.
 * STAGING CANDIDATE — not PRODUCTION READY.
 */
public class AgentPolicySyncOnConnectDTO {

    private String agentId;
    private List<AssignedPolicy> policies = new ArrayList<>();

    public String getAgentId() {
        return agentId;
    }

    public void setAgentId(String agentId) {
        this.agentId = agentId;
    }

    public List<AssignedPolicy> getPolicies() {
        return policies;
    }

    public void setPolicies(List<AssignedPolicy> policies) {
        this.policies = policies != null ? policies : new ArrayList<>();
    }

    public static class AssignedPolicy {
        private Long policyId;
        private String policyName;
        private Integer versionNum;
        /** Normalized schema v1(+telemetry) JSON string. */
        private String policyConfig;
        /** True when APPLY_POLICY was queued via ProcessCommand. */
        private boolean pushed;
        /** True when applied version already matches desired (no push). */
        private boolean alreadyCurrent;

        public Long getPolicyId() {
            return policyId;
        }

        public void setPolicyId(Long policyId) {
            this.policyId = policyId;
        }

        public String getPolicyName() {
            return policyName;
        }

        public void setPolicyName(String policyName) {
            this.policyName = policyName;
        }

        public Integer getVersionNum() {
            return versionNum;
        }

        public void setVersionNum(Integer versionNum) {
            this.versionNum = versionNum;
        }

        public String getPolicyConfig() {
            return policyConfig;
        }

        public void setPolicyConfig(String policyConfig) {
            this.policyConfig = policyConfig;
        }

        public boolean isPushed() {
            return pushed;
        }

        public void setPushed(boolean pushed) {
            this.pushed = pushed;
        }

        public boolean isAlreadyCurrent() {
            return alreadyCurrent;
        }

        public void setAlreadyCurrent(boolean alreadyCurrent) {
            this.alreadyCurrent = alreadyCurrent;
        }
    }
}
