package com.hivearmor.service.dto;

/**
 * HiveArmor TLP-filtered IOC DTO.
 *
 * Returned by ThreatIntelLookupService.lookupIOCForUser to enforce TLP handling rules.
 *
 * TLP:RED iocValue is null and restricted = true for non-privileged users.
 * TLP:AMBER iocValue may contain a redaction marker ('*') for non-privileged users.
 * TLP:WHITE / TLP:GREEN are always returned in full.
 *
 * No Lombok — explicit accessor methods only.
 */
public class TlpFilteredIocDTO {

    private String iocType;

    /**
     * The IOC value, possibly redacted.
     * Null when TLP is RED and the caller is not privileged.
     */
    private String iocValue;

    private Integer confidence;

    /** TLP level: WHITE | GREEN | AMBER | RED */
    private String tlp;

    /**
     * True when iocValue has been set to null due to TLP:RED restriction.
     * The client should render "TLP:RED — Restricted" instead of the value.
     */
    private boolean restricted;

    // constructors

    public TlpFilteredIocDTO() {
    }

    public TlpFilteredIocDTO(String iocType, String iocValue, Integer confidence,
                               String tlp, boolean restricted) {
        this.iocType = iocType;
        this.iocValue = iocValue;
        this.confidence = confidence;
        this.tlp = tlp;
        this.restricted = restricted;
    }

    // getters / setters

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

    public boolean isRestricted() {
        return restricted;
    }

    public void setRestricted(boolean restricted) {
        this.restricted = restricted;
    }
}
