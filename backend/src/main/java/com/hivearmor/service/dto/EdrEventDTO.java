package com.hivearmor.service.dto;

import java.util.Map;

/**
 * DTO representing a single EDR event on the endpoint timeline.
 *
 * Fields are designed for the GET /api/ha-edr/timeline response. The
 * {@code details} map carries the raw event fields as a free-form JSON
 * object so that the frontend can display them in a Monaco Editor drawer.
 *
 * No Lombok — all accessors are explicit public methods.
 * No java.util.List#getFirst() usage anywhere in this class.
 */
public class EdrEventDTO {

    private String id;
    private String agentId;
    private String eventType;
    private int severity;
    private String timestamp;
    private String processName;
    private long pid;
    private String user;
    private Map<String, Object> details;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getAgentId() {
        return agentId;
    }

    public void setAgentId(String agentId) {
        this.agentId = agentId;
    }

    public String getEventType() {
        return eventType;
    }

    public void setEventType(String eventType) {
        this.eventType = eventType;
    }

    public int getSeverity() {
        return severity;
    }

    public void setSeverity(int severity) {
        this.severity = severity;
    }

    public String getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(String timestamp) {
        this.timestamp = timestamp;
    }

    public String getProcessName() {
        return processName;
    }

    public void setProcessName(String processName) {
        this.processName = processName;
    }

    public long getPid() {
        return pid;
    }

    public void setPid(long pid) {
        this.pid = pid;
    }

    public String getUser() {
        return user;
    }

    public void setUser(String user) {
        this.user = user;
    }

    public Map<String, Object> getDetails() {
        return details;
    }

    public void setDetails(Map<String, Object> details) {
        this.details = details;
    }
}
