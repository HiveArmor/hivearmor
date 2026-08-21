package com.hivearmor.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * DTO matching the frontend EntityDetailDTO TypeScript type.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class HiveEntityDetailDTO {

    private String id;
    private String name;
    private String entityType;
    private Integer riskScore;
    private String lastSeen;
    private Integer alertCount;
    private List<AttackTechnique> topAttackTechniques;
    private List<String> associatedUsers;
    private List<String> associatedHosts;
    private List<RiskTimelinePoint> riskTimeline;

    public static class AttackTechnique {
        private String id;
        private String name;
        private Integer count;

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public Integer getCount() { return count; }
        public void setCount(Integer count) { this.count = count; }
    }

    public static class RiskTimelinePoint {
        private String timestamp;
        private Integer score;

        public String getTimestamp() { return timestamp; }
        public void setTimestamp(String timestamp) { this.timestamp = timestamp; }
        public Integer getScore() { return score; }
        public void setScore(Integer score) { this.score = score; }
    }

    // ---- root getters / setters ----

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getEntityType() { return entityType; }
    public void setEntityType(String entityType) { this.entityType = entityType; }

    public Integer getRiskScore() { return riskScore; }
    public void setRiskScore(Integer riskScore) { this.riskScore = riskScore; }

    public String getLastSeen() { return lastSeen; }
    public void setLastSeen(String lastSeen) { this.lastSeen = lastSeen; }

    public Integer getAlertCount() { return alertCount; }
    public void setAlertCount(Integer alertCount) { this.alertCount = alertCount; }

    public List<AttackTechnique> getTopAttackTechniques() { return topAttackTechniques; }
    public void setTopAttackTechniques(List<AttackTechnique> topAttackTechniques) { this.topAttackTechniques = topAttackTechniques; }

    public List<String> getAssociatedUsers() { return associatedUsers; }
    public void setAssociatedUsers(List<String> associatedUsers) { this.associatedUsers = associatedUsers; }

    public List<String> getAssociatedHosts() { return associatedHosts; }
    public void setAssociatedHosts(List<String> associatedHosts) { this.associatedHosts = associatedHosts; }

    public List<RiskTimelinePoint> getRiskTimeline() { return riskTimeline; }
    public void setRiskTimeline(List<RiskTimelinePoint> riskTimeline) { this.riskTimeline = riskTimeline; }
}
