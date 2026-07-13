package com.hivearmor.repository.agents_manager;

import com.hivearmor.domain.agents_manager.UtmAgentPolicyState;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UtmAgentPolicyStateRepository extends JpaRepository<UtmAgentPolicyState, Long> {
    List<UtmAgentPolicyState> findByAgentId(String agentId);
    List<UtmAgentPolicyState> findByPolicyId(Long policyId);
    Optional<UtmAgentPolicyState> findByAgentIdAndPolicyId(String agentId, Long policyId);
    List<UtmAgentPolicyState> findByState(String state);
}
