package com.hivearmor.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * DTO matching the frontend EntityAlertDTO TypeScript type.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class HiveEntityAlertDTO {

    private String id;
    private String title;
    private Integer severity;
    private String timestamp;  // ISO 8601
    private String status;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public Integer getSeverity() { return severity; }
    public void setSeverity(Integer severity) { this.severity = severity; }

    public String getTimestamp() { return timestamp; }
    public void setTimestamp(String timestamp) { this.timestamp = timestamp; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
