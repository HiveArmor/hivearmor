package com.hivearmor.domain.threat_intel;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "hive_threat_feed")
public class UtmThreatFeed implements Serializable {

    @Id
    @Column(name = "id", length = 50)
    private String id;

    @Column(name = "name", length = 200, nullable = false)
    private String name;

    @Column(name = "type", length = 100)
    private String type;

    @Column(name = "source", length = 500)
    private String source;

    @Column(name = "last_updated")
    private Instant lastUpdated;

    @Column(name = "ioc_count", nullable = false)
    private Long iocCount = 0L;

    @Column(name = "status", length = 20, nullable = false)
    private String status = "active";

    @Column(name = "enabled", nullable = false)
    private Boolean enabled = true;

    @Column(name = "description", length = 1000)
    private String description;

    @Column(name = "created_at")
    private Instant createdAt;

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
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
