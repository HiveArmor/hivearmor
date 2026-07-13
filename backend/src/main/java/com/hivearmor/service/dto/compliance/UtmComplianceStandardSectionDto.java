package com.hivearmor.service.dto.compliance;

import lombok.Data;

@Data
public class UtmComplianceStandardSectionDto {
    private Long id;
    private String standardSectionName;
    private String standardSectionDescription;
    private UtmComplianceStandardDto standard;
}