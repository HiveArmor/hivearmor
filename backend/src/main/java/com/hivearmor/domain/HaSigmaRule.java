package com.hivearmor.domain;

import jakarta.persistence.*;

import java.io.Serializable;
import java.time.Instant;

/**
 * JPA entity for the ha_sigma_rule table.
 *
 * Stores raw Sigma YAML rules imported from SigmaHQ or uploaded manually.
 * The detection_yaml column holds the verbatim Sigma YAML — no field-map
 * translation is applied during ingestion; that is deferred to the Go
 * event-processor at rule-eval time.
 *
 * Backs /api/ha-sigma/rules and /api/ha-sigma/sync
 */
@Entity
@Table(name = "ha_sigma_rule")
public class HaSigmaRule implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "sigma_id", unique = true, nullable = false, length = 50)
    private String sigmaId;

    @Column(name = "rule_title", nullable = false, length = 500)
    private String ruleTitle;

    @Column(name = "rule_status", length = 50)
    private String ruleStatus;

    @Column(name = "logsource_product", length = 100)
    private String logsourceProduct;

    @Column(name = "logsource_service", length = 100)
    private String logsourceService;

    @Column(name = "detection_yaml", nullable = false, columnDefinition = "TEXT")
    private String detectionYaml;

    @Column(name = "ha_severity", nullable = false)
    private Integer haSeverity;

    @Column(name = "mitre_tags", length = 1000)
    private String mitreTags;

    @Column(name = "active", nullable = false)
    private Boolean active = Boolean.TRUE;

    @Column(name = "imported_at", nullable = false)
    private Instant importedAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // ---- getters / setters ----

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getSigmaId() { return sigmaId; }
    public void setSigmaId(String sigmaId) { this.sigmaId = sigmaId; }

    public String getRuleTitle() { return ruleTitle; }
    public void setRuleTitle(String ruleTitle) { this.ruleTitle = ruleTitle; }

    public String getRuleStatus() { return ruleStatus; }
    public void setRuleStatus(String ruleStatus) { this.ruleStatus = ruleStatus; }

    public String getLogsourceProduct() { return logsourceProduct; }
    public void setLogsourceProduct(String logsourceProduct) { this.logsourceProduct = logsourceProduct; }

    public String getLogsourceService() { return logsourceService; }
    public void setLogsourceService(String logsourceService) { this.logsourceService = logsourceService; }

    public String getDetectionYaml() { return detectionYaml; }
    public void setDetectionYaml(String detectionYaml) { this.detectionYaml = detectionYaml; }

    public Integer getHaSeverity() { return haSeverity; }
    public void setHaSeverity(Integer haSeverity) { this.haSeverity = haSeverity; }

    public String getMitreTags() { return mitreTags; }
    public void setMitreTags(String mitreTags) { this.mitreTags = mitreTags; }

    public Boolean getActive() { return active; }
    public void setActive(Boolean active) { this.active = active; }

    public Instant getImportedAt() { return importedAt; }
    public void setImportedAt(Instant importedAt) { this.importedAt = importedAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
