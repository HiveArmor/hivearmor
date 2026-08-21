package com.hivearmor.service.dto;

import java.time.Instant;

/**
 * DTO mirroring the HaSigmaRule entity for the GET /api/ha-sigma/rules response.
 * Fields map one-to-one to the ha_sigma_rule table columns.
 *
 * Requirement 2.14 — paged response body for GET /api/ha-sigma/rules.
 * Requirement 5.2  — Java side of the SigmaRuleDTO contract.
 */
public class SigmaRuleDTO {

    private Long id;
    private String sigmaId;
    private String ruleTitle;
    private String ruleStatus;
    private String logsourceProduct;
    private String logsourceService;
    private String detectionYaml;
    private Integer haSeverity;
    private String mitreTags;
    private Boolean active;
    private Instant importedAt;
    private Instant updatedAt;

    public SigmaRuleDTO() {
    }

    public SigmaRuleDTO(Long id,
                        String sigmaId,
                        String ruleTitle,
                        String ruleStatus,
                        String logsourceProduct,
                        String logsourceService,
                        String detectionYaml,
                        Integer haSeverity,
                        String mitreTags,
                        Boolean active,
                        Instant importedAt,
                        Instant updatedAt) {
        this.id = id;
        this.sigmaId = sigmaId;
        this.ruleTitle = ruleTitle;
        this.ruleStatus = ruleStatus;
        this.logsourceProduct = logsourceProduct;
        this.logsourceService = logsourceService;
        this.detectionYaml = detectionYaml;
        this.haSeverity = haSeverity;
        this.mitreTags = mitreTags;
        this.active = active;
        this.importedAt = importedAt;
        this.updatedAt = updatedAt;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getSigmaId() {
        return sigmaId;
    }

    public void setSigmaId(String sigmaId) {
        this.sigmaId = sigmaId;
    }

    public String getRuleTitle() {
        return ruleTitle;
    }

    public void setRuleTitle(String ruleTitle) {
        this.ruleTitle = ruleTitle;
    }

    public String getRuleStatus() {
        return ruleStatus;
    }

    public void setRuleStatus(String ruleStatus) {
        this.ruleStatus = ruleStatus;
    }

    public String getLogsourceProduct() {
        return logsourceProduct;
    }

    public void setLogsourceProduct(String logsourceProduct) {
        this.logsourceProduct = logsourceProduct;
    }

    public String getLogsourceService() {
        return logsourceService;
    }

    public void setLogsourceService(String logsourceService) {
        this.logsourceService = logsourceService;
    }

    public String getDetectionYaml() {
        return detectionYaml;
    }

    public void setDetectionYaml(String detectionYaml) {
        this.detectionYaml = detectionYaml;
    }

    public Integer getHaSeverity() {
        return haSeverity;
    }

    public void setHaSeverity(Integer haSeverity) {
        this.haSeverity = haSeverity;
    }

    public String getMitreTags() {
        return mitreTags;
    }

    public void setMitreTags(String mitreTags) {
        this.mitreTags = mitreTags;
    }

    public Boolean getActive() {
        return active;
    }

    public void setActive(Boolean active) {
        this.active = active;
    }

    public Instant getImportedAt() {
        return importedAt;
    }

    public void setImportedAt(Instant importedAt) {
        this.importedAt = importedAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
