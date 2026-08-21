package com.hivearmor.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.HaAgentPolicy;
import com.hivearmor.repository.HaAgentPolicyRepository;
import com.hivearmor.service.dto.AgentPolicyAssignRequest;
import com.hivearmor.service.dto.AgentPolicyDTO;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Service for managing HiveArmor EDR agent monitoring policies (T05).
 * Backs GET/POST/PUT/DELETE /api/ha-edr/policies and POST /api/ha-edr/policies/{id}/assign.
 *
 * No Lombok. Constructor injection only — no @Autowired on fields or setters.
 */
@Service
public class HaAgentPolicyService {

    private final HaAgentPolicyRepository policyRepository;
    private final ObjectMapper objectMapper;

    public HaAgentPolicyService(HaAgentPolicyRepository policyRepository,
                                ObjectMapper objectMapper) {
        this.policyRepository = policyRepository;
        this.objectMapper = objectMapper;
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Returns all policies mapped to DTOs.
     */
    public List<AgentPolicyDTO> listPolicies() {
        List<HaAgentPolicy> entities = policyRepository.findAll();
        List<AgentPolicyDTO> dtos = new ArrayList<>();
        for (HaAgentPolicy entity : entities) {
            dtos.add(toDTO(entity));
        }
        return dtos;
    }

    /**
     * Creates a new policy from the provided DTO.
     * Sets createdAt and updatedAt to Instant.now().
     */
    public AgentPolicyDTO createPolicy(AgentPolicyDTO dto) {
        HaAgentPolicy entity = new HaAgentPolicy();
        entity.setName(dto.getName());
        entity.setOsType(dto.getOsType());
        entity.setNetworkMonitor(dto.getNetworkMonitor());
        entity.setProcessMonitor(dto.getProcessMonitor());
        entity.setFilePaths(serializeList(dto.getFilePaths()));
        entity.setRegistryPaths(serializeList(dto.getRegistryPaths()));
        entity.setAssignedAgentIds(serializeList(dto.getAssignedAgentIds()));
        Instant now = Instant.now();
        entity.setCreatedAt(now);
        entity.setUpdatedAt(now);
        HaAgentPolicy saved = policyRepository.save(entity);
        return toDTO(saved);
    }

    /**
     * Updates an existing policy by id.
     * Throws EntityNotFoundException if the policy does not exist.
     */
    public AgentPolicyDTO updatePolicy(Long id, AgentPolicyDTO dto) {
        HaAgentPolicy entity = policyRepository.findById(id)
            .orElseThrow(() -> new EntityNotFoundException("HaAgentPolicy not found with id: " + id));
        entity.setName(dto.getName());
        entity.setOsType(dto.getOsType());
        entity.setNetworkMonitor(dto.getNetworkMonitor());
        entity.setProcessMonitor(dto.getProcessMonitor());
        entity.setFilePaths(serializeList(dto.getFilePaths()));
        entity.setRegistryPaths(serializeList(dto.getRegistryPaths()));
        entity.setAssignedAgentIds(serializeList(dto.getAssignedAgentIds()));
        entity.setUpdatedAt(Instant.now());
        HaAgentPolicy saved = policyRepository.save(entity);
        return toDTO(saved);
    }

    /**
     * Deletes a policy by id.
     * Throws EntityNotFoundException if the policy does not exist.
     */
    public void deletePolicy(Long id) {
        policyRepository.findById(id)
            .orElseThrow(() -> new EntityNotFoundException("HaAgentPolicy not found with id: " + id));
        policyRepository.deleteById(id);
    }

    /**
     * Assigns agents to a policy by replacing its assignedAgentIds list.
     * Throws EntityNotFoundException if the policy does not exist.
     */
    public AgentPolicyDTO assignAgents(Long id, AgentPolicyAssignRequest request) {
        HaAgentPolicy entity = policyRepository.findById(id)
            .orElseThrow(() -> new EntityNotFoundException("HaAgentPolicy not found with id: " + id));
        entity.setAssignedAgentIds(serializeList(request.getAgentIds()));
        entity.setUpdatedAt(Instant.now());
        HaAgentPolicy saved = policyRepository.save(entity);
        return toDTO(saved);
    }

    // -------------------------------------------------------------------------
    // Mapping helpers
    // -------------------------------------------------------------------------

    private AgentPolicyDTO toDTO(HaAgentPolicy entity) {
        AgentPolicyDTO dto = new AgentPolicyDTO();
        dto.setId(entity.getId());
        dto.setName(entity.getName());
        dto.setOsType(entity.getOsType());
        dto.setNetworkMonitor(entity.getNetworkMonitor());
        dto.setProcessMonitor(entity.getProcessMonitor());
        dto.setFilePaths(deserializeList(entity.getFilePaths()));
        dto.setRegistryPaths(deserializeList(entity.getRegistryPaths()));
        dto.setAssignedAgentIds(deserializeList(entity.getAssignedAgentIds()));
        dto.setCreatedAt(entity.getCreatedAt() != null ? entity.getCreatedAt().toString() : null);
        dto.setUpdatedAt(entity.getUpdatedAt() != null ? entity.getUpdatedAt().toString() : null);
        return dto;
    }

    // -------------------------------------------------------------------------
    // JSON serialization helpers
    // -------------------------------------------------------------------------

    private String serializeList(List<String> list) {
        if (list == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(list);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize list to JSON", e);
        }
    }

    private List<String> deserializeList(String json) {
        if (json == null || json.isBlank()) {
            return new ArrayList<>();
        }
        try {
            return objectMapper.readValue(
                json,
                objectMapper.getTypeFactory().constructCollectionType(List.class, String.class)
            );
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to deserialize JSON list", e);
        }
    }
}
