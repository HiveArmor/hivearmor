package com.hivearmor.service.agents_manager;

import com.hivearmor.domain.agents_manager.*;
import com.hivearmor.repository.agents_manager.*;
import com.hivearmor.service.dto.agent_manager.*;
import com.hivearmor.service.incident_response.grpc_impl.IncidentResponseCommandService;
import io.grpc.stub.StreamObserver;
import com.hivearmor.service.grpc.CommandResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@Transactional
public class UtmAgentPolicyService {

    private static final Logger log = LoggerFactory.getLogger(UtmAgentPolicyService.class);

    private final UtmAgentPolicyRepository policyRepo;
    private final UtmPolicyGroupAssignmentRepository assignmentRepo;
    private final UtmPolicyPushLogRepository pushLogRepo;
    private final UtmAgentPolicyStateRepository stateRepo;
    private final UtmAgentGroupMemberRepository memberRepo;
    private final IncidentResponseCommandService commandService;
    private final AgentPolicySchemaService schemaService;

    public UtmAgentPolicyService(UtmAgentPolicyRepository policyRepo,
                                  UtmPolicyGroupAssignmentRepository assignmentRepo,
                                  UtmPolicyPushLogRepository pushLogRepo,
                                  UtmAgentPolicyStateRepository stateRepo,
                                  UtmAgentGroupMemberRepository memberRepo,
                                  IncidentResponseCommandService commandService,
                                  AgentPolicySchemaService schemaService) {
        this.policyRepo = policyRepo;
        this.assignmentRepo = assignmentRepo;
        this.pushLogRepo = pushLogRepo;
        this.stateRepo = stateRepo;
        this.memberRepo = memberRepo;
        this.commandService = commandService;
        this.schemaService = schemaService;
    }

    public List<AgentPolicyDTO> listAll() {
        return policyRepo.findAllByOrderByPolicyNameAsc().stream().map(this::toDto)
            .collect(Collectors.toList());
    }

    public Optional<AgentPolicyDTO> getById(Long id) {
        return policyRepo.findById(id).map(this::toDto);
    }

    public AgentPolicyDTO create(AgentPolicyDTO dto, String createdBy) {
        UtmAgentPolicy p = new UtmAgentPolicy();
        p.setPolicyName(dto.getPolicyName());
        p.setDescription(dto.getDescription());
        p.setPlatform(dto.getPlatform());
        p.setPolicyConfig(schemaService.normalizePolicyConfig(
            dto.getPolicyConfig() != null ? dto.getPolicyConfig() : "{}"));
        p.setVersionNum(1);
        p.setIsActive(dto.getIsActive() != null ? dto.getIsActive() : true);
        p.setCreatedBy(createdBy);
        return toDto(policyRepo.save(p));
    }

    public AgentPolicyDTO update(Long id, AgentPolicyDTO dto) {
        UtmAgentPolicy p = policyRepo.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Policy not found: " + id));
        p.setPolicyName(dto.getPolicyName());
        p.setDescription(dto.getDescription());
        p.setPlatform(dto.getPlatform());
        if (dto.getPolicyConfig() != null) {
            p.setPolicyConfig(schemaService.normalizePolicyConfig(dto.getPolicyConfig()));
        }
        if (dto.getIsActive() != null) p.setIsActive(dto.getIsActive());
        p.setVersionNum(p.getVersionNum() + 1);
        p.setUpdatedAt(Instant.now());
        return toDto(policyRepo.save(p));
    }

    /**
     * Maps entity → DTO and ensures {@code policyConfig} is served as schema v1 JSON
     * even for legacy rows written before BE-POL-01.
     */
    private AgentPolicyDTO toDto(UtmAgentPolicy p) {
        AgentPolicyDTO dto = new AgentPolicyDTO(p);
        dto.setPolicyConfig(schemaService.normalizePolicyConfigForServe(p.getPolicyConfig()));
        dto.setAssignedGroupIds(assignmentRepo.findByPolicyId(p.getId()).stream()
            .map(UtmPolicyGroupAssignment::getGroupId).collect(Collectors.toList()));
        return dto;
    }

    public void delete(Long id) {
        policyRepo.deleteById(id);
    }

    public void assignGroup(Long policyId, Long groupId) {
        if (!assignmentRepo.existsByPolicyIdAndGroupId(policyId, groupId)) {
            UtmPolicyGroupAssignment a = new UtmPolicyGroupAssignment();
            a.setPolicyId(policyId);
            a.setGroupId(groupId);
            a.setAssignedAt(Instant.now());
            try {
                a.setAssignedBy(SecurityContextHolder.getContext().getAuthentication().getName());
            } catch (Exception ignored) {}
            assignmentRepo.save(a);
        }
    }

    public void unassignGroup(Long policyId, Long groupId) {
        assignmentRepo.deleteByPolicyIdAndGroupId(policyId, groupId);
    }

    public void pushPolicyToGroup(Long policyId, Long groupId) {
        UtmAgentPolicy policy = policyRepo.findById(policyId)
            .orElseThrow(() -> new IllegalArgumentException("Policy not found: " + policyId));

        List<Integer> agentIds = memberRepo.findByGroupId(groupId).stream()
            .map(UtmAgentGroupMember::getAgentId).collect(Collectors.toList());

        for (Integer agentId : agentIds) {
            deliverApplyPolicy(policy, String.valueOf(agentId));
        }
    }

    /**
     * Push APPLY_POLICY to a single agent (same delivery path as group push).
     */
    public void pushPolicyToAgent(Long policyId, Integer agentId) {
        if (agentId == null || agentId <= 0) {
            throw new IllegalArgumentException("agentId must be a positive connector id");
        }
        UtmAgentPolicy policy = policyRepo.findById(policyId)
            .orElseThrow(() -> new IllegalArgumentException("Policy not found: " + policyId));
        log.info("Pushing policy id={} version={} to agentId={}",
            policyId, policy.getVersionNum(), agentId);
        deliverApplyPolicy(policy, String.valueOf(agentId));
    }

    /**
     * Best-effort push-on-connect: resolve agent → groups → assigned active policies,
     * return configs, and queue APPLY_POLICY via gRPC when version drifts or no APPLIED state.
     * Does not require agent-manager stream-open hooks (document AM follow-up in EXTERNAL_WORK).
     */
    public AgentPolicySyncOnConnectDTO syncOnConnect(String agentId) {
        if (agentId == null || agentId.isBlank()) {
            throw new IllegalArgumentException("agentId required");
        }
        int connectorId;
        try {
            connectorId = Integer.parseInt(agentId.trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("agentId must be numeric connector id");
        }
        if (connectorId <= 0) {
            throw new IllegalArgumentException("agentId must be a positive connector id");
        }

        AgentPolicySyncOnConnectDTO result = new AgentPolicySyncOnConnectDTO();
        result.setAgentId(String.valueOf(connectorId));

        List<UtmAgentGroupMember> memberships = memberRepo.findByAgentId(connectorId);
        // Deduplicate policies across groups (LinkedHashMap preserves first-seen order).
        Map<Long, UtmAgentPolicy> policiesById = new LinkedHashMap<>();
        for (UtmAgentGroupMember membership : memberships) {
            for (UtmPolicyGroupAssignment assignment : assignmentRepo.findByGroupId(membership.getGroupId())) {
                if (policiesById.containsKey(assignment.getPolicyId())) {
                    continue;
                }
                policyRepo.findById(assignment.getPolicyId()).ifPresent(policy -> {
                    if (Boolean.TRUE.equals(policy.getIsActive())) {
                        policiesById.put(policy.getId(), policy);
                    }
                });
            }
        }

        List<AgentPolicySyncOnConnectDTO.AssignedPolicy> assigned = new ArrayList<>();
        for (UtmAgentPolicy policy : policiesById.values()) {
            AgentPolicySyncOnConnectDTO.AssignedPolicy item = new AgentPolicySyncOnConnectDTO.AssignedPolicy();
            item.setPolicyId(policy.getId());
            item.setPolicyName(policy.getPolicyName());
            item.setVersionNum(policy.getVersionNum());
            item.setPolicyConfig(schemaService.normalizePolicyConfigForServe(policy.getPolicyConfig()));

            Optional<UtmAgentPolicyState> stateOpt =
                stateRepo.findByAgentIdAndPolicyId(String.valueOf(connectorId), policy.getId());
            boolean current = stateOpt
                .filter(s -> "APPLIED".equals(s.getState()))
                .filter(s -> policy.getVersionNum().equals(s.getAppliedVersion()))
                .isPresent();
            item.setAlreadyCurrent(current);
            if (!current) {
                deliverApplyPolicy(policy, String.valueOf(connectorId));
                item.setPushed(true);
            } else {
                item.setPushed(false);
            }
            assigned.add(item);
        }
        result.setPolicies(assigned);
        log.info("sync-on-connect agentId={} policies={} pushed={}",
            connectorId, assigned.size(),
            assigned.stream().filter(AgentPolicySyncOnConnectDTO.AssignedPolicy::isPushed).count());
        return result;
    }

    private void deliverApplyPolicy(UtmAgentPolicy policy, String agentIdStr) {
        Long policyId = policy.getId();
        UtmPolicyPushLog pushLog = new UtmPolicyPushLog();
        pushLog.setPolicyId(policyId);
        pushLog.setPolicyName(policy.getPolicyName());
        pushLog.setAgentId(agentIdStr);
        pushLog.setPushedAt(Instant.now());
        pushLog.setPushStatus("PENDING");
        UtmPolicyPushLog savedLog = pushLogRepo.save(pushLog);

        commandService.sendCommand(
            agentIdStr,
            "APPLY_POLICY:" + policyId + ":" + policy.getVersionNum(),
            "POLICY_DISTRIBUTION",
            policyId.toString(),
            "Push policy " + policy.getPolicyName() + " v" + policy.getVersionNum(),
            "system",
            "",
            new StreamObserver<CommandResult>() {
                @Override public void onNext(CommandResult r) {
                    savedLog.setPushStatus("DELIVERED");
                    savedLog.setAckAt(Instant.now());
                    pushLogRepo.save(savedLog);
                }
                @Override public void onError(Throwable t) {
                    savedLog.setPushStatus("FAILED");
                    savedLog.setErrorMsg(t.getMessage());
                    pushLogRepo.save(savedLog);
                }
                @Override public void onCompleted() {}
            }
        );
    }

    public List<PolicyPushLogDTO> getPushLog(Long policyId) {
        return pushLogRepo.findByPolicyIdOrderByPushedAtDesc(policyId).stream()
            .map(PolicyPushLogDTO::new).collect(Collectors.toList());
    }

    public List<AgentPolicyStateDTO> getPolicyStates(Long policyId) {
        return stateRepo.findByPolicyId(policyId).stream()
            .map(AgentPolicyStateDTO::new).collect(Collectors.toList());
    }

    public void updatePolicyState(String agentId, Long policyId, Integer appliedVersion, String state, String driftDetails) {
        UtmAgentPolicyState s = stateRepo.findByAgentIdAndPolicyId(agentId, policyId)
            .orElseGet(() -> {
                UtmAgentPolicyState ns = new UtmAgentPolicyState();
                ns.setAgentId(agentId);
                ns.setPolicyId(policyId);
                return ns;
            });
        if (appliedVersion != null) s.setAppliedVersion(appliedVersion);
        s.setState(state);
        s.setLastCheckedAt(Instant.now());
        if ("APPLIED".equals(state)) s.setLastAppliedAt(Instant.now());
        if (driftDetails != null) s.setDriftDetails(driftDetails);
        Optional<UtmAgentPolicy> policyOpt = policyRepo.findById(policyId);
        policyOpt.ifPresent(p -> s.setDesiredVersion(p.getVersionNum()));
        stateRepo.save(s);
    }

    @Scheduled(fixedDelay = 600_000)
    public void driftCheck() {
        List<UtmAgentPolicyState> states = stateRepo.findAll();
        for (UtmAgentPolicyState s : states) {
            policyRepo.findById(s.getPolicyId()).ifPresent(policy -> {
                if (s.getAppliedVersion() != null && !s.getAppliedVersion().equals(policy.getVersionNum())) {
                    s.setState("DRIFT");
                    s.setDriftDetails("Applied v" + s.getAppliedVersion() + " != desired v" + policy.getVersionNum());
                    s.setLastCheckedAt(Instant.now());
                    stateRepo.save(s);
                }
            });
        }
    }
}
