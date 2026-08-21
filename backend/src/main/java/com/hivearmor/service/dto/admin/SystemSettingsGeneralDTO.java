package com.hivearmor.service.dto.admin;

/**
 * DTO for the General settings tab.
 *
 * <p>Carries platform-wide general configuration: site name, timezone, and
 * default locale. None of these fields are sensitive, so no masking is needed.
 */
public class SystemSettingsGeneralDTO {

    /** Display name shown in the UI header and email notifications. */
    private String siteName;

    /** IANA timezone identifier, e.g. {@code "UTC"}, {@code "America/New_York"}. */
    private String timezone;

    /** BCP-47 locale tag, e.g. {@code "en"}, {@code "es"}. */
    private String defaultLocale;

    // -------------------------------------------------------------------------
    // Accessors
    // -------------------------------------------------------------------------

    public String getSiteName() {
        return siteName;
    }

    public void setSiteName(String siteName) {
        this.siteName = siteName;
    }

    public String getTimezone() {
        return timezone;
    }

    public void setTimezone(String timezone) {
        this.timezone = timezone;
    }

    public String getDefaultLocale() {
        return defaultLocale;
    }

    public void setDefaultLocale(String defaultLocale) {
        this.defaultLocale = defaultLocale;
    }
}
