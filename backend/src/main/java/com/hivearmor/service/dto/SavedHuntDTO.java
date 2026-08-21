package com.hivearmor.service.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;

/**
 * DTO for {@link com.hivearmor.domain.HaSavedHunt}.
 *
 * Transferred over the wire by GET/POST/PUT /api/ha-saved-hunts.
 */
public class SavedHuntDTO {

    private Long id;

    @NotBlank
    @Size(max = 200)
    private String huntName;

    @Size(max = 65536)
    private String queryDsl;

    @Size(max = 500)
    private String nlQuery;

    @Size(max = 65536)
    private String filterJson;

    private String createdBy;
    private Instant createdAt;
    private Boolean isShared;
    private Instant lastUsedAt;

    // ---- no-arg constructor ----

    public SavedHuntDTO() {}

    // ---- all-args constructor ----

    public SavedHuntDTO(Long id, String huntName, String queryDsl, String nlQuery,
                        String filterJson, String createdBy, Instant createdAt,
                        Boolean isShared, Instant lastUsedAt) {
        this.id = id;
        this.huntName = huntName;
        this.queryDsl = queryDsl;
        this.nlQuery = nlQuery;
        this.filterJson = filterJson;
        this.createdBy = createdBy;
        this.createdAt = createdAt;
        this.isShared = isShared;
        this.lastUsedAt = lastUsedAt;
    }

    // ---- getters / setters ----

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getHuntName() { return huntName; }
    public void setHuntName(String huntName) { this.huntName = huntName; }

    public String getQueryDsl() { return queryDsl; }
    public void setQueryDsl(String queryDsl) { this.queryDsl = queryDsl; }

    public String getNlQuery() { return nlQuery; }
    public void setNlQuery(String nlQuery) { this.nlQuery = nlQuery; }

    public String getFilterJson() { return filterJson; }
    public void setFilterJson(String filterJson) { this.filterJson = filterJson; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Boolean getIsShared() { return isShared; }
    public void setIsShared(Boolean isShared) { this.isShared = isShared; }

    public Instant getLastUsedAt() { return lastUsedAt; }
    public void setLastUsedAt(Instant lastUsedAt) { this.lastUsedAt = lastUsedAt; }
}
