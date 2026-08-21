package com.hivearmor.web.rest;

import com.hivearmor.config.HiveArmorProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * REST controller exposing the logical dataset registry.
 * <p>
 * GET /api/ha-datasets — returns the curated list of named datasets, each mapping
 * a friendly label to an OpenSearch index pattern. Config-driven via
 * {@code hivearmor.datasets} in application.yml — no DB table required.
 * <p>
 * S-7A
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class DatasetResource {

    private final HiveArmorProperties hiveArmorProperties;

    /**
     * GET /api/ha-datasets — returns all configured logical datasets.
     * Accessible to all authenticated roles (including READ_ONLY).
     */
    @GetMapping("/ha-datasets")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<HiveArmorProperties.DatasetConfig>> getDatasets() {
        List<HiveArmorProperties.DatasetConfig> datasets = hiveArmorProperties.getDatasets();
        return ResponseEntity.ok(datasets == null ? List.of() : datasets);
    }
}
