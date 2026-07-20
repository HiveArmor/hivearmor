package com.hivearmor.service.compliance.config;

import com.hivearmor.domain.compliance.UtmComplianceControlMapping;
import com.hivearmor.repository.compliance.UtmComplianceControlMappingRepository;
import com.hivearmor.service.dto.compliance.UtmComplianceControlMappingDto;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
@Transactional
public class UtmComplianceControlMappingService {

    private final UtmComplianceControlMappingRepository repository;

    public UtmComplianceControlMappingService(UtmComplianceControlMappingRepository repository) {
        this.repository = repository;
    }

    public Page<UtmComplianceControlMappingDto> findByFilters(Long standardId, String mappingType, Pageable pageable) {
        if (standardId != null) {
            return repository.findByStandardIdAndMappingType(standardId, mappingType, pageable).map(this::toDto);
        }
        return repository.findByFilters(mappingType, pageable).map(this::toDto);
    }

    public Optional<UtmComplianceControlMappingDto> findById(Long id) {
        return repository.findById(id).map(this::toDto);
    }

    public UtmComplianceControlMappingDto create(UtmComplianceControlMappingDto dto) {
        UtmComplianceControlMapping entity = toEntity(dto);
        return toDto(repository.save(entity));
    }

    public UtmComplianceControlMappingDto update(Long id, UtmComplianceControlMappingDto dto) {
        UtmComplianceControlMapping entity = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Mapping not found: " + id));
        entity.setMappingType(dto.getMappingType());
        entity.setDataTypes(dto.getDataTypes());
        entity.setCelCondition(dto.getCelCondition());
        entity.setDescription(dto.getDescription());
        entity.setWeight(dto.getWeight());
        entity.setEvidenceRetentionDays(dto.getEvidenceRetentionDays());
        return toDto(repository.save(entity));
    }

    public void delete(Long id) {
        repository.deleteById(id);
    }

    private UtmComplianceControlMappingDto toDto(UtmComplianceControlMapping e) {
        UtmComplianceControlMappingDto dto = new UtmComplianceControlMappingDto();
        dto.setId(e.getId());
        dto.setControlId(e.getControlId());
        dto.setMappingType(e.getMappingType());
        dto.setDataTypes(e.getDataTypes());
        dto.setCelCondition(e.getCelCondition());
        dto.setDescription(e.getDescription());
        dto.setWeight(e.getWeight());
        dto.setEvidenceRetentionDays(e.getEvidenceRetentionDays());
        if (e.getControl() != null) {
            dto.setControlName(e.getControl().getControlName());
            if (e.getControl().getSection() != null) {
                dto.setSectionName(e.getControl().getSection().getStandardSectionName());
                if (e.getControl().getSection().getStandard() != null) {
                    dto.setStandardName(e.getControl().getSection().getStandard().getStandardName());
                }
            }
        }
        return dto;
    }

    private UtmComplianceControlMapping toEntity(UtmComplianceControlMappingDto dto) {
        UtmComplianceControlMapping e = new UtmComplianceControlMapping();
        e.setControlId(dto.getControlId());
        e.setMappingType(dto.getMappingType());
        e.setDataTypes(dto.getDataTypes());
        e.setCelCondition(dto.getCelCondition());
        e.setDescription(dto.getDescription());
        e.setWeight(dto.getWeight());
        e.setEvidenceRetentionDays(dto.getEvidenceRetentionDays());
        return e;
    }
}
