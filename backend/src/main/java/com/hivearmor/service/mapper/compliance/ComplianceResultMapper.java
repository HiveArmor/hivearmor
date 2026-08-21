package com.hivearmor.service.mapper.compliance;

import com.hivearmor.domain.HaClient;
import com.hivearmor.domain.compliance.ComplianceResult;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.service.dto.compliance.ComplianceResultDto;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Maps {@link ComplianceResult} entities to {@link ComplianceResultDto} objects.
 *
 * <p>The {@code tenantPrefix} field is resolved via a single {@link HaClientRepository}
 * lookup. When the entity's {@code clientId} is {@code null} (non-tenant-scoped row),
 * {@code tenantPrefix} is set to {@code null} on the DTO.
 *
 * <p>For callers that convert many entities at once (e.g.
 * {@code MsspAggregateReportService}), use {@link #toDtoList(Collection)} which issues
 * a single batch {@code findAllById} call to resolve all {@code client_id} values in
 * one round-trip.
 *
 * <p>Sprint 24 — S24-T01: per-tenant compliance layer.
 *
 * <p>Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
@Component
public class ComplianceResultMapper {

    private final HaClientRepository haClientRepository;

    public ComplianceResultMapper(HaClientRepository haClientRepository) {
        this.haClientRepository = haClientRepository;
    }

    /**
     * Maps a single {@link ComplianceResult} entity to a {@link ComplianceResultDto}.
     *
     * <p>When {@code entity.getClientId()} is non-null, this method performs one
     * {@link HaClientRepository#findById} call to resolve the {@code client_prefix}.
     * For bulk conversions, prefer {@link #toDtoList(Collection)} to avoid N+1 queries.
     *
     * @param entity the entity to convert; must not be {@code null}
     * @return the corresponding DTO with {@code tenantPrefix} populated or {@code null}
     */
    public ComplianceResultDto toDto(ComplianceResult entity) {
        ComplianceResultDto dto = new ComplianceResultDto();
        dto.setId(entity.getId());
        dto.setControlId(entity.getControlId());
        dto.setControlName(entity.getControlName());
        dto.setFramework(entity.getFramework());
        dto.setStatus(entity.getStatus());
        dto.setEvaluatedAt(entity.getEvaluatedAt());

        // Requirement 4.2 / 4.3: populate tenantPrefix from ha_client when clientId is set,
        // set null otherwise.
        if (entity.getClientId() != null) {
            dto.setTenantPrefix(
                haClientRepository.findById(entity.getClientId())
                    .map(HaClient::getClientPrefix)
                    .orElse(null));
        } else {
            dto.setTenantPrefix(null);
        }

        return dto;
    }

    /**
     * Maps a collection of {@link ComplianceResult} entities to a list of
     * {@link ComplianceResultDto} objects.
     *
     * <p>Resolves all distinct {@code client_id} values in a single
     * {@link HaClientRepository#findAllById} call to avoid N+1 queries when the
     * collection is large.
     *
     * @param entities the entities to convert; may be empty but must not be {@code null}
     * @return an unmodifiable list of DTOs in the same iteration order as the input
     */
    public List<ComplianceResultDto> toDtoList(Collection<ComplianceResult> entities) {
        if (entities.isEmpty()) {
            return Collections.emptyList();
        }

        // Batch-resolve all distinct client IDs in one query.
        List<Long> clientIds = entities.stream()
            .map(ComplianceResult::getClientId)
            .filter(id -> id != null)
            .distinct()
            .collect(Collectors.toList());

        Map<Long, String> clientPrefixById;
        if (clientIds.isEmpty()) {
            clientPrefixById = Collections.emptyMap();
        } else {
            clientPrefixById = haClientRepository.findAllById(clientIds)
                .stream()
                .filter(c -> c.getClientPrefix() != null)
                .collect(Collectors.toMap(HaClient::getId, HaClient::getClientPrefix));
        }

        return entities.stream()
            .map(entity -> {
                ComplianceResultDto dto = new ComplianceResultDto();
                dto.setId(entity.getId());
                dto.setControlId(entity.getControlId());
                dto.setControlName(entity.getControlName());
                dto.setFramework(entity.getFramework());
                dto.setStatus(entity.getStatus());
                dto.setEvaluatedAt(entity.getEvaluatedAt());

                if (entity.getClientId() != null) {
                    dto.setTenantPrefix(clientPrefixById.get(entity.getClientId()));
                } else {
                    dto.setTenantPrefix(null);
                }

                return dto;
            })
            .collect(Collectors.toUnmodifiableList());
    }
}
