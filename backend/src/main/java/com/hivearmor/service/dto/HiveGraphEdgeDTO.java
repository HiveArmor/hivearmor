package com.hivearmor.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;

/**
 * DTO matching the frontend GraphEdgeDTO TypeScript type (constellation.types.ts).
 */
@Schema(description = "Constellation graph edge representing a co-occurrence relationship between entities")
@JsonInclude(JsonInclude.Include.NON_NULL)
public class HiveGraphEdgeDTO {

    @Schema(description = "Unique edge identifier", example = "edge-ip:10.0.1.45-host:WKS-01", requiredMode = Schema.RequiredMode.REQUIRED)
    private String id;

    @Schema(description = "Source node identifier", example = "ip:10.0.1.45", requiredMode = Schema.RequiredMode.REQUIRED)
    private String source;

    @Schema(description = "Target node identifier", example = "host:WKS-01", requiredMode = Schema.RequiredMode.REQUIRED)
    private String target;

    @Schema(description = "Relationship type: CONNECTED_TO, SPAWNED, LOGGED_IN_FROM, RESOLVED_TO, CONTAINS, ACCESSED", example = "LOGGED_IN_FROM")
    private String edgeType;

    @Schema(description = "Co-occurrence count — number of times this relationship was observed", example = "7")
    private Integer weight;

    @Schema(description = "ISO 8601 timestamp of the first observed occurrence", example = "2026-08-19T08:00:00Z")
    private String firstSeen;

    @Schema(description = "ISO 8601 timestamp of the most recent occurrence", example = "2026-08-20T14:22:00Z")
    private String lastSeen;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }

    public String getTarget() { return target; }
    public void setTarget(String target) { this.target = target; }

    public String getEdgeType() { return edgeType; }
    public void setEdgeType(String edgeType) { this.edgeType = edgeType; }

    public Integer getWeight() { return weight; }
    public void setWeight(Integer weight) { this.weight = weight; }

    public String getFirstSeen() { return firstSeen; }
    public void setFirstSeen(String firstSeen) { this.firstSeen = firstSeen; }

    public String getLastSeen() { return lastSeen; }
    public void setLastSeen(String lastSeen) { this.lastSeen = lastSeen; }
}
