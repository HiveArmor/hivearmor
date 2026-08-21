package com.hivearmor.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.shared_types.alert.UtmAlert;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Default adapter that resolves {@link AlertQueryPort} against the existing
 * {@link UtmAlertService}.
 *
 * <p>Only the raw field map is returned here; whitelist filtering is the
 * responsibility of {@link HaAlertContextService}.
 */
@Component
public class AlertQueryAdapter implements AlertQueryPort {

    private static final Logger log = LoggerFactory.getLogger(AlertQueryAdapter.class);

    private final UtmAlertService alertService;
    private final ObjectMapper objectMapper;

    public AlertQueryAdapter(UtmAlertService alertService, ObjectMapper objectMapper) {
        this.alertService = alertService;
        this.objectMapper = objectMapper;
    }

    @Override
    public Map<String, Object> findById(String alertId) {
        try {
            List<UtmAlert> results = alertService.getAlertsByIds(List.of(alertId));
            if (results == null || results.isEmpty()) {
                return null;
            }
            UtmAlert alert = results.get(0);
            // Convert via ObjectMapper to produce a consistent key-value map
            // that mirrors the JSON serialisation of UtmAlert without any
            // unwhitelisted fields being visible downstream.
            return objectMapper.convertValue(alert, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            log.warn("AlertQueryAdapter.findById failed for alertId={}", alertId);
            return null;
        }
    }
}
