package com.hivearmor.repository.agents_manager;

import com.hivearmor.domain.agents_manager.UtmAgentGroupMember;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UtmAgentGroupMemberRepository extends JpaRepository<UtmAgentGroupMember, Long> {
    List<UtmAgentGroupMember> findByGroupId(Long groupId);
    List<UtmAgentGroupMember> findByAgentId(Integer agentId);
    void deleteByGroupIdAndAgentId(Long groupId, Integer agentId);
    boolean existsByGroupIdAndAgentId(Long groupId, Integer agentId);
}
