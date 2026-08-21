package com.hivearmor.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * JPA entity for the hive_misp_feed table.
 * Stores configured MISP instance sources that HiveArmor polls for IOC attributes.
 * API keys are stored encrypted using CipherUtil with INTERNAL_KEY.
 *
 * Backs GET/POST/PUT/DELETE /api/ha-threat-intel/misp-feeds
 *
 * No Lombok — all accessors are explicit public methods.
 */
@Entity
@Table(name = "hive_misp_feed")
public class HiveMispFeed implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;

    @Column(name = "misp_url")
    private String mispUrl;

    /** AES-encrypted MISP API key. Decrypt via CipherUtil using INTERNAL_KEY. */
    @Column(name = "api_key_encrypted")
    private String apiKeyEncrypted;

    private Boolean enabled = true;

    @Column(name = "filter_tags")
    private String filterTags;

    @Column(name = "last_sync_at")
    private Instant lastSyncAt;

    @Column(name = "last_sync_count")
    private Integer lastSyncCount = 0;

    // ---- constructors ----

    public HiveMispFeed() {
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

    public String getMispUrl() {
        return mispUrl;
    }

    public void setMispUrl(String mispUrl) {
        this.mispUrl = mispUrl;
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

    public String getFilterTags() {
        return filterTags;
    }

    public void setFilterTags(String filterTags) {
        this.filterTags = filterTags;
    }

    public Instant getLastSyncAt() {
        return lastSyncAt;
    }

    public void setLastSyncAt(Instant lastSyncAt) {
        this.lastSyncAt = lastSyncAt;
    }

    public Integer getLastSyncCount() {
        return lastSyncCount;
    }

    public void setLastSyncCount(Integer lastSyncCount) {
        this.lastSyncCount = lastSyncCount;
    }
}
