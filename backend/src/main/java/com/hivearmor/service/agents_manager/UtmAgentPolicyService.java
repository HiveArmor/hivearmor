package com.hivearmor.service.agents_manager;

import com.hivearmor.domain.agents_manager.*;
import com.hivearmor.repository.agents_manager.*;
import com.hivearmor.service.dto.agent_manager.*;
import com.hivearmor.service.incident_response.grpc_impl.IncidentResponseCommandService;
import io.grpc.stub.StreamObserver;
import com.hivearmor.service.grpc.CommandResult;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@Transactional
public class UtmAgentPolicyService {

    private final UtmAgentPolicyRepository policyRepo;
    private final UtmPolicyGroupAssignmentRepository assignmentRepo;
    private final UtmPolicyPushLogRepository pushLogRepo;
    private final UtmAgentPolicyStateRepository stateRepo;
    private final UtmAgentGroupMemberRepository memberRepo;
    private final IncidentResponseCommandService commandService;

    public UtmAgentPolicyService(UtmAgentPolicyRepository policyRepo,
                                  UtmPolicyGroupAssignmentRepository assignmentRepo,
                                  UtmPolicyPushLogRepository pushLogRepo,
                                  UtmAgentPolicyStateRepository stateRepo,
                                  UtmAgentGroupMemberRepository memberRepo,
                                  IncidentResponseCommandService commandService) {
        this.policyRepo = policyRepo;
        this.assignmentRepo = assignmentRepo;
        this.pushLogRepo = pushLogRepo;
        this.stateRepo = stateRepo;
        this.memberRepo = memberRepo;
        this.commandService = commandService;
    }

    public List<AgentPolicyDTO> listAll() {
        return policyRepo.findAllByOrderByPolicyNameAsc().stream().map(p -> {
            AgentPolicyDTO dto = new AgentPolicyDTO(p);
            dto.setAssignedGroupIds(assignmentRepo.findByPolicyId(p.getId()).stream()
                .map(UtmPolicyGroupAssignment::getGroupId).collect(Collectors.toList()));
            return dto;
        }).collect(Collectors.toList());
    }

    public Optional<AgentPolicyDTO> getById(Long id) {
        return policyRepo.findById(id).map(p -> {
            AgentPolicyDTO dto = new AgentPolicyDTO(p);
            dto.setAssignedGroupIds(assignmentRepo.findByPolicyId(p.getId()).stream()
                .map(UtmPolicyGroupAssignment::getGroupId).collect(Collectors.toList()));
            return dto;
        });
    }

    public AgentPolicyDTO create(AgentPolicyDTO dto, String createdBy) {
        UtmAgentPolicy p = new UtmAgentPolicy();
        p.setPolicyName(dto.getPolicyName());
        p.setDescription(dto.getDescription());
        p.setPlatform(dto.getPlatform());
        p.setPolicyConfig(dto.getPolicyConfig() != null ? dto.getPolicyConfig() : "{}");
        p.setVersionNum(1);
        p.setIsActive(dto.getIsActive() != null ? dto.getIsActive() : true);
        p.setCreatedBy(createdBy);
        return new AgentPolicyDTO(policyRepo.save(p));
    }

    public AgentPolicyDTO update(Long id, AgentPolicyDTO dto) {
        UtmAgentPolicy p = policyRepo.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Policy not found: " + id));
        p.setPolicyName(dto.getPolicyName());
        p.setDescription(dto.getDescription());
        p.setPlatform(dto.getPlatform());
        if (dto.getPolicyConfig() != null) p.setPolicyConfig(dto.getPolicyConfig());
        if (dto.getIsActive() != null) p.setIsActive(dto.getIsActive());
        p.setVersionNum(p.getVersionNum() + 1);
        p.setUpdatedAt(Instant.now());
        return new AgentPolicyDTO(policyRepo.save(p));
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
            String agentIdStr = String.valueOf(agentId);
            UtmPolicyPushLog log = new UtmPolicyPushLog();
            log.setPolicyId(policyId);
            log.setPolicyName(policy.getPolicyName());
            log.setAgentId(agentIdStr);
            log.setPushedAt(Instant.now());
            log.setPushStatus("PENDING");
            UtmPolicyPushLog savedLog = pushLogRepo.save(log);

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
