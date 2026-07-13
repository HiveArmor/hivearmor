package com.hivearmor.util;

import com.hivearmor.config.Constants;

import java.time.DateTimeException;
import java.time.ZoneId;

import static com.hivearmor.config.Constants.PROP_DATE_SETTINGS_TIMEZONE;

public class TimezoneUtil {

    public static ZoneId getAppTimezone() {
        ZoneId timezone;
        try {
            timezone = ZoneId.of(Constants.CFG.get(PROP_DATE_SETTINGS_TIMEZONE));
        } catch (DateTimeException e) {
            timezone = ZoneId.systemDefault();
        }
        return timezone;
    }
}
