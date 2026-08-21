package com.hivearmor.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * DTO matching the frontend PlatformSettingsDTO TypeScript type.
 * Composed of four nested setting groups backed by hive_configuration_parameter rows.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class HivePlatformSettingsDTO {

    @Valid
    private GeneralSettings general;
    @Valid
    private AuthSettings auth;
    @Valid
    private NotificationDefaults notificationDefaults;
    @Valid
    private LoggingSettings logging;

    // ---- nested types (match frontend shape exactly) ----

    public static class GeneralSettings {
        @Size(max = 200)
        private String platformName;
        @Size(max = 500)
        private String platformLogoUrl;
        private String timezone;
        private String dateFormat;
        private String language;

        public String getPlatformName() { return platformName; }
        public void setPlatformName(String v) { this.platformName = v; }
        public String getPlatformLogoUrl() { return platformLogoUrl; }
        public void setPlatformLogoUrl(String v) { this.platformLogoUrl = v; }
        public String getTimezone() { return timezone; }
        public void setTimezone(String v) { this.timezone = v; }
        public String getDateFormat() { return dateFormat; }
        public void setDateFormat(String v) { this.dateFormat = v; }
        public String getLanguage() { return language; }
        public void setLanguage(String v) { this.language = v; }
    }

    public static class AuthSettings {
        private Boolean localAuthEnabled;
        private Boolean mfaEnforced;
        @Min(1)
        private Integer sessionTimeoutMinutes;
        @Min(1)
        private Integer maxFailedLoginAttempts;
        @Min(1)
        private Integer lockoutDurationMinutes;

        public Boolean getLocalAuthEnabled() { return localAuthEnabled; }
        public void setLocalAuthEnabled(Boolean v) { this.localAuthEnabled = v; }
        public Boolean getMfaEnforced() { return mfaEnforced; }
        public void setMfaEnforced(Boolean v) { this.mfaEnforced = v; }
        public Integer getSessionTimeoutMinutes() { return sessionTimeoutMinutes; }
        public void setSessionTimeoutMinutes(Integer v) { this.sessionTimeoutMinutes = v; }
        public Integer getMaxFailedLoginAttempts() { return maxFailedLoginAttempts; }
        public void setMaxFailedLoginAttempts(Integer v) { this.maxFailedLoginAttempts = v; }
        public Integer getLockoutDurationMinutes() { return lockoutDurationMinutes; }
        public void setLockoutDurationMinutes(Integer v) { this.lockoutDurationMinutes = v; }
    }

    public static class NotificationDefaults {
        private String defaultEmailSender;
        private Boolean alertNotificationsEnabled;
        private Boolean incidentNotificationsEnabled;
        private Boolean systemNotificationsEnabled;

        public String getDefaultEmailSender() { return defaultEmailSender; }
        public void setDefaultEmailSender(String v) { this.defaultEmailSender = v; }
        public Boolean getAlertNotificationsEnabled() { return alertNotificationsEnabled; }
        public void setAlertNotificationsEnabled(Boolean v) { this.alertNotificationsEnabled = v; }
        public Boolean getIncidentNotificationsEnabled() { return incidentNotificationsEnabled; }
        public void setIncidentNotificationsEnabled(Boolean v) { this.incidentNotificationsEnabled = v; }
        public Boolean getSystemNotificationsEnabled() { return systemNotificationsEnabled; }
        public void setSystemNotificationsEnabled(Boolean v) { this.systemNotificationsEnabled = v; }
    }

    public static class LoggingSettings {
        /** DEBUG | INFO | WARN | ERROR */
        @Pattern(regexp = "DEBUG|INFO|WARN|ERROR")
        private String logLevel;
        @Min(1)
        private Integer retainDebugLogsHours;

        public String getLogLevel() { return logLevel; }
        public void setLogLevel(String v) { this.logLevel = v; }
        public Integer getRetainDebugLogsHours() { return retainDebugLogsHours; }
        public void setRetainDebugLogsHours(Integer v) { this.retainDebugLogsHours = v; }
    }

    // ---- root getters / setters ----

    public GeneralSettings getGeneral() { return general; }
    public void setGeneral(GeneralSettings general) { this.general = general; }

    public AuthSettings getAuth() { return auth; }
    public void setAuth(AuthSettings auth) { this.auth = auth; }

    public NotificationDefaults getNotificationDefaults() { return notificationDefaults; }
    public void setNotificationDefaults(NotificationDefaults notificationDefaults) { this.notificationDefaults = notificationDefaults; }

    public LoggingSettings getLogging() { return logging; }
    public void setLogging(LoggingSettings logging) { this.logging = logging; }
}
