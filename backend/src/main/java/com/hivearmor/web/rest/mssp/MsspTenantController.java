package com.hivearmor.web.rest.mssp;

import com.hivearmor.multitenancy.MsspTenantResolver;
import com.hivearmor.service.mssp.MsspProvisioningService;
import com.hivearmor.service.mssp.MsspTenantService;
import com.hivearmor.service.mssp.NotFoundException;
import com.hivearmor.service.mssp.dto.NewTenantRequest;
import com.hivearmor.service.mssp.dto.NewTenantResponse;
import com.hivearmor.service.mssp.dto.TenantDetailDTO;
import com.hivearmor.service.mssp.dto.TenantHealthDTO;
import com.hivearmor.service.mssp.dto.UpdateTenantRequest;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;

/**
 * REST controller for MSSP tenant management endpoints.
 *
 * <p>Every method is gated by {@code @PreAuthorize("hasAuthority('MSSP_ADMIN')")}
 * at the class level. Missing or under-privileged JWTs receive {@code 401} and
 * {@code 403} respectively from JHipster's {@code JwtFilter} / Spring Security.
 *
 * <p>Sprint 23 — S23-T03 (create + list), S23-T04 (getById + update).
 */
@RestController
@RequestMapping("/api/ha-mssp")
@PreAuthorize("hasAuthority('MSSP_ADMIN')")
public class MsspTenantController {

    private static final Logger log = LoggerFactory.getLogger(MsspTenantController.class);

    private final MsspProvisioningService provisioningService;
    private final MsspTenantService       tenantService;
    private final MsspTenantResolver      tenantResolver;

    public MsspTenantController(MsspProvisioningService provisioningService,
                                 MsspTenantService tenantService,
                                 MsspTenantResolver tenantResolver) {
        this.provisioningService = provisioningService;
        this.tenantService       = tenantService;
        this.tenantResolver      = tenantResolver;
    }

    // -------------------------------------------------------------------------
    // S23-T03 endpoints
    // -------------------------------------------------------------------------

    @PostMapping("/tenants")
    public ResponseEntity<NewTenantResponse> createTenant(@Valid @RequestBody NewTenantRequest req) {
        NewTenantResponse res = provisioningService.provisionTenant(req);
        URI location = URI.create("/api/ha-mssp/tenants/" + res.id());
        return ResponseEntity.created(location).body(res);
    }

    @GetMapping("/tenants")
    public ResponseEntity<List<TenantHealthDTO>> listTenants(
            @RequestParam(required = false) String q, Pageable pageable) {
        Page<TenantHealthDTO> page = tenantService.list(q, pageable);
        return ResponseEntity.ok()
            .header("X-Total-Count", Long.toString(page.getTotalElements()))
            .body(page.getContent());
    }

    // -------------------------------------------------------------------------
    // S23-T04 endpoints
    // -------------------------------------------------------------------------

    /**
     * Returns the detailed view of a single MSSP-managed tenant.
     *
     * @param id the {@code ha_client.id} path variable
     * @return {@link TenantDetailDTO} with HTTP {@code 200}; {@code 404} if not found
     *         or not MSSP-managed
     */
    @GetMapping("/tenants/{id}")
    public TenantDetailDTO getTenant(@PathVariable Long id) {
        return tenantService.getById(id)
            .orElseThrow(() -> new NotFoundException("tenant", id));
    }

    /**
     * Updates the four mutable fields of an MSSP-managed tenant.
     *
     * <p>After a successful update the {@link MsspTenantResolver} cache entry for
     * this tenant is evicted. A failure during eviction is logged at {@code WARN}
     * but does not roll back the already-committed update.
     *
     * @param id  the {@code ha_client.id} path variable
     * @param req validated request body (no {@code clientPrefix} field)
     * @return refreshed {@link TenantDetailDTO} with HTTP {@code 200}
     */
    @PutMapping("/tenants/{id}")
    public TenantDetailDTO updateTenant(
            @PathVariable Long id,
            @Valid @RequestBody UpdateTenantRequest req) {
        TenantDetailDTO updated = tenantService.update(id, req);
        try {
            tenantResolver.evict(id);
        } catch (RuntimeException ex) {
            log.warn("tenantResolver.evict failed for id={}", id, ex);
            // do not roll back the successful update
        }
        return updated;
    }
}
