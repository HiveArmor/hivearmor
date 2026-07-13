package com.hivearmor.domain.uba;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "hive_uba_entity_risk")
public class UtmUbaEntityRisk implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "entity_id", length = 150, nullable = false)
    private String entityId;

    @Column(name = "entity_type", length = 20, nullable = false)
    private String entityType;

    @Column(name = "display_name", length = 200)
    private String displayName;

    @Column(name = "department", length = 100)
    private String department;

    @Column(name = "role", length = 100)
    private String role;

    @Column(name = "risk_score", nullable = false)
    private Integer riskScore = 0;

    @Column(name = "prev_risk_score")
    private Integer prevRiskScore = 0;

    @Column(name = "risk_level", length = 20, nullable = false)
    private String riskLevel = "low";

    @Column(name = "anomaly_count")
    private Integer anomalyCount = 0;

    @Column(name = "alert_count")
    private Integer alertCount = 0;

    @Column(name = "last_seen")
    private Instant lastSeen;

    @Column(name = "first_seen")
    private Instant firstSeen;

    @Column(name = "factors_json", columnDefinition = "TEXT")
    private String factorsJson;

    @Column(name = "risk_trend_json", columnDefinition = "TEXT")
    private String riskTrendJson;

    @Column(name = "watchlisted")
    private Boolean watchlisted = false;

    @Column(name = "status", length = 20)
    private String status = "active";

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getEntityId() { return entityId; }
    public void setEntityId(String entityId) { this.entityId = entityId; }
    public String getEntityType() { return entityType; }
    public void setEntityType(String entityType) { this.entityType = entityType; }
    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }
    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public Integer getRiskScore() { return riskScore; }
    public void setRiskScore(Integer riskScore) { this.riskScore = riskScore; }
    public Integer getPrevRiskScore() { return prevRiskScore; }
    public void setPrevRiskScore(Integer prevRiskScore) { this.prevRiskScore = prevRiskScore; }
    public String getRiskLevel() { return riskLevel; }
    public void setRiskLevel(String riskLevel) { this.riskLevel = riskLevel; }
    public Integer getAnomalyCount() { return anomalyCount; }
    public void setAnomalyCount(Integer anomalyCount) { this.anomalyCount = anomalyCount; }
    public Integer getAlertCount() { return alertCount; }
    public void setAlertCount(Integer alertCount) { this.alertCount = alertCount; }
    public Instant getLastSeen() { return lastSeen; }
    public void setLastSeen(Instant lastSeen) { this.lastSeen = lastSeen; }
    public Instant getFirstSeen() { return firstSeen; }
    public void setFirstSeen(Instant firstSeen) { this.firstSeen = firstSeen; }
    public String getFactorsJson() { return factorsJson; }
    public void setFactorsJson(String factorsJson) { this.factorsJson = factorsJson; }
    public String getRiskTrendJson() { return riskTrendJson; }
    public void setRiskTrendJson(String riskTrendJson) { this.riskTrendJson = riskTrendJson; }
    public Boolean getWatchlisted() { return watchlisted; }
    public void setWatchlisted(Boolean watchlisted) { this.watchlisted = watchlisted; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
