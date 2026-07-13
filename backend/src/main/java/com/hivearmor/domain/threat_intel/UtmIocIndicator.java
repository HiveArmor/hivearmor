package com.hivearmor.domain.threat_intel;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "hive_ioc_indicator")
public class UtmIocIndicator implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "value", length = 2048, nullable = false)
    private String value;

    @Column(name = "ioc_type", length = 20, nullable = false)
    private String iocType;

    @Column(name = "first_seen")
    private Instant firstSeen;

    @Column(name = "last_seen")
    private Instant lastSeen;

    @Column(name = "threat_score", nullable = false)
    private Integer threatScore = 0;

    @Column(name = "classification", length = 200)
    private String classification;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "country", length = 100)
    private String country;

    @Column(name = "asn", length = 200)
    private String asn;

    @Column(name = "tags", columnDefinition = "TEXT")
    private String tags;

    @Column(name = "source_feeds_json", columnDefinition = "TEXT")
    private String sourceFeedsJson;

    @Column(name = "mitre_techniques_json", columnDefinition = "TEXT")
    private String mitreTechniquesJson;

    @Column(name = "related_iocs_json", columnDefinition = "TEXT")
    private String relatedIocsJson;

    @Column(name = "alert_count")
    private Integer alertCount = 0;

    @Column(name = "feed_id", length = 50)
    private String feedId;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getValue() { return value; }
    public void setValue(String value) { this.value = value; }
    public String getIocType() { return iocType; }
    public void setIocType(String iocType) { this.iocType = iocType; }
    public Instant getFirstSeen() { return firstSeen; }
    public void setFirstSeen(Instant firstSeen) { this.firstSeen = firstSeen; }
    public Instant getLastSeen() { return lastSeen; }
    public void setLastSeen(Instant lastSeen) { this.lastSeen = lastSeen; }
    public Integer getThreatScore() { return threatScore; }
    public void setThreatScore(Integer threatScore) { this.threatScore = threatScore; }
    public String getClassification() { return classification; }
    public void setClassification(String classification) { this.classification = classification; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }
    public String getAsn() { return asn; }
    public void setAsn(String asn) { this.asn = asn; }
    public String getTags() { return tags; }
    public void setTags(String tags) { this.tags = tags; }
    public String getSourceFeedsJson() { return sourceFeedsJson; }
    public void setSourceFeedsJson(String sourceFeedsJson) { this.sourceFeedsJson = sourceFeedsJson; }
    public String getMitreTechniquesJson() { return mitreTechniquesJson; }
    public void setMitreTechniquesJson(String mitreTechniquesJson) { this.mitreTechniquesJson = mitreTechniquesJson; }
    public String getRelatedIocsJson() { return relatedIocsJson; }
    public void setRelatedIocsJson(String relatedIocsJson) { this.relatedIocsJson = relatedIocsJson; }
    public Integer getAlertCount() { return alertCount; }
    public void setAlertCount(Integer alertCount) { this.alertCount = alertCount; }
    public String getFeedId() { return feedId; }
    public void setFeedId(String feedId) { this.feedId = feedId; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
