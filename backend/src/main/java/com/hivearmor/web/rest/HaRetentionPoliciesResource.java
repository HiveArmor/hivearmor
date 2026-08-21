package com.hivearmor.web.rest;

import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.service.HiveRetentionPolicyService;
import com.hivearmor.service.dto.HiveRetentionPolicyDTO;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST controller for the Retention Policy admin page.
 *
 * GET /api/ha-retention-policies              — list all policies
 * GET /api/ha-retention-policies/{dataType}   — get one by dataType
 * PUT /api/ha-retention-policies/{dataType}   — upsert policy for dataType
 */
@RestController
@RequestMapping("/api")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class HaRetentionPoliciesResource {

    private static final Logger log = LoggerFactory.getLogger(HaRetentionPoliciesResource.class);

    private final HiveRetentionPolicyService service;

    public HaRetentionPoliciesResource(HiveRetentionPolicyService service) {
        this.service = service;
    }

    @GetMapping("/ha-retention-policies")
    public ResponseEntity<List<HiveRetentionPolicyDTO>> getAll() {
        log.debug("REST request to get all retention policies");
        return ResponseEntity.ok(service.findAll());
    }

    @GetMapping("/ha-retention-policies/{dataType}")
    public ResponseEntity<HiveRetentionPolicyDTO> getByDataType(@PathVariable String dataType) {
        log.debug("REST request to get retention policy for dataType: {}", dataType);
        return service.findByDataType(dataType)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/ha-retention-policies/{dataType}")
    public ResponseEntity<HiveRetentionPolicyDTO> upsert(@PathVariable String dataType,
                                                         @Valid @RequestBody HiveRetentionPolicyDTO dto) {
        log.debug("REST request to upsert retention policy for dataType: {}", dataType);
        if (HiveRetentionPolicyService.ENROLLMENT_AUDIT.equalsIgnoreCase(dataType)
            && dto.getArchiveTarget() != null
            && !"NONE".equalsIgnoreCase(dto.getArchiveTarget())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).build();
        }
        return ResponseEntity.ok(service.upsert(dataType, dto));
    }
}
