package com.hivearmor.service.dto.incident;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class TimelineEventDTO {

    private String timestamp;
    private String type;            // ALERT | LOG | STATUS_CHANGE | NOTE | COMMAND
    private String title;
    private String actor;
    private Integer severity;
    private String details;
    private String relatedAlertId;

    public String getTimestamp() { return timestamp; }
    public void setTimestamp(String timestamp) { this.timestamp = timestamp; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getActor() { return actor; }
    public void setActor(String actor) { this.actor = actor; }

    public Integer getSeverity() { return severity; }
    public void setSeverity(Integer severity) { this.severity = severity; }

    public String getDetails() { return details; }
    public void setDetails(String details) { this.details = details; }

    public String getRelatedAlertId() { return relatedAlertId; }
    public void setRelatedAlertId(String relatedAlertId) { this.relatedAlertId = relatedAlertId; }
}
