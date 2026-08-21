package com.hivearmor.domain;

import jakarta.persistence.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.io.Serializable;
import java.time.Instant;

/**
 * Notification routing rule: when an alert of the specified severity arrives,
 * forward it to the configured destination.
 *
 * ADM-03 — backs /api/ha-notification-rules
 */
@Entity
@Table(name = "hive_notification_rule")
@EntityListeners(AuditingEntityListener.class)
public class HiveNotificationRule implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 255)
    private String name;

    /** Minimum alert severity that triggers this rule (1=low … 10=critical). */
    @Column(name = "severity_threshold", nullable = false)
    private Integer severityThreshold = 3;

    /** email | webhook | slack | teams | pagerduty */
    @Column(name = "destination_type", nullable = false, length = 64)
    private String destinationType;

    /**
     * JSON-serialised map of destination config keys/values.
     * Stored as TEXT; serialised/deserialised by the service layer.
     */
    @Column(name = "destination_config", nullable = false, columnDefinition = "text")
    private String destinationConfig;

    @Column(nullable = false)
    private Boolean enabled = true;

    @Column(name = "tenant_id")
    private Long tenantId;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // ---- getters / setters ----

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public Integer getSeverityThreshold() { return severityThreshold; }
    public void setSeverityThreshold(Integer severityThreshold) { this.severityThreshold = severityThreshold; }

    public String getDestinationType() { return destinationType; }
    public void setDestinationType(String destinationType) { this.destinationType = destinationType; }

    public String getDestinationConfig() { return destinationConfig; }
    public void setDestinationConfig(String destinationConfig) { this.destinationConfig = destinationConfig; }

    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean enabled) { this.enabled = enabled; }

    public Long getTenantId() { return tenantId; }
    public void setTenantId(Long tenantId) { this.tenantId = tenantId; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
