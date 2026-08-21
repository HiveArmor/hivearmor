package com.hivearmor.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.HiveNotificationRule;
import com.hivearmor.repository.HiveNotificationRuleRepository;
import com.hivearmor.service.dto.HiveNotificationRuleDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Service for managing notification rules.
 * Backs /api/ha-notification-rules (ADM-03).
 */
@Service
@Transactional
public class HiveNotificationRuleService {

    private static final Logger log = LoggerFactory.getLogger(HiveNotificationRuleService.class);
    private static final TypeReference<Map<String, String>> CONFIG_TYPE = new TypeReference<>() {};

    private final HiveNotificationRuleRepository repository;
    private final ObjectMapper objectMapper;

    public HiveNotificationRuleService(HiveNotificationRuleRepository repository,
                                       ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public List<HiveNotificationRuleDTO> findAll() {
        return repository.findAll().stream().map(this::toDTO).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public Optional<HiveNotificationRuleDTO> findById(Long id) {
        return repository.findById(id).map(this::toDTO);
    }

    public HiveNotificationRuleDTO create(HiveNotificationRuleDTO dto) {
        HiveNotificationRule entity = toEntity(dto);
        entity.setId(null); // ensure insert
        return toDTO(repository.save(entity));
    }

    public Optional<HiveNotificationRuleDTO> update(Long id, HiveNotificationRuleDTO dto) {
        return repository.findById(id).map(existing -> {
            existing.setName(dto.getName());
            existing.setSeverityThreshold(dto.getSeverityThreshold());
            existing.setDestinationType(dto.getDestinationType());
            existing.setDestinationConfig(configToJson(dto.getDestinationConfig()));
            existing.setEnabled(dto.getEnabled());
            existing.setTenantId(dto.getTenantId());
            return toDTO(repository.save(existing));
        });
    }

    public void delete(Long id) {
        repository.deleteById(id);
    }

    // ---- mapping helpers ----

    private HiveNotificationRuleDTO toDTO(HiveNotificationRule entity) {
        HiveNotificationRuleDTO dto = new HiveNotificationRuleDTO();
        dto.setId(String.valueOf(entity.getId()));
        dto.setName(entity.getName());
        dto.setSeverityThreshold(entity.getSeverityThreshold());
        dto.setDestinationType(entity.getDestinationType());
        dto.setDestinationConfig(jsonToConfig(entity.getDestinationConfig()));
        dto.setEnabled(entity.getEnabled());
        dto.setTenantId(entity.getTenantId());
        dto.setCreatedAt(entity.getCreatedAt());
        dto.setUpdatedAt(entity.getUpdatedAt());
        return dto;
    }

    private HiveNotificationRule toEntity(HiveNotificationRuleDTO dto) {
        HiveNotificationRule entity = new HiveNotificationRule();
        entity.setName(dto.getName());
        entity.setSeverityThreshold(dto.getSeverityThreshold() != null ? dto.getSeverityThreshold() : 3);
        entity.setDestinationType(dto.getDestinationType());
        entity.setDestinationConfig(configToJson(dto.getDestinationConfig()));
        entity.setEnabled(dto.getEnabled() != null ? dto.getEnabled() : true);
        entity.setTenantId(dto.getTenantId());
        return entity;
    }

    private Map<String, String> jsonToConfig(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            return objectMapper.readValue(json, CONFIG_TYPE);
        } catch (Exception e) {
            log.warn("Failed to deserialise notification destinationConfig: {}", e.getMessage());
            return Map.of();
        }
    }

    private String configToJson(Map<String, String> config) {
        if (config == null) return "{}";
        try {
            return objectMapper.writeValueAsString(config);
        } catch (Exception e) {
            log.warn("Failed to serialise notification destinationConfig: {}", e.getMessage());
            return "{}";
        }
    }
}
