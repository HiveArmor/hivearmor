package com.hivearmor.service.dto;

import com.hivearmor.domain.correlation.rules.UtmCorrelationRuleVersion;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class UtmCorrelationRuleVersionDTO {

    private Long id;
    private Long ruleId;
    private Integer versionNum;
    private String ruleSnapshot;
    private String changedBy;
    private Instant changedAt;
    private String changeNote;

    public UtmCorrelationRuleVersionDTO(UtmCorrelationRuleVersion entity) {
        this.id = entity.getId();
        this.ruleId = entity.getRuleId();
        this.versionNum = entity.getVersionNum();
        this.ruleSnapshot = entity.getRuleSnapshot();
        this.changedBy = entity.getChangedBy();
        this.changedAt = entity.getChangedAt();
        this.changeNote = entity.getChangeNote();
    }
}
