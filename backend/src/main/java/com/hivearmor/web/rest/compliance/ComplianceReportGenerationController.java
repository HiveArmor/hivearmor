package com.hivearmor.web.rest.compliance;

import com.hivearmor.domain.HaClient;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.service.compliance.ComplianceReportGenerationService;
import com.hivearmor.service.dto.compliance.ComplianceReportDto;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * REST controller that exposes the per-tenant compliance report generation endpoint.
 *
 * <h3>Endpoint</h3>
 * <pre>
 *   POST /api/ha-compliance/reports/generate?tenantId={id}
 * </pre>
 *
 * <h3>Access control</h3>
 * The method is guarded by
 * {@code @PreAuthorize("hasAnyAuthority('MSSP_ADMIN','ADMIN')")} — only callers
 * whose JWT includes the {@code MSSP_ADMIN} or {@code ADMIN} authority may invoke
 * it.  Spring Security returns {@code 403} for under-privileged JWTs and
 * {@code 401} for requests without an {@code Authorization} header.
 *
 * <h3>404 guard</h3>
 * Before delegating to {@link ComplianceReportGenerationService}, the controller
 * looks up {@code ha_client} by {@code tenantId}.  When no row is found,
 * {@code 404 Not Found} is returned and the service is never invoked (Requirement
 * 5.6).
 *
 * <h3>TenantContext (task 2.2)</h3>
 * {@link TenantContext#set(Long, String)} is called before the {@code try} block.
 * {@link TenantContext#clear()} is called in the matching {@code finally} block,
 * ensuring the thread-local tenant scope is always released, even when the service
 * throws (Requirements 6.1–6.5, 19.4, 19.5).
 *
 * <p>Sprint 24 — S24-T02 task 2.2.
 *
 * @see ComplianceReportGenerationService
 * @see com.hivearmor.multitenancy.TenantContext
 */
@RestController
@RequestMapping("/api/ha-compliance")
public class ComplianceReportGenerationController {

    private final ComplianceReportGenerationService complianceReportGenerationService;
    private final HaClientRepository               haClientRepository;

    public ComplianceReportGenerationController(
            ComplianceReportGenerationService complianceReportGenerationService,
            HaClientRepository haClientRepository) {
        this.complianceReportGenerationService = complianceReportGenerationService;
        this.haClientRepository               = haClientRepository;
    }

    /**
     * Generates a compliance report for the MSSP-managed tenant identified by
     * {@code tenantId}.
     *
     * <p>Returns {@code 404 Not Found} immediately when the supplied
     * {@code tenantId} does not match any row in {@code ha_client}, without
     * invoking the report service (Requirement 5.6).
     *
     * <p>The tenant context is established via {@link TenantContext#set(Long, String)}
     * before the service is invoked and is always cleared in the {@code finally}
     * block, guaranteeing no context leak even when the service throws
     * (Requirements 6.1–6.5, 19.4, 19.5).
     *
     * @param tenantId the {@code ha_client.id} of the target tenant
     * @return {@code 200 OK} with the generated {@link ComplianceReportDto}
     * @throws ResponseStatusException {@code 404} when {@code tenantId} is not found
     */
    @PostMapping("/reports/generate")
    @PreAuthorize("hasAnyAuthority('MSSP_ADMIN','ADMIN')")
    public ResponseEntity<ComplianceReportDto> generate(@RequestParam("tenantId") Long tenantId) {
        // 404 guard — return Not Found without touching the service (Requirement 5.6)
        HaClient tenant = haClientRepository.findById(tenantId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Tenant not found: " + tenantId));

        // Establish tenant scope before entering try — Requirements 6.1, 6.2
        TenantContext.set(tenant.getId(), tenant.getClientPrefix());
        try {
            // Service invocation, DTO enrichment, and response build are all inside
            // the try block so the finally always runs — Requirements 6.3, 6.4, 6.5
            ComplianceReportDto report = complianceReportGenerationService.generate(tenant.getId());
            report.setTenantPrefix(tenant.getClientPrefix());
            report.setTenantName(tenant.getName());
            return ResponseEntity.ok(report);
        } finally {
            // Clear thread-local state unconditionally — Requirements 19.4, 19.5
            TenantContext.clear();
        }
    }
}
