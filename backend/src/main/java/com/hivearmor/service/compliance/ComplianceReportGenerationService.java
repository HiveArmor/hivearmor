package com.hivearmor.service.compliance;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.repository.compliance.ComplianceResultRepository;
import com.hivearmor.service.dto.compliance.ComplianceReportDto;
import org.springframework.stereotype.Service;

/**
 * Service responsible for building a {@link ComplianceReportDto} for a specific
 * MSSP-managed tenant.
 *
 * <p>The report is populated with tenant identity fields ({@code tenantPrefix} and
 * {@code tenantName}) sourced from the {@code ha_client} row identified by the
 * caller-supplied {@code tenantId}.  Both fields are {@code null}-safe: when the
 * {@code ha_client} row has no {@code client_prefix} set, {@code tenantPrefix} is
 * {@code null} and report generation still completes successfully (Requirement 7.5).
 *
 * <p>The caller (see
 * {@link com.hivearmor.web.rest.compliance.ComplianceReportGenerationController})
 * is responsible for establishing {@code TenantContext} before calling
 * {@link #generate(Long)} and for clearing it in a {@code finally} block
 * afterwards (Requirements 6.1–6.5).
 *
 * <p>Sprint 24 — S24-T02 task 2.3: populate {@code tenantPrefix} and
 * {@code tenantName} on {@link ComplianceReportDto}.
 *
 * @see com.hivearmor.web.rest.compliance.ComplianceReportGenerationController
 */
@Service
public class ComplianceReportGenerationService {

    private final ComplianceResultRepository complianceResultRepository;
    private final MsspIndexResolver          msspIndexResolver;
    private final HaClientRepository         haClientRepository;

    public ComplianceReportGenerationService(
            ComplianceResultRepository complianceResultRepository,
            MsspIndexResolver msspIndexResolver,
            HaClientRepository haClientRepository) {
        this.complianceResultRepository = complianceResultRepository;
        this.msspIndexResolver          = msspIndexResolver;
        this.haClientRepository         = haClientRepository;
    }

    /**
     * Generates a compliance report for the tenant identified by {@code tenantId}.
     *
     * <p>Looks up the {@code ha_client} row for {@code tenantId} and populates
     * {@code tenantPrefix} from {@code ha_client.client_prefix} and {@code tenantName}
     * from {@code ha_client.name}.  Either field may be {@code null} when the
     * corresponding column is {@code NULL} in the database; this is not an error
     * condition (Requirement 7.5).
     *
     * <p>Callers MUST ensure {@code TenantContext.set(clientId, clientPrefix)} has been
     * called before this method is invoked, and MUST call {@code TenantContext.clear()}
     * inside a {@code finally} block after this method returns.
     *
     * @param tenantId the {@code ha_client.id} of the target tenant; never {@code null}
     * @return a {@link ComplianceReportDto} with {@code tenantId}, {@code tenantPrefix},
     *         and {@code tenantName} populated; other fields default to {@code null}
     */
    public ComplianceReportDto generate(Long tenantId) {
        ComplianceReportDto report = new ComplianceReportDto();
        report.setTenantId(tenantId);

        // Populate tenantPrefix and tenantName from the ha_client row.
        // ifPresent is used so that a missing row leaves both fields null
        // rather than throwing — the controller's 404 guard ensures we only
        // reach here for known tenants, but defensive null-safety is preserved.
        haClientRepository.findById(tenantId).ifPresent(tenant -> {
            report.setTenantPrefix(tenant.getClientPrefix()); // may be null — Requirement 7.5
            report.setTenantName(tenant.getName());           // may be null
        });

        return report;
    }
}
