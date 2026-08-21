package com.hivearmor.service.compliance;

import com.hivearmor.domain.compliance.ComplianceResult;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.compliance.ComplianceResultRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Service that wraps {@link ComplianceResultRepository} with correct per-tenant dispatch.
 *
 * <p>Every method in this class inspects {@link TenantContext} at call-time and routes
 * to the appropriate repository variant:
 *
 * <ul>
 *   <li>When {@code TenantContext.isMssp()} is {@code true} and
 *       {@code TenantContext.getClientId()} is non-null: the scoped
 *       {@code *AndClientId} variant is called, appending a
 *       {@code WHERE client_id = :clientId} predicate.</li>
 *   <li>When {@code TenantContext.isMssp()} is {@code true} but
 *       {@code TenantContext.getClientId()} returns {@code null}: an empty list is
 *       returned immediately. No unfiltered SQL statement is executed. This is the
 *       defensive path required by Requirement 2.3.</li>
 *   <li>When {@code TenantContext.isMssp()} is {@code false}: the unscoped variant
 *       is called unchanged, preserving all existing non-tenant predicates.</li>
 * </ul>
 *
 * <p>The {@code clientId} value is never concatenated into a SQL string; it is always
 * bound via a named JPA {@code @Param}, satisfying Requirement 2.4.
 *
 * <p>Sprint 24 — S24-T01: per-tenant compliance layer.
 *
 * @see ComplianceResultRepository
 * @see TenantContext
 */
@Service
@Transactional(readOnly = true)
public class ComplianceResultQueryService {

    private final ComplianceResultRepository complianceResultRepository;

    public ComplianceResultQueryService(ComplianceResultRepository complianceResultRepository) {
        this.complianceResultRepository = complianceResultRepository;
    }

    // -------------------------------------------------------------------------
    // Tenant-dispatched query methods
    // -------------------------------------------------------------------------

    /**
     * Returns compliance results for the given framework, scoped to the current tenant
     * when MSSP context is active.
     *
     * <p>Dispatch logic:
     * <ol>
     *   <li>If {@code TenantContext.isMssp()} is {@code true} and
     *       {@code getClientId()} is non-null → {@code findByFrameworkAndClientId}</li>
     *   <li>If {@code TenantContext.isMssp()} is {@code true} but
     *       {@code getClientId()} is {@code null} → returns {@code List.of()}</li>
     *   <li>Otherwise → {@code findByFramework}</li>
     * </ol>
     *
     * @param framework the compliance framework name (e.g. {@code "SOC 2"})
     * @return list of matching {@link ComplianceResult} entities, never {@code null}
     */
    public List<ComplianceResult> listByFramework(String framework) {
        if (TenantContext.isMssp()) {
            Long clientId = TenantContext.getClientId();
            if (clientId == null) {
                // Defensive: MSSP scope active but no client id — return empty result,
                // never execute an unfiltered query. Satisfies Requirement 2.3.
                return List.of();
            }
            return complianceResultRepository.findByFrameworkAndClientId(framework, clientId);
        }
        return complianceResultRepository.findByFramework(framework);
    }

    /**
     * Returns all compliance results, ordered by {@code evaluatedAt} descending.
     *
     * <p>Dispatch logic: same three-way MSSP check as {@link #listByFramework}.
     * When MSSP-scoped, delegates to
     * {@link ComplianceResultRepository#findByClientIdOrderByEvaluatedAtAsc} which
     * scopes results to the owning tenant.
     * When not MSSP-scoped, delegates to
     * {@link ComplianceResultRepository#findAllOrderByEvaluatedAtDesc}.
     *
     * @return list of {@link ComplianceResult} entities, never {@code null}
     */
    public List<ComplianceResult> listAllOrderedByEvaluatedAt() {
        if (TenantContext.isMssp()) {
            Long clientId = TenantContext.getClientId();
            if (clientId == null) {
                // Defensive: MSSP scope active but no client id — empty result, no SQL.
                return List.of();
            }
            // findByClientIdOrderByEvaluatedAtAsc already scopes by clientId (asc).
            return complianceResultRepository.findByClientIdOrderByEvaluatedAtAsc(clientId);
        }
        return complianceResultRepository.findAllOrderByEvaluatedAtDesc();
    }
}
