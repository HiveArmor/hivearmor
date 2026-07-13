package com.hivearmor.service.dto;

import lombok.Data;

@Data
public class RuleTestRequestDTO {
    private Long ruleId;
    private String testEventJson;
}
