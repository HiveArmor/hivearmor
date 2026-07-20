package com.hivearmor.service.dto.compliance;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

public class UtmComplianceControlMappingDto {

    private Long id;

    @NotNull
    private Long controlId;

    private String controlName;
    private String sectionName;
    private String standardName;

    @NotBlank
    private String mappingType;

    private String dataTypes;

    @NotBlank
    private String celCondition;

    private String description;

    @DecimalMin("0.0")
    @DecimalMax("1.0")
    private BigDecimal weight;

    private Integer evidenceRetentionDays;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getControlId() { return controlId; }
    public void setControlId(Long controlId) { this.controlId = controlId; }

    public String getControlName() { return controlName; }
    public void setControlName(String controlName) { this.controlName = controlName; }

    public String getSectionName() { return sectionName; }
    public void setSectionName(String sectionName) { this.sectionName = sectionName; }

    public String getStandardName() { return standardName; }
    public void setStandardName(String standardName) { this.standardName = standardName; }

    public String getMappingType() { return mappingType; }
    public void setMappingType(String mappingType) { this.mappingType = mappingType; }

    public String getDataTypes() { return dataTypes; }
    public void setDataTypes(String dataTypes) { this.dataTypes = dataTypes; }

    public String getCelCondition() { return celCondition; }
    public void setCelCondition(String celCondition) { this.celCondition = celCondition; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public BigDecimal getWeight() { return weight; }
    public void setWeight(BigDecimal weight) { this.weight = weight; }

    public Integer getEvidenceRetentionDays() { return evidenceRetentionDays; }
    public void setEvidenceRetentionDays(Integer evidenceRetentionDays) { this.evidenceRetentionDays = evidenceRetentionDays; }
}
