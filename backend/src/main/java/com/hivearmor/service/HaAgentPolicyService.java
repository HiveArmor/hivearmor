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
     * <p>STAGING CANDIDATE (POL-001 / POL-003): never claims complete host enforcement.
     * Empty rows or rows lacking {@code appliedVersion}/{@code lastAppliedAt} yield
     * {@code unavailable} with an apply/ack-unavailable honesty note. Rows that carry
     * those fields still yield {@code partial} only — never green “enforced on host”.
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
     * Apply/ack evidence is present only when a state row carries {@code appliedVersion}
     * or {@code lastAppliedAt}. A bare {@code state} string without those fields is not
     * treated as host apply acknowledgment (POL-003 honesty).
     */
    static boolean hasApplyAckEvidence(AgentPolicyStateDTO state) {
        if (state == null) {
            return false;
        }
        return state.getAppliedVersion() != null || state.getLastAppliedAt() != null;
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

        List<AgentPolicyStateDTO> applyAckStates = safeStates.stream()
            .filter(HaAgentPolicyService::hasApplyAckEvidence)
            .collect(Collectors.toList());

        evidence.setApplyAckPathAvailable(!applyAckStates.isEmpty());

        if (safeStates.isEmpty() || applyAckStates.isEmpty()) {
            evidence.setEvidenceAvailability(AVAILABILITY_UNAVAILABLE);
            if (safeStates.isEmpty() && safeAssigned.isEmpty()) {
                evidence.setHonestyNote(
                    "No agents assigned and no agent-reported appliedVersion/ack rows for this policy. "
                        + "Apply/ack path unavailable — assignment is configuration only; "
                        + "never treat as enforced on host."
                );
            } else if (safeStates.isEmpty()) {
                evidence.setHonestyNote(
                    "Agents are assigned in configuration, but no agent-reported appliedVersion/ack "
                        + "rows exist for this policy id. Apply/ack path unavailable — "
                        + "host enforcement is not verified; never treat as enforced on host."
                );
            } else {
                evidence.setHonestyNote(
                    "AgentPolicyState rows exist but lack appliedVersion/lastAppliedAt ack fields. "
                        + "Apply/ack path unavailable — never treat as enforced on host. "
                        + "No live agent gRPC apply path is claimed."
                );
            }
            return;
        }

        Set<String> ackAgents = new HashSet<>();
        for (AgentPolicyStateDTO state : applyAckStates) {
            if (state.getAgentId() != null && !state.getAgentId().isBlank()) {
                ackAgents.add(state.getAgentId());
            }
        }

        // Even with appliedVersion/lastAppliedAt present, evidence stays partial — never complete.
        evidence.setEvidenceAvailability(AVAILABILITY_PARTIAL);
        if (safeAssigned.isEmpty()) {
            evidence.setHonestyNote(
                "Some appliedVersion/lastAppliedAt fields are present without assigned agents in "
                    + "configuration. Treat as partial evidence only — apply/ack path is not "
                    + "LIVE VERIFIED; never treat as enforced on host."
            );
        } else if (!ackAgents.containsAll(safeAssigned)) {
            evidence.setHonestyNote(
                "Partial appliedVersion/ack coverage for this policy id; not every assigned agent "
                    + "has apply/ack fields. Remaining agents: apply/ack path unavailable. "
                    + "Never treat as enforced on host."
            );
        } else {
            evidence.setHonestyNote(
                "appliedVersion/lastAppliedAt fields exist for assigned agents, but host enforcement "
                    + "is not LIVE VERIFIED. Agent device ACK (X-HiveArmor-Agent-Id + X-Agent-Key) is "
                    + "STAGING CANDIDATE on /api/agent-policies; Ha EDR policies still do not push "
                    + "APPLY_POLICY. Never treat as enforced on host."
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
