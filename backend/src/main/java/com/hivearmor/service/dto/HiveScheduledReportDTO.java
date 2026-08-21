package com.hivearmor.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * DTO matching the frontend UtmReportDTO TypeScript type (reports.types.ts).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class HiveScheduledReportDTO {

    private Long id;
    private String name;
    private String description;
    /** report type identifier e.g. "COMPLIANCE", "THREAT_ACTIVITY", "ASSET_MANAGEMENT" */
    private String type;
    private String createdAt;       // ISO 8601
    /** cron expression or human-readable schedule */
    private String schedule;
    private String lastRun;         // ISO 8601, nullable
    private String nextRun;         // ISO 8601, nullable
    private List<String> recipients;
    /** PDF | CSV | JSON */
    private String format;
    private Boolean active;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }

    public String getSchedule() { return schedule; }
    public void setSchedule(String schedule) { this.schedule = schedule; }

    public String getLastRun() { return lastRun; }
    public void setLastRun(String lastRun) { this.lastRun = lastRun; }

    public String getNextRun() { return nextRun; }
    public void setNextRun(String nextRun) { this.nextRun = nextRun; }

    public List<String> getRecipients() { return recipients; }
    public void setRecipients(List<String> recipients) { this.recipients = recipients; }

    public String getFormat() { return format; }
    public void setFormat(String format) { this.format = format; }

    public Boolean getActive() { return active; }
    public void setActive(Boolean active) { this.active = active; }
}
