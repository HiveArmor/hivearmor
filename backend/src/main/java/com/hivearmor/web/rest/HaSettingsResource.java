package com.hivearmor.web.rest;

import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.service.HivePlatformSettingsService;
import com.hivearmor.service.dto.HivePlatformSettingsDTO;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * REST controller for the Platform Settings admin page.
 *
 * GET /api/ha-settings   — read all platform settings
 * PUT /api/ha-settings   — write/update platform settings
 */
@RestController
@RequestMapping("/api")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class HaSettingsResource {

    private static final Logger log = LoggerFactory.getLogger(HaSettingsResource.class);

    private final HivePlatformSettingsService service;

    public HaSettingsResource(HivePlatformSettingsService service) {
        this.service = service;
    }

    @GetMapping("/ha-settings")
    public ResponseEntity<HivePlatformSettingsDTO> getSettings() {
        log.debug("REST request to get platform settings");
        return ResponseEntity.ok(service.getSettings());
    }

    @PutMapping("/ha-settings")
    public ResponseEntity<HivePlatformSettingsDTO> updateSettings(@Valid @RequestBody HivePlatformSettingsDTO dto) {
        log.debug("REST request to update platform settings");
        return ResponseEntity.ok(service.saveSettings(dto));
    }
}
