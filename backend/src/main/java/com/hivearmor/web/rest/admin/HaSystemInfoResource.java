package com.hivearmor.web.rest.admin;

import com.hivearmor.config.HaAirGapConfig;
import com.hivearmor.security.AuthoritiesConstants;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Admin-only REST controller that returns read-only system information
 * including the current air-gap mode state.
 *
 * <p>Non-admin callers receive HTTP 403 from Spring Security before the
 * method body is reached.
 *
 * <p>Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
@RestController
@RequestMapping("/api/ha-admin")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class HaSystemInfoResource {

    private final HaAirGapConfig airGapConfig;
    private final String appName;
    private final String version;

    public HaSystemInfoResource(
            HaAirGapConfig airGapConfig,
            @Value("${jhipster.api-docs.title:HiveArmor}") String appName,
            @Value("${jhipster.api-docs.version:unknown}") String version) {
        this.airGapConfig = airGapConfig;
        this.appName = appName;
        this.version = version;
    }

    /**
     * {@code GET /api/ha-admin/system-info} — returns system metadata including
     * air-gap mode, OS details, and Java version.
     *
     * @return HTTP 200 with a five-field JSON body
     */
    @GetMapping("/system-info")
    public ResponseEntity<Map<String, Object>> getSystemInfo() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("appName", appName);
        body.put("version", version);
        body.put("airGapMode", airGapConfig.isAirGap());
        body.put("osVersion", System.getProperty("os.name") + " " + System.getProperty("os.version"));
        body.put("javaVersion", System.getProperty("java.version"));
        return ResponseEntity.ok(body);
    }
}
