package com.hivearmor.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * DTO matching the frontend EntityDTO TypeScript type.
 * Backed by hive_uba_entity_risk rows.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class HiveEntityDTO {

    private String id;
    private String hostname;
    private String ipAddress;
    /** host | user | ip | process | network */
    private String entityType;
    private Integer riskScore;
    private String lastSeen;   // ISO 8601
    private Integer alertCount;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getHostname() { return hostname; }
    public void setHostname(String hostname) { this.hostname = hostname; }

    public String getIpAddress() { return ipAddress; }
    public void setIpAddress(String ipAddress) { this.ipAddress = ipAddress; }

    public String getEntityType() { return entityType; }
    public void setEntityType(String entityType) { this.entityType = entityType; }

    public Integer getRiskScore() { return riskScore; }
    public void setRiskScore(Integer riskScore) { this.riskScore = riskScore; }

    public String getLastSeen() { return lastSeen; }
    public void setLastSeen(String lastSeen) { this.lastSeen = lastSeen; }

    public Integer getAlertCount() { return alertCount; }
    public void setAlertCount(Integer alertCount) { this.alertCount = alertCount; }
}
