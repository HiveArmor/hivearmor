package com.hivearmor.service;

import com.hivearmor.domain.HiveRetentionPolicy;
import com.hivearmor.repository.HiveRetentionPolicyRepository;
import com.hivearmor.service.dto.HiveRetentionPolicyDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Service for managing data retention policies.
 * Backs /api/ha-retention-policies/{dataType}.
 */
@Service
@Transactional
public class HiveRetentionPolicyService {

    public static final String ENROLLMENT_AUDIT = "ENROLLMENT_AUDIT";

    private static final Logger log = LoggerFactory.getLogger(HiveRetentionPolicyService.class);

    private final HiveRetentionPolicyRepository repository;

    public HiveRetentionPolicyService(HiveRetentionPolicyRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<HiveRetentionPolicyDTO> findAll() {
        return repository.findAll().stream().map(this::toDTO).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public Optional<HiveRetentionPolicyDTO> findByDataType(String dataType) {
        return repository.findByDataType(dataType.toUpperCase()).map(this::toDTO);
    }

    /**
     * Upsert: create a new row if none exists for dataType, otherwise update.
     */
    public HiveRetentionPolicyDTO upsert(String dataType, HiveRetentionPolicyDTO dto) {
        String normalized = dataType.toUpperCase();
        if (ENROLLMENT_AUDIT.equals(normalized)
            && dto.getArchiveTarget() != null
            && !"NONE".equalsIgnoreCase(dto.getArchiveTarget())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Enrollment audit rows are append-only; archive or prune targets are not supported");
        }
        HiveRetentionPolicy entity = repository.findByDataType(normalized)
            .orElseGet(HiveRetentionPolicy::new);
        entity.setDataType(normalized);
        entity.setName(dto.getName() != null ? dto.getName() : dataType + " Retention");
        entity.setRetentionDays(dto.getRetentionDays());
        if (ENROLLMENT_AUDIT.equals(normalized)) {
            entity.setCompressionEnabled(false);
            entity.setArchiveTarget("NONE");
            entity.setArchivePath(null);
        } else {
            entity.setCompressionEnabled(dto.getCompressionEnabled() != null ? dto.getCompressionEnabled() : false);
            entity.setArchiveTarget(dto.getArchiveTarget() != null ? dto.getArchiveTarget() : "NONE");
            entity.setArchivePath("NONE".equals(entity.getArchiveTarget()) ? null : dto.getArchivePath());
        }
        return toDTO(repository.save(entity));
    }

    // ---- mapping helpers ----

    private HiveRetentionPolicyDTO toDTO(HiveRetentionPolicy entity) {
        HiveRetentionPolicyDTO dto = new HiveRetentionPolicyDTO();
        dto.setId(entity.getId());
        dto.setName(entity.getName());
        dto.setDataType(entity.getDataType());
        dto.setRetentionDays(entity.getRetentionDays());
        dto.setCompressionEnabled(entity.getCompressionEnabled());
        dto.setArchiveTarget(entity.getArchiveTarget());
        dto.setArchivePath(entity.getArchivePath());
        dto.setCreatedAt(entity.getCreatedAt());
        dto.setUpdatedAt(entity.getUpdatedAt());
        dto.setSourceImmutable(ENROLLMENT_AUDIT.equals(entity.getDataType()));
        return dto;
    }
}
