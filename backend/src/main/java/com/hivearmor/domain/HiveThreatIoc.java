package com.hivearmor.domain;

import jakarta.persistence.*;

import java.io.Serializable;
import java.time.Instant;

/**
 * JPA entity for the hive_threat_ioc table.
 *
 * Stores normalized Indicators of Compromise (IOCs) ingested from TAXII 2.1 and MISP
 * sources. Each record carries the IOC type, value, confidence score (0–100), TLP
 * handling level, source feed reference, and lifecycle timestamps.
 *
 * Deduplication key is (ioc_type, ioc_value, feed_id) — enforced by a UNIQUE
 * constraint in the Liquibase changelog.
 *
 * No Lombok — all accessors are explicit public methods.
 */
@Entity
@Table(name = "hive_threat_ioc")
public class HiveThreatIoc implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** IOC type: ip | domain | hash | url | email */
    @Column(name = "ioc_type")
    private String iocType;

    /** Raw IOC value (IP address, domain name, hash, URL, or email). */
    @Column(name = "ioc_value")
    private String iocValue;

    /** Confidence score 0–100. Defaults to 50 on first ingest. */
    private Integer confidence = 50;

    /** Traffic Light Protocol level: WHITE | GREEN | AMBER | RED. */
    private String tlp = "WHITE";

    /** FK to hive_taxii_feed(id) or hive_misp_feed(id) depending on source. */
    @Column(name = "feed_id")
    private Long feedId;

    /** Snapshot of the source feed display name at ingest time. */
    @Column(name = "feed_name")
    private String feedName;

    /** STIX indicator ID or MISP attribute ID from the originating source. */
    @Column(name = "source_ref")
    private String sourceRef;

    @Column(name = "first_seen")
    private Instant firstSeen;

    @Column(name = "last_seen")
    private Instant lastSeen;

    /** Optional explicit expiry instant. Null means no hard expiry date. */
    @Column(name = "expires_at")
    private Instant expiresAt;

    /** Free-form comma-separated tags (e.g. MISP event tags). */
    private String tags;

    /** False when the IOC has decayed below MIN_CONFIDENCE or passed its expiry. */
    private Boolean active = true;

    /**
     * True for the highest-confidence row in each (ioc_type, ioc_value) group.
     * Set by IocMaintenanceService during daily deduplication pass.
     */
    @Column(name = "primary_ioc")
    private Boolean primaryIoc = false;

    // ---- constructors ----

    public HiveThreatIoc() {
    }

    // ---- getters / setters ----

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getIocType() {
        return iocType;
    }

    public void setIocType(String iocType) {
        this.iocType = iocType;
    }

    public String getIocValue() {
        return iocValue;
    }

    public void setIocValue(String iocValue) {
        this.iocValue = iocValue;
    }

    public Integer getConfidence() {
        return confidence;
    }

    public void setConfidence(Integer confidence) {
        this.confidence = confidence;
    }

    public String getTlp() {
        return tlp;
    }

    public void setTlp(String tlp) {
        this.tlp = tlp;
    }

    public Long getFeedId() {
        return feedId;
    }

    public void setFeedId(Long feedId) {
        this.feedId = feedId;
    }

    public String getFeedName() {
        return feedName;
    }

    public void setFeedName(String feedName) {
        this.feedName = feedName;
    }

    public String getSourceRef() {
        return sourceRef;
    }

    public void setSourceRef(String sourceRef) {
        this.sourceRef = sourceRef;
    }

    public Instant getFirstSeen() {
        return firstSeen;
    }

    public void setFirstSeen(Instant firstSeen) {
        this.firstSeen = firstSeen;
    }

    public Instant getLastSeen() {
        return lastSeen;
    }

    public void setLastSeen(Instant lastSeen) {
        this.lastSeen = lastSeen;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(Instant expiresAt) {
        this.expiresAt = expiresAt;
    }

    public String getTags() {
        return tags;
    }

    public void setTags(String tags) {
        this.tags = tags;
    }

    public Boolean getActive() {
        return active;
    }

    public void setActive(Boolean active) {
        this.active = active;
    }

    public Boolean getPrimaryIoc() {
        return primaryIoc;
    }

    public void setPrimaryIoc(Boolean primaryIoc) {
        this.primaryIoc = primaryIoc;
    }
}
