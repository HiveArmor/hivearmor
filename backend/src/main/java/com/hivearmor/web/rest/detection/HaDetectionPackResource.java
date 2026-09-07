package com.hivearmor.web.rest.detection;

import com.hivearmor.service.detection.DetectionPackService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * DET-MSSP-001 — tenant detection pack inventory.
 *
 * <p>Never returns another tenant's pack when {@code X-Tenant-ID} is set.
 * Without tenant context, only the shared platform pack is listed.
 */
@RestController
@RequestMapping("/api")
public class HaDetectionPackResource {

    private static final String ALERT_QUEUE_AUTH =
        "hasAuthority('ROLE_SOC_ANALYST') or hasAuthority('ROLE_SOC_MANAGER') "
            + "or hasAuthority('ROLE_ANALYST') or hasAuthority('ROLE_ADMIN') "
            + "or hasAuthority('MSSP_ADMIN')";

    private final DetectionPackService packService;

    public HaDetectionPackResource(DetectionPackService packService) {
        this.packService = packService;
    }

    @GetMapping("/ha-detection-packs")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    public ResponseEntity<Map<String, Object>> listPacks() {
        return ResponseEntity.ok(packService.listPacks());
    }
}
