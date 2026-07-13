package com.hivearmor.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class RuleTestResultDTO {
    private Long ruleId;
    private String ruleName;
    private boolean syntaxOk;
    private int variableCount;
    private int simulatedMatchCount;
    private String evaluationNote;
    private long durationMs;
}
