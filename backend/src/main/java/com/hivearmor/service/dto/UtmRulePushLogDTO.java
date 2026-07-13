package com.hivearmor.service.dto;

import com.hivearmor.domain.correlation.rules.UtmRulePushLog;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class UtmRulePushLogDTO {

    private Long id;
    private Long ruleId;
    private String ruleName;
    private String agentId;
    private Instant pushedAt;
    private String pushStatus;
    private String errorMsg;
    private Instant ackAt;

    public UtmRulePushLogDTO(UtmRulePushLog entity) {
        this.id = entity.getId();
        this.ruleId = entity.getRuleId();
        this.ruleName = entity.getRuleName();
        this.agentId = entity.getAgentId();
        this.pushedAt = entity.getPushedAt();
        this.pushStatus = entity.getPushStatus();
        this.errorMsg = entity.getErrorMsg();
        this.ackAt = entity.getAckAt();
    }
}
