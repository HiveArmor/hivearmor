package com.hivearmor.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.HaAgentPolicy;
import com.hivearmor.repository.HaAgentPolicyRepository;
import com.hivearmor.repository.agents_manager.UtmAgentPolicyStateRepository;
import com.hivearmor.service.dto.AgentPolicyAssignRequest;
import com.hivearmor.service.dto.AgentPolicyDTO;
import com.hivearmor.service.dto.AgentPolicyEnforcementEvidenceDTO;
import com.hivearmor.service.dto.agent_manager.AgentPolicyStateDTO;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Service for managing HiveArmor EDR agent monitoring policies (T05).
 * Backs GET/POST/PUT/DELETE /api/ha-edr/policies, assign, and enforcement evidence.
 *
 * No Lombok. Constructor injection only — no @Autowired on fields or setters.
 */
@Service
public class HaAgentPolicyService {

    private static final String AVAILABILITY_UNAVAILABLE = "unavailable";
    private static final String AVAILABILITY_PARTIAL = "partial";

    private final HaAgentPolicyRepository policyRepository;
    private final UtmAgentPolicyStateRepository policyStateRepository;
    private final ObjectMapper objectMapper;

    public HaAgentPolicyService(HaAgentPolicyRepository policyRepository,
                                UtmAgentPolicyStateRepository policyStateRepository,
                                ObjectMapper objectMapper) {
        this.policyRepository = policyRepository;
        this.policyStateRepository = policyStateRepository;
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

    /**
     * Returns assignment plus any agent-reported policy state rows for this policy id.
     *
     * <p>STAGING CANDIDATE: never claims complete host enforcement. Empty state rows
     * yield {@code unavailable}; any reported rows yield {@code partial}.
     */
    public AgentPolicyEnforcementEvidenceDTO getEnforcementEvidence(Long id) {
        HaAgentPolicy entity = policyRepository.findById(id)
            .orElseThrow(() -> new EntityNotFoundException("HaAgentPolicy not found with id: " + id));

        List<String> assigned = deserializeList(entity.getAssignedAgentIds());
        List<AgentPolicyStateDTO> states = policyStateRepository.findByPolicyId(id).stream()
            .map(AgentPolicyStateDTO::new)
            .collect(Collectors.toList());

        AgentPolicyEnforcementEvidenceDTO evidence = new AgentPolicyEnforcementEvidenceDTO();
        evidence.setPolicyId(id);
        evidence.setAssignedAgentIds(assigned);
        evidence.setAgentStates(states);
        applyHonesty(evidence, assigned, states);
        return evidence;
    }

    /**
     * Package-visible for focused unit tests — derives availability without inventing host proof.
     */
    static void applyHonesty(
            AgentPolicyEnforcementEvidenceDTO evidence,
            List<String> assigned,
            List<AgentPolicyStateDTO> states) {
        List<String> safeAssigned = assigned != null ? assigned : List.of();
        List<AgentPolicyStateDTO> safeStates = states != null ? states : List.of();

        if (safeStates.isEmpty()) {
            evidence.setEvidenceAvailability(AVAILABILITY_UNAVAILABLE);
            if (safeAssigned.isEmpty()) {
                evidence.setHonestyNote(
                    "No agents assigned and no agent-reported appliedVersion/state rows for this policy. "
                        + "Assignment is configuration only — host enforcement is not verified."
                );
            } else {
                evidence.setHonestyNote(
                    "Agents are assigned in configuration, but no agent-reported appliedVersion/state "
                        + "rows exist for this policy id. Host enforcement is not verified."
                );
            }
            return;
        }

        Set<String> reportedAgents = new HashSet<>();
        for (AgentPolicyStateDTO state : safeStates) {
            if (state.getAgentId() != null && !state.getAgentId().isBlank()) {
                reportedAgents.add(state.getAgentId());
            }
        }

        evidence.setEvidenceAvailability(AVAILABILITY_PARTIAL);
        if (safeAssigned.isEmpty()) {
            evidence.setHonestyNote(
                "Agent-reported state rows exist, but this policy has no assigned agents in "
                    + "configuration. Treat as partial evidence only — not host enforcement proof."
            );
        } else if (!reportedAgents.containsAll(safeAssigned)) {
            evidence.setHonestyNote(
                "Partial agent ack/state rows for this policy id; not every assigned agent has "
                    + "reported appliedVersion/state. Do not treat as full host enforcement."
            );
        } else {
            evidence.setHonestyNote(
                "Agent-reported appliedVersion/state rows exist for assigned agents. "
                    + "Host enforcement remains STAGING CANDIDATE — not production-verified."
            );
        }
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
