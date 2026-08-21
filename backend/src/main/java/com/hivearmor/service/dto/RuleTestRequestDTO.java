package com.hivearmor.service.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class RuleTestRequestDTO {
    private Long ruleId;
    private String testEventJson;

    @NotBlank
    @Size(max = 65536)
    private String ruleYaml;

    @NotBlank
    @Size(max = 65536)
    private String eventJson;
}
