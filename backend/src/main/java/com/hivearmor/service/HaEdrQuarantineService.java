package com.hivearmor.service;

import com.hivearmor.domain.HaEdrQuarantine;
import com.hivearmor.multitenancy.TenantScope;
import com.hivearmor.repository.HaEdrQuarantineRepository;
import com.hivearmor.service.dto.QuarantineActionRequest;
import com.hivearmor.service.dto.QuarantineBulkRequest;
import com.hivearmor.service.dto.QuarantinedFileDTO;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * Service for managing quarantined files in the ha_edr_quarantine table.
 *
 * Backs GET /api/ha-edr/quarantine, PATCH /api/ha-edr/quarantine/{id},
 * and POST /api/ha-edr/quarantine/bulk.
 *
 * No Lombok. Constructor injection only — no @Autowired on fields or setters.
 */
@Service
@Transactional
public class HaEdrQuarantineService {

    private final HaEdrQuarantineRepository quarantineRepository;

    public HaEdrQuarantineService(HaEdrQuarantineRepository quarantineRepository) {
        this.quarantineRepository = quarantineRepository;
    }

    /**
     * Returns a paginated, sorted list of quarantined files, optionally filtered
     * by agentId and/or status.
     *
     * Results are always sorted by quarantineTime descending.
     *
     * @param agentId  filter by agent ID (null or blank = no filter)
     * @param status   filter by status (null or blank = no filter)
     * @param page     zero-based page index
     * @param size     page size
     * @return page of {@link QuarantinedFileDTO}
     */
    @Transactional(readOnly = true)
    public Page<QuarantinedFileDTO> listQuarantinedFiles(String agentId, String status, int page, int size) {
        PageRequest pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "quarantineTime"));

        boolean hasAgentId = agentId != null && !agentId.isBlank();
        boolean hasStatus  = status  != null && !status.isBlank();

        Page<HaEdrQuarantine> results;

        // P0A1-T09 follow-on — every quarantine read is tenant-scoped; the previous
        // findAll() branch returned every tenant's records.
        long tenant = TenantScope.requireTenant();
        if (hasAgentId && hasStatus) {
            results = quarantineRepository.findByTenantIdAndAgentIdAndStatus(tenant, agentId, status, pageable);
        } else if (hasAgentId) {
            results = quarantineRepository.findByTenantIdAndAgentId(tenant, agentId, pageable);
        } else if (hasStatus) {
            results = quarantineRepository.findByTenantIdAndStatus(tenant, status, pageable);
        } else {
            results = quarantineRepository.findByTenantId(tenant, pageable);
        }

        return results.map(this::toDTO);
    }

    /**
     * Applies a restore or delete action to a single quarantined file.
     *
     * @param id      the record ID
     * @param request the action request (action must be "restore" or "delete")
     * @return the updated {@link QuarantinedFileDTO}
     * @throws EntityNotFoundException if no record exists for the given id
     */
    public QuarantinedFileDTO applyAction(Long id, QuarantineActionRequest request) {
        long tenant = TenantScope.requireTenant();
        HaEdrQuarantine entity = quarantineRepository.findById(id)
            .orElseThrow(() -> new EntityNotFoundException(
                "Quarantined file not found with id: " + id));

        // SPEC-04: a by-id load is not tenant-scoped by itself. Re-check the loaded
        // row against the caller's tenant and refuse a cross-tenant (or pre-backfill
        // null-tenant) mutate with the same not-found error — no cross-tenant
        // disclosure, mirroring AgentGrpcService.requireAgentInCurrentTenant.
        requireInTenant(entity, tenant, id);

        applyStatusChange(entity, request.getAction());

        HaEdrQuarantine saved = quarantineRepository.save(entity);
        return toDTO(saved);
    }

    /**
     * Applies a restore or delete action to a bulk list of quarantined files.
     *
     * @param request the bulk action request containing ids and action
     * @return list of updated {@link QuarantinedFileDTO}
     */
    public List<QuarantinedFileDTO> applyBulkAction(QuarantineBulkRequest request) {
        // SPEC-04: load only rows owned by the caller's tenant, so a bulk mutate
        // can never touch another tenant's (or a pre-backfill null-tenant) record.
        long tenant = TenantScope.requireTenant();
        List<HaEdrQuarantine> entities =
            quarantineRepository.findAllByTenantIdAndIdIn(tenant, request.getIds());

        for (HaEdrQuarantine entity : entities) {
            applyStatusChange(entity, request.getAction());
        }

        List<HaEdrQuarantine> saved = quarantineRepository.saveAll(entities);

        List<QuarantinedFileDTO> dtos = new ArrayList<>(saved.size());
        for (HaEdrQuarantine entity : saved) {
            dtos.add(toDTO(entity));
        }
        return dtos;
    }

    // ---- private helpers ----

    /**
     * SPEC-04 — fail-closed by-id tenant re-check. A row whose {@code tenantId}
     * does not match the caller's tenant (including a pre-backfill {@code null}
     * tenant) is treated as not found, so a cross-tenant id is neither disclosed
     * nor mutated. Mirrors {@code AgentGrpcService.requireAgentInCurrentTenant}.
     */
    private void requireInTenant(HaEdrQuarantine entity, long tenant, Long id) {
        Long rowTenant = entity.getTenantId();
        if (rowTenant == null || rowTenant.longValue() != tenant) {
            com.hivearmor.multitenancy.TenantAudit.crossTenantDenied(
                "HaEdrQuarantineService.applyAction", "quarantine", id, "row-outside-tenant");
            throw new EntityNotFoundException("Quarantined file not found with id: " + id);
        }
    }

    /**
     * Mutates the entity's status field based on the requested action.
     * Valid actions: "restore" → "restored", "delete" → "deleted".
     */
    private void applyStatusChange(HaEdrQuarantine entity, String action) {
        if ("restore".equals(action)) {
            entity.setStatus("restored");
        } else if ("delete".equals(action)) {
            entity.setStatus("deleted");
        }
    }

    /**
     * Maps a {@link HaEdrQuarantine} entity to a {@link QuarantinedFileDTO}.
     * Converts {@code Instant quarantineTime} to an ISO-8601 string via
     * {@code Instant.toString()}.
     */
    private QuarantinedFileDTO toDTO(HaEdrQuarantine entity) {
        QuarantinedFileDTO dto = new QuarantinedFileDTO();
        dto.setId(entity.getId());
        dto.setAgentId(entity.getAgentId());
        dto.setAgentName(entity.getAgentName());
        dto.setFilename(entity.getFilename());
        dto.setFilePath(entity.getFilePath());
        dto.setSha256Hash(entity.getSha256Hash());
        dto.setFileSize(entity.getFileSize());
        dto.setQuarantineTime(
            entity.getQuarantineTime() != null
                ? entity.getQuarantineTime().toString()
                : null
        );
        dto.setStatus(entity.getStatus());
        dto.setQuarantinedBy(entity.getQuarantinedBy());
        dto.setNotes(entity.getNotes());
        return dto;
    }
}
