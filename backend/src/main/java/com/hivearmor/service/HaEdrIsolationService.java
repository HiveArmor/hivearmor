package com.hivearmor.service;

import com.hivearmor.domain.edr.UtmEdrIsolation;
import com.hivearmor.multitenancy.TenantAudit;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.multitenancy.TenantScope;
import com.hivearmor.repository.edr.UtmEdrIsolationRepository;
import com.hivearmor.service.dto.IsolatedHostDTO;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Read-only host isolation inventory backed by {@code hive_edr_isolation}.
 *
 * <p>Backs {@code GET /api/ha-edr/isolation}. Does not adopt legacy
 * {@code /api/edr/isolation}. Lift/release mutations remain out of scope for
 * this STAGING CANDIDATE slice (RESP-021 governed release still open).
 *
 * <p>No Lombok. Constructor injection only.
 */
@Service
@Transactional(readOnly = true)
public class HaEdrIsolationService {

    private final UtmEdrIsolationRepository isolationRepository;

    public HaEdrIsolationService(UtmEdrIsolationRepository isolationRepository) {
        this.isolationRepository = isolationRepository;
    }

    /**
     * Returns a paginated list of isolated hosts, optionally filtered by status.
     * Results are sorted by {@code isolatedAt} descending.
     *
     * @param status optional status filter ({@code ACTIVE}, {@code LIFTED}, {@code FAILED})
     * @param page   zero-based page index
     * @param size   page size (caller should clamp)
     */
    public Page<IsolatedHostDTO> listIsolatedHosts(String status, int page, int size) {
        PageRequest pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "isolatedAt"));

        // SPEC-04 (W1b): hive_edr_isolation has no tenant_id column yet, so this
        // list read cannot be tenant-filtered at the database. In an MSSP
        // deployment the previous findAll()/findByStatus() returned EVERY tenant's
        // isolated hosts — a cross-tenant read. Fail closed here rather than leak;
        // proper per-tenant scoping is delivered in PR-2 (adds tenant_id +
        // findByTenantId* finders, mirroring HaEdrQuarantine). requireTenant() also
        // fail-closes an MSSP request whose tenant is unresolved.
        TenantScope.requireTenant();
        if (TenantContext.isMssp()) {
            TenantAudit.crossTenantDenied(
                "HaEdrIsolationService.listIsolatedHosts", "edr-isolation", null,
                "no-tenant-column-yet");
            throw new AccessDeniedException(
                "isolated-host list is not tenant-scoped yet; per-tenant support is pending (SPEC-04 PR-2)");
        }

        boolean hasStatus = status != null && !status.isBlank();
        Page<UtmEdrIsolation> results = hasStatus
            ? isolationRepository.findByStatus(status.trim(), pageable)
            : isolationRepository.findAll(pageable);
        return results.map(this::toDTO);
    }

    private IsolatedHostDTO toDTO(UtmEdrIsolation entity) {
        IsolatedHostDTO dto = new IsolatedHostDTO();
        dto.setId(entity.getId());
        dto.setAgentId(entity.getAgentId());
        dto.setHostname(entity.getHostname());
        dto.setIsolationType(entity.getIsolationType());
        dto.setStatus(entity.getStatus());
        dto.setReason(entity.getReason());
        dto.setAllowedIps(entity.getAllowedIps());
        dto.setIsolatedAt(entity.getIsolatedAt());
        dto.setLiftedAt(entity.getLiftedAt());
        dto.setActionedBy(entity.getActionedBy());
        dto.setEdrEventId(entity.getEdrEventId());
        return dto;
    }
}
