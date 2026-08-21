package com.hivearmor.domain;

import jakarta.persistence.*;

import java.io.Serializable;
import java.time.Instant;

/**
 * JPA entity for the hive_taxii_feed table.
 *
 * Stores configured TAXII 2.1 server sources that HiveArmor polls for STIX 2.1
 * indicator bundles. API keys are stored encrypted using CipherUtil with INTERNAL_KEY.
 *
 * Backs GET/POST/PUT/DELETE /api/ha-threat-intel/taxii-feeds
 *
 * No Lombok — all accessors are explicit public methods.
 */
@Entity
@Table(name = "hive_taxii_feed")
public class HiveTaxiiFeed implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;

    @Column(name = "taxii_url")
    private String taxiiUrl;

    @Column(name = "collection_id")
    private String collectionId;

    /** AES-encrypted TAXII API key. Decrypt via CipherUtil using INTERNAL_KEY. */
    @Column(name = "api_key_encrypted")
    private String apiKeyEncrypted;

    private Boolean enabled = true;

    @Column(name = "last_sync_at")
    private Instant lastSyncAt;

    @Column(name = "last_sync_status")
    private String lastSyncStatus;

    @Column(name = "last_sync_count")
    private Integer lastSyncCount = 0;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    // ---- constructors ----

    public HiveTaxiiFeed() {
    }

    @PrePersist
    private void onPrePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    // ---- getters / setters ----

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getTaxiiUrl() {
        return taxiiUrl;
    }

    public void setTaxiiUrl(String taxiiUrl) {
        this.taxiiUrl = taxiiUrl;
    }

    public String getCollectionId() {
        return collectionId;
    }

    public void setCollectionId(String collectionId) {
        this.collectionId = collectionId;
    }

    public String getApiKeyEncrypted() {
        return apiKeyEncrypted;
    }

    public void setApiKeyEncrypted(String apiKeyEncrypted) {
        this.apiKeyEncrypted = apiKeyEncrypted;
    }

    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    public Instant getLastSyncAt() {
        return lastSyncAt;
    }

    public void setLastSyncAt(Instant lastSyncAt) {
        this.lastSyncAt = lastSyncAt;
    }

    public String getLastSyncStatus() {
        return lastSyncStatus;
    }

    public void setLastSyncStatus(String lastSyncStatus) {
        this.lastSyncStatus = lastSyncStatus;
    }

    public Integer getLastSyncCount() {
        return lastSyncCount;
    }

    public void setLastSyncCount(Integer lastSyncCount) {
        this.lastSyncCount = lastSyncCount;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
