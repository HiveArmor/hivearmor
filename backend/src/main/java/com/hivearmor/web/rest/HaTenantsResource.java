package com.hivearmor.web.rest;

import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.service.HiveTenantService;
import com.hivearmor.service.dto.HiveTenantDTO;
import com.hivearmor.util.UtilPagination;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST controller for the Tenants admin page.
 *
 * GET    /api/ha-tenants
 * GET    /api/ha-tenants/{id}
 * POST   /api/ha-tenants
 * PUT    /api/ha-tenants/{id}
 * DELETE /api/ha-tenants/{id}
 */
@RestController
@RequestMapping("/api")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class HaTenantsResource {

    private static final Logger log = LoggerFactory.getLogger(HaTenantsResource.class);

    private final HiveTenantService service;

    public HaTenantsResource(HiveTenantService service) {
        this.service = service;
    }

    @GetMapping("/ha-tenants")
    public ResponseEntity<List<HiveTenantDTO>> getAll(Pageable pageable) {
        log.debug("REST request to get all tenants");
        Page<HiveTenantDTO> page = service.findAll(pageable);
        HttpHeaders headers = UtilPagination.generatePaginationHttpHeaders(
            page.getTotalElements(), pageable.getPageNumber(), pageable.getPageSize(),
            "/api/ha-tenants");
        return ResponseEntity.ok().headers(headers).body(page.getContent());
    }

    @GetMapping("/ha-tenants/{id}")
    public ResponseEntity<HiveTenantDTO> getOne(@PathVariable Long id) {
        log.debug("REST request to get tenant: {}", id);
        return service.findById(id)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/ha-tenants")
    public ResponseEntity<HiveTenantDTO> create(@Valid @RequestBody HiveTenantDTO dto) {
        log.debug("REST request to create tenant: {}", dto.getName());
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(dto));
    }

    @PutMapping("/ha-tenants/{id}")
    public ResponseEntity<HiveTenantDTO> update(@PathVariable Long id,
                                                @Valid @RequestBody HiveTenantDTO dto) {
        log.debug("REST request to update tenant: {}", id);
        return service.update(id, dto)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/ha-tenants/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        log.debug("REST request to delete tenant: {}", id);
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
