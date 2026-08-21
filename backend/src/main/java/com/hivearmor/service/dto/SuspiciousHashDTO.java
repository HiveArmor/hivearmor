package com.hivearmor.service.dto;

/**
 * DTO representing a suspicious file hash observed across one or more endpoints,
 * optionally correlated against threat intelligence.
 *
 * <p>No Lombok — every accessor is an explicit public method.
 */
public class SuspiciousHashDTO {

    private String sha256Hash;
    private String filename;
    private String firstSeen;
    private String lastSeen;
    private int endpointCount;
    private boolean threatIntelHit;

    // ---- Getters ----

    public String getSha256Hash() {
        return sha256Hash;
    }

    public String getFilename() {
        return filename;
    }

    public String getFirstSeen() {
        return firstSeen;
    }

    public String getLastSeen() {
        return lastSeen;
    }

    public int getEndpointCount() {
        return endpointCount;
    }

    public boolean isThreatIntelHit() {
        return threatIntelHit;
    }

    // ---- Setters ----

    public void setSha256Hash(String sha256Hash) {
        this.sha256Hash = sha256Hash;
    }

    public void setFilename(String filename) {
        this.filename = filename;
    }

    public void setFirstSeen(String firstSeen) {
        this.firstSeen = firstSeen;
    }

    public void setLastSeen(String lastSeen) {
        this.lastSeen = lastSeen;
    }

    public void setEndpointCount(int endpointCount) {
        this.endpointCount = endpointCount;
    }

    public void setThreatIntelHit(boolean threatIntelHit) {
        this.threatIntelHit = threatIntelHit;
    }
}
