package com.hivearmor.service;

import com.hivearmor.domain.HiveParserRule;
import com.hivearmor.repository.HiveParserRuleRepository;
import com.hivearmor.service.dto.HiveParserRuleDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Service for managing YAML-based parser rules.
 * Backs /api/ha-parsers.
 */
@Service
@Transactional
public class HiveParserRuleService {

    private static final Logger log = LoggerFactory.getLogger(HiveParserRuleService.class);

    private final HiveParserRuleRepository repository;

    public HiveParserRuleService(HiveParserRuleRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<HiveParserRuleDTO> findAll() {
        return repository.findAll().stream().map(this::toDTO).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public Optional<HiveParserRuleDTO> findById(Long id) {
        return repository.findById(id).map(this::toDTO);
    }

    public HiveParserRuleDTO create(HiveParserRuleDTO dto) {
        HiveParserRule entity = toEntity(dto);
        entity.setId(null);
        return toDTO(repository.save(entity));
    }

    public Optional<HiveParserRuleDTO> update(Long id, HiveParserRuleDTO dto) {
        return repository.findById(id).map(existing -> {
            existing.setName(dto.getName());
            existing.setDataType(dto.getDataType());
            existing.setStatus(dto.getStatus());
            existing.setYamlBody(dto.getYamlBody());
            if (dto.getLastMatchedCount() != null) {
                existing.setLastMatchedCount(dto.getLastMatchedCount());
            }
            return toDTO(repository.save(existing));
        });
    }

    public void delete(Long id) {
        repository.deleteById(id);
    }

    // ---- mapping helpers ----

    private HiveParserRuleDTO toDTO(HiveParserRule entity) {
        HiveParserRuleDTO dto = new HiveParserRuleDTO();
        dto.setId(String.valueOf(entity.getId()));
        dto.setName(entity.getName());
        dto.setDataType(entity.getDataType());
        dto.setStatus(entity.getStatus());
        dto.setLastMatchedCount(entity.getLastMatchedCount());
        dto.setYamlBody(entity.getYamlBody());
        dto.setCreatedAt(entity.getCreatedAt());
        dto.setUpdatedAt(entity.getUpdatedAt());
        return dto;
    }

    private HiveParserRule toEntity(HiveParserRuleDTO dto) {
        HiveParserRule entity = new HiveParserRule();
        entity.setName(dto.getName());
        entity.setDataType(dto.getDataType());
        entity.setStatus(dto.getStatus() != null ? dto.getStatus() : "inactive");
        entity.setYamlBody(dto.getYamlBody() != null ? dto.getYamlBody() : "");
        entity.setLastMatchedCount(dto.getLastMatchedCount() != null ? dto.getLastMatchedCount() : 0L);
        return entity;
    }
}
