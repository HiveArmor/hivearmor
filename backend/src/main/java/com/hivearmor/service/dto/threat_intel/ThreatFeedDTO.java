package com.hivearmor.service.dto.threat_intel;

import com.hivearmor.domain.threat_intel.UtmThreatFeed;

import java.time.Instant;

public class ThreatFeedDTO {

    private String id;
    private String name;
    private String type;
    private String source;
    private Instant lastUpdated;
    private Long iocCount;
    private String status;
    private Boolean enabled;
    private String description;

    public ThreatFeedDTO() {}

    public ThreatFeedDTO(UtmThreatFeed feed) {
        this.id = feed.getId();
        this.name = feed.getName();
        this.type = feed.getType();
        this.source = feed.getSource();
        this.lastUpdated = feed.getLastUpdated();
        this.iocCount = feed.getIocCount();
        this.status = feed.getStatus();
        this.enabled = feed.getEnabled();
        this.description = feed.getDescription();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public Instant getLastUpdated() { return lastUpdated; }
    public void setLastUpdated(Instant lastUpdated) { this.lastUpdated = lastUpdated; }
    public Long getIocCount() { return iocCount; }
    public void setIocCount(Long iocCount) { this.iocCount = iocCount; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean enabled) { this.enabled = enabled; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
}
