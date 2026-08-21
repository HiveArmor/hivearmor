package com.hivearmor.web.rest.hunt.dto;

import java.util.Map;

/**
 * Projection DTO for a single event in hunt search results.
 *
 * <p>Matches the frontend {@code HuntEvent} interface. Contains only the fields
 * needed for the results grid — full raw records are deferred to the event
 * detail endpoint (HNT-004).
 */
public class HuntEventDTO {

    private String id;
    private String timestamp;
    private String ingestedAt;
    private String severity;
    private String dataSource;
    private String dataset;
    private String category;
    private String action;
    private String host;
    private String user;
    private String sourceIp;
    private String destinationIp;
    private String message;
    private String tenantId;
    private String tenantName;
    private int alertCount;
    private Map<String, Object> normalized;

    // Getters and setters

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getTimestamp() { return timestamp; }
    public void setTimestamp(String timestamp) { this.timestamp = timestamp; }

    public String getIngestedAt() { return ingestedAt; }
    public void setIngestedAt(String ingestedAt) { this.ingestedAt = ingestedAt; }

    public String getSeverity() { return severity; }
    public void setSeverity(String severity) { this.severity = severity; }

    public String getDataSource() { return dataSource; }
    public void setDataSource(String dataSource) { this.dataSource = dataSource; }

    public String getDataset() { return dataset; }
    public void setDataset(String dataset) { this.dataset = dataset; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }

    public String getHost() { return host; }
    public void setHost(String host) { this.host = host; }

    public String getUser() { return user; }
    public void setUser(String user) { this.user = user; }

    public String getSourceIp() { return sourceIp; }
    public void setSourceIp(String sourceIp) { this.sourceIp = sourceIp; }

    public String getDestinationIp() { return destinationIp; }
    public void setDestinationIp(String destinationIp) { this.destinationIp = destinationIp; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public String getTenantName() { return tenantName; }
    public void setTenantName(String tenantName) { this.tenantName = tenantName; }

    public int getAlertCount() { return alertCount; }
    public void setAlertCount(int alertCount) { this.alertCount = alertCount; }

    public Map<String, Object> getNormalized() { return normalized; }
    public void setNormalized(Map<String, Object> normalized) { this.normalized = normalized; }

    /**
     * Maps an integer severity value from OpenSearch to a symbolic severity string.
     */
    public static String mapSeverity(Object severityObj) {
        if (severityObj == null) return "info";
        int sev;
        if (severityObj instanceof Number) {
            sev = ((Number) severityObj).intValue();
        } else {
            try {
                sev = Integer.parseInt(severityObj.toString());
            } catch (NumberFormatException e) {
                return severityObj.toString().toLowerCase();
            }
        }
        return switch (sev) {
            case 1 -> "low";
            case 2 -> "medium";
            case 3 -> "high";
            case 4 -> "critical";
            default -> "info";
        };
    }
}
