package com.hivearmor.service.agents_manager;

import com.hivearmor.domain.agents_manager.UtmAgentGroup;
import com.hivearmor.domain.agents_manager.UtmAgentGroupMember;
import com.hivearmor.repository.agents_manager.UtmAgentGroupMemberRepository;
import com.hivearmor.repository.agents_manager.UtmAgentGroupRepository;
import com.hivearmor.service.dto.agent_manager.AgentGroupDTO;
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
        return groupRepo.findAllByOrderByGroupNameAsc().stream().map(g -> {
            AgentGroupDTO dto = new AgentGroupDTO(g);
            List<UtmAgentGroupMember> members = memberRepo.findByGroupId(g.getId());
            dto.setMemberCount(members.size());
            dto.setMemberAgentIds(members.stream().map(UtmAgentGroupMember::getAgentId).collect(Collectors.toList()));
            return dto;
        }).collect(Collectors.toList());
    }

    public Optional<AgentGroupDTO> getById(Long id) {
        return groupRepo.findById(id).map(g -> {
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
        g.setCreatedAt(Instant.now());
        UtmAgentGroup saved = groupRepo.save(g);
        return new AgentGroupDTO(saved);
    }

    public AgentGroupDTO update(Long id, AgentGroupDTO dto) {
        UtmAgentGroup g = groupRepo.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Group not found: " + id));
        g.setGroupName(dto.getGroupName());
        g.setDescription(dto.getDescription());
        g.setPlatform(dto.getPlatform());
        g.setUpdatedAt(Instant.now());
        return new AgentGroupDTO(groupRepo.save(g));
    }

    public void delete(Long id) {
        groupRepo.deleteById(id);
    }

    public void addMember(Long groupId, Integer agentId) {
        if (!memberRepo.existsByGroupIdAndAgentId(groupId, agentId)) {
            UtmAgentGroupMember m = new UtmAgentGroupMember();
            m.setGroupId(groupId);
            m.setAgentId(agentId);
            memberRepo.save(m);
        }
    }

    public void removeMember(Long groupId, Integer agentId) {
        memberRepo.deleteByGroupIdAndAgentId(groupId, agentId);
    }

    public List<Integer> getMembers(Long groupId) {
        return memberRepo.findByGroupId(groupId).stream()
            .map(UtmAgentGroupMember::getAgentId)
            .collect(Collectors.toList());
    }
}
