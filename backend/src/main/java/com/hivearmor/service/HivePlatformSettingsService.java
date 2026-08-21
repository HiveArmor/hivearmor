package com.hivearmor.service;

import com.hivearmor.domain.UtmConfigurationParameter;
import com.hivearmor.repository.UtmConfigurationParameterRepository;
import com.hivearmor.service.dto.HivePlatformSettingsDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Service for the Platform Settings page.
 * Reads and writes to hive_configuration_parameter rows using well-known keys.
 * Falls back to sensible defaults when a key is not yet seeded.
 *
 * Backs GET /api/ha-settings and PUT /api/ha-settings.
 */
@Service
@Transactional
public class HivePlatformSettingsService {

    private static final Logger log = LoggerFactory.getLogger(HivePlatformSettingsService.class);

    // ---- well-known parameter short-keys ----
    static final String KEY_PLATFORM_NAME            = "hivearmor.platform.name";
    static final String KEY_PLATFORM_LOGO            = "hivearmor.platform.logoUrl";
    static final String KEY_TIMEZONE                 = "hivearmor.time.zone";
    static final String KEY_DATE_FORMAT              = "hivearmor.platform.dateFormat";
    static final String KEY_LANGUAGE                 = "hivearmor.platform.language";

    static final String KEY_LOCAL_AUTH               = "hivearmor.auth.localAuthEnabled";
    static final String KEY_MFA_ENFORCED             = "hivearmor.tfa.enable";
    static final String KEY_SESSION_TIMEOUT          = "hivearmor.auth.sessionTimeoutMinutes";
    static final String KEY_MAX_FAILED_LOGINS        = "hivearmor.auth.maxFailedLoginAttempts";
    static final String KEY_LOCKOUT_DURATION         = "hivearmor.auth.lockoutDurationMinutes";

    static final String KEY_DEFAULT_EMAIL_SENDER     = "hivearmor.mail.from";
    static final String KEY_ALERT_NOTIFICATIONS      = "hivearmor.notifications.alertEnabled";
    static final String KEY_INCIDENT_NOTIFICATIONS   = "hivearmor.notifications.incidentEnabled";
    static final String KEY_SYSTEM_NOTIFICATIONS     = "hivearmor.notifications.systemEnabled";

    static final String KEY_LOG_LEVEL                = "hivearmor.logging.level";
    static final String KEY_DEBUG_LOG_RETAIN         = "hivearmor.logging.retainDebugLogsHours";

    private final UtmConfigurationParameterRepository configRepo;

    public HivePlatformSettingsService(UtmConfigurationParameterRepository configRepo) {
        this.configRepo = configRepo;
    }

    @Transactional(readOnly = true)
    public HivePlatformSettingsDTO getSettings() {
        Map<String, String> params = loadAllAsMap();

        HivePlatformSettingsDTO dto = new HivePlatformSettingsDTO();

        HivePlatformSettingsDTO.GeneralSettings general = new HivePlatformSettingsDTO.GeneralSettings();
        general.setPlatformName(params.getOrDefault(KEY_PLATFORM_NAME, "HiveArmor"));
        general.setPlatformLogoUrl(params.get(KEY_PLATFORM_LOGO)); // nullable
        general.setTimezone(params.getOrDefault(KEY_TIMEZONE, "UTC"));
        general.setDateFormat(params.getOrDefault(KEY_DATE_FORMAT, "YYYY-MM-DD HH:mm:ss"));
        general.setLanguage(params.getOrDefault(KEY_LANGUAGE, "en"));
        dto.setGeneral(general);

        HivePlatformSettingsDTO.AuthSettings auth = new HivePlatformSettingsDTO.AuthSettings();
        auth.setLocalAuthEnabled(parseBool(params.get(KEY_LOCAL_AUTH), true));
        auth.setMfaEnforced(parseBool(params.get(KEY_MFA_ENFORCED), false));
        auth.setSessionTimeoutMinutes(parseInt(params.get(KEY_SESSION_TIMEOUT), 60));
        auth.setMaxFailedLoginAttempts(parseInt(params.get(KEY_MAX_FAILED_LOGINS), 5));
        auth.setLockoutDurationMinutes(parseInt(params.get(KEY_LOCKOUT_DURATION), 15));
        dto.setAuth(auth);

        HivePlatformSettingsDTO.NotificationDefaults nd = new HivePlatformSettingsDTO.NotificationDefaults();
        nd.setDefaultEmailSender(params.get(KEY_DEFAULT_EMAIL_SENDER));
        nd.setAlertNotificationsEnabled(parseBool(params.get(KEY_ALERT_NOTIFICATIONS), true));
        nd.setIncidentNotificationsEnabled(parseBool(params.get(KEY_INCIDENT_NOTIFICATIONS), true));
        nd.setSystemNotificationsEnabled(parseBool(params.get(KEY_SYSTEM_NOTIFICATIONS), true));
        dto.setNotificationDefaults(nd);

        HivePlatformSettingsDTO.LoggingSettings logging = new HivePlatformSettingsDTO.LoggingSettings();
        logging.setLogLevel(params.getOrDefault(KEY_LOG_LEVEL, "INFO"));
        logging.setRetainDebugLogsHours(parseInt(params.get(KEY_DEBUG_LOG_RETAIN), 24));
        dto.setLogging(logging);

        return dto;
    }

    public HivePlatformSettingsDTO saveSettings(HivePlatformSettingsDTO dto) {
        if (dto.getGeneral() != null) {
            upsert(KEY_PLATFORM_NAME,       dto.getGeneral().getPlatformName());
            upsert(KEY_PLATFORM_LOGO,       dto.getGeneral().getPlatformLogoUrl());
            upsert(KEY_TIMEZONE,            dto.getGeneral().getTimezone());
            upsert(KEY_DATE_FORMAT,         dto.getGeneral().getDateFormat());
            upsert(KEY_LANGUAGE,            dto.getGeneral().getLanguage());
        }
        if (dto.getAuth() != null) {
            upsert(KEY_LOCAL_AUTH,       boolStr(dto.getAuth().getLocalAuthEnabled()));
            upsert(KEY_MFA_ENFORCED,     boolStr(dto.getAuth().getMfaEnforced()));
            upsert(KEY_SESSION_TIMEOUT,  intStr(dto.getAuth().getSessionTimeoutMinutes()));
            upsert(KEY_MAX_FAILED_LOGINS,intStr(dto.getAuth().getMaxFailedLoginAttempts()));
            upsert(KEY_LOCKOUT_DURATION, intStr(dto.getAuth().getLockoutDurationMinutes()));
        }
        if (dto.getNotificationDefaults() != null) {
            upsert(KEY_DEFAULT_EMAIL_SENDER,   dto.getNotificationDefaults().getDefaultEmailSender());
            upsert(KEY_ALERT_NOTIFICATIONS,    boolStr(dto.getNotificationDefaults().getAlertNotificationsEnabled()));
            upsert(KEY_INCIDENT_NOTIFICATIONS, boolStr(dto.getNotificationDefaults().getIncidentNotificationsEnabled()));
            upsert(KEY_SYSTEM_NOTIFICATIONS,   boolStr(dto.getNotificationDefaults().getSystemNotificationsEnabled()));
        }
        if (dto.getLogging() != null) {
            upsert(KEY_LOG_LEVEL,         dto.getLogging().getLogLevel());
            upsert(KEY_DEBUG_LOG_RETAIN,  intStr(dto.getLogging().getRetainDebugLogsHours()));
        }
        return getSettings();
    }

    // ---- helpers ----

    private Map<String, String> loadAllAsMap() {
        List<UtmConfigurationParameter> all = configRepo.findAll();
        return all.stream()
            .filter(p -> p.getConfParamShort() != null && p.getConfParamValue() != null)
            .collect(Collectors.toMap(
                UtmConfigurationParameter::getConfParamShort,
                UtmConfigurationParameter::getConfParamValue,
                (a, b) -> b // last write wins if duplicates
            ));
    }

    private void upsert(String key, String value) {
        if (key == null) return;
        Optional<UtmConfigurationParameter> existing = configRepo.findByConfParamShort(key);
        UtmConfigurationParameter param = existing.orElseGet(() -> {
            UtmConfigurationParameter p = new UtmConfigurationParameter();
            p.setSectionId(1L); // default section; adjust if section management is added later
            p.setConfParamShort(key);
            p.setConfParamDatatype("string");
            return p;
        });
        param.setConfParamValue(value);
        param.setModificationTime(Instant.now());
        configRepo.save(param);
    }

    private boolean parseBool(String value, boolean defaultVal) {
        if (value == null) return defaultVal;
        return "true".equalsIgnoreCase(value) || "1".equals(value);
    }

    private int parseInt(String value, int defaultVal) {
        if (value == null) return defaultVal;
        try { return Integer.parseInt(value); } catch (NumberFormatException e) { return defaultVal; }
    }

    private String boolStr(Boolean value) {
        return value == null ? null : (value ? "true" : "false");
    }

    private String intStr(Integer value) {
        return value == null ? null : String.valueOf(value);
    }
}
