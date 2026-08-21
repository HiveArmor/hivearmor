package com.hivearmor.multitenancy;

import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

@Component
public class MsspIndexResolver {

    static final DateTimeFormatter INDEX_DATE_FORMAT = DateTimeFormatter.ofPattern("yyyy.MM.dd");
    private static final String INDEX_ROOT = "v3-hive-";

    public String resolveCurrentDayAlertIndex() {
        return resolveCurrentDayIndex("alert");
    }

    public String resolveCurrentDayIndex(String type) {
        String prefix = TenantContext.get();
        String date   = LocalDate.now().format(INDEX_DATE_FORMAT);
        if (prefix != null) {
            return INDEX_ROOT + type + "-" + prefix + "-" + date;
        }
        return INDEX_ROOT + type + "-" + date;
    }

    public String resolveAlertIndexPattern() {
        return resolveIndexPattern("alert");
    }

    public String resolveIndexPattern(String type) {
        String prefix = TenantContext.get();
        if (prefix != null && !prefix.isBlank()) {
            return INDEX_ROOT + type + "-" + prefix + "-*";
        }
        return INDEX_ROOT + type + "-*";
    }

    public String resolveIndexPatternForPrefix(String type, String tenantPrefix) {
        if (tenantPrefix == null || tenantPrefix.isBlank()) {
            return resolveIndexPattern(type);
        }
        return INDEX_ROOT + type + "-" + tenantPrefix.trim() + "-*";
    }
}
