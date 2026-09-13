package com.hivearmor.service.agents_manager;

import com.hivearmor.domain.agents_manager.UtmAgentGroup;
import com.hivearmor.domain.agents_manager.UtmAgentGroupMember;
import com.hivearmor.multitenancy.TenantScope;
import com.hivearmor.repository.agents_manager.UtmAgentGroupMemberRepository;
import com.hivearmor.repository.agents_manager.UtmAgentGroupRepository;
import com.hivearmor.service.dto.agent_manager.AgentGroupDTO;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@Transactional
public class UtmAgentGroupService {

    private final UtmAgentGroupRepository groupRepo;
    private final UtmAgentGroupMemberRepository memberRepo;

    public UtmAgentGroupService(UtmAgentGroupRepository groupRepo,
                                 UtmAgentGroupMemberRepository memberRepo) {
        this.groupRepo = groupRepo;
        this.memberRepo = memberRepo;
    }

    public List<AgentGroupDTO> listAll() {
        // SPEC-04 (W1b) — scope to the caller's tenant; single-tenant = 0.
        long tenant = TenantScope.requireTenant();
        return groupRepo.findByTenantIdOrderByGroupNameAsc(tenant).stream().map(g -> {
            AgentGroupDTO dto = new AgentGroupDTO(g);
            List<UtmAgentGroupMember> members = memberRepo.findByGroupId(g.getId());
            dto.setMemberCount(members.size());
            dto.setMemberAgentIds(members.stream().map(UtmAgentGroupMember::getAgentId).collect(Collectors.toList()));
            return dto;
        }).collect(Collectors.toList());
    }

    public Optional<AgentGroupDTO> getById(Long id) {
        // SPEC-04 (W1b) — by-id load re-checked against the caller's tenant; a
        // cross-tenant (or null-tenant) id reads as not found (no disclosure).
        long tenant = TenantScope.requireTenant();
        return groupRepo.findByIdAndTenantId(id, tenant).map(g -> {
            AgentGroupDTO dto = new AgentGroupDTO(g);
            List<UtmAgentGroupMember> members = memberRepo.findByGroupId(g.getId());
            dto.setMemberCount(members.size());
            dto.setMemberAgentIds(members.stream().map(UtmAgentGroupMember::getAgentId).collect(Collectors.toList()));
            return dto;
        });
    }

    public AgentGroupDTO create(AgentGroupDTO dto, String createdBy) {
        UtmAgentGroup g = new UtmAgentGroup();
        g.setGroupName(dto.getGroupName());
        g.setDescription(dto.getDescription());
        g.setPlatform(dto.getPlatform());
        g.setCreatedBy(createdBy);
        // SPEC-04 (W1b) — stamp the authoritative tenant server-side (never payload).
        g.setTenantId(TenantScope.requireTenant());
        g.setCreatedAt(Instant.now());
        UtmAgentGroup saved = groupRepo.save(g);
        return new AgentGroupDTO(saved);
    }

    public AgentGroupDTO update(Long id, AgentGroupDTO dto) {
        UtmAgentGroup g = requireInTenant(id);
        g.setGroupName(dto.getGroupName());
        g.setDescription(dto.getDescription());
        g.setPlatform(dto.getPlatform());
        g.setUpdatedAt(Instant.now());
        return new AgentGroupDTO(groupRepo.save(g));
    }

    public void delete(Long id) {
        // Re-check tenant before delete so a cross-tenant id cannot remove a row.
        requireInTenant(id);
        groupRepo.deleteById(id);
    }

    public void addMember(Long groupId, Integer agentId) {
        requireInTenant(groupId);
        if (!memberRepo.existsByGroupIdAndAgentId(groupId, agentId)) {
            UtmAgentGroupMember m = new UtmAgentGroupMember();
            m.setGroupId(groupId);
            m.setAgentId(agentId);
            memberRepo.save(m);
        }
    }

    public void removeMember(Long groupId, Integer agentId) {
        requireInTenant(groupId);
        memberRepo.deleteByGroupIdAndAgentId(groupId, agentId);
    }

    public List<Integer> getMembers(Long groupId) {
        requireInTenant(groupId);
        return memberRepo.findByGroupId(groupId).stream()
            .map(UtmAgentGroupMember::getAgentId)
            .collect(Collectors.toList());
    }

    /**
     * SPEC-04 (W1b) — resolve a group by id ONLY within the caller's tenant.
     * A cross-tenant or pre-backfill null-tenant id is treated as not found so it
     * is neither disclosed nor mutated.
     */
    private UtmAgentGroup requireInTenant(Long id) {
        long tenant = TenantScope.requireTenant();
        return groupRepo.findByIdAndTenantId(id, tenant)
            .orElseThrow(() -> new EntityNotFoundException("Group not found: " + id));
    }
}
