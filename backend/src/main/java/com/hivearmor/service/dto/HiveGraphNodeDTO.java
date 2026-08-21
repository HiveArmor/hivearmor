package com.hivearmor.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;

/**
 * DTO matching the frontend GraphNodeDTO TypeScript type (constellation.types.ts).
 * Backed by OpenSearch alert aggregations.
 */
@Schema(description = "Constellation graph node representing an entity derived from alert aggregations")
@JsonInclude(JsonInclude.Include.NON_NULL)
public class HiveGraphNodeDTO {

    @Schema(description = "Unique node identifier — composite key e.g. 'ip:1.2.3.4'", example = "ip:10.0.1.45", requiredMode = Schema.RequiredMode.REQUIRED)
    private String id;

    @Schema(description = "Entity type: user, host, ip, process, file, domain", example = "ip", requiredMode = Schema.RequiredMode.REQUIRED)
    private String entityType;

    @Schema(description = "Human-readable entity label — raw value", example = "10.0.1.45", requiredMode = Schema.RequiredMode.REQUIRED)
    private String entityValue;

    @Schema(description = "Computed risk score for this entity (0–100)", example = "72")
    private Integer riskScore;

    @Schema(description = "Number of alerts associated with this entity", example = "15")
    private Integer alertCount;

    @Schema(description = "Optional initial X position for graph layout (set by frontend if absent)", example = "150.0")
    private Double x;

    @Schema(description = "Optional initial Y position for graph layout (set by frontend if absent)", example = "220.0")
    private Double y;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getEntityType() { return entityType; }
    public void setEntityType(String entityType) { this.entityType = entityType; }

    public String getEntityValue() { return entityValue; }
    public void setEntityValue(String entityValue) { this.entityValue = entityValue; }

    public Integer getRiskScore() { return riskScore; }
    public void setRiskScore(Integer riskScore) { this.riskScore = riskScore; }

    public Integer getAlertCount() { return alertCount; }
    public void setAlertCount(Integer alertCount) { this.alertCount = alertCount; }

    public Double getX() { return x; }
    public void setX(Double x) { this.x = x; }

    public Double getY() { return y; }
    public void setY(Double y) { this.y = y; }
}
