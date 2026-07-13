package com.hivearmor.repository.agents_manager;

import com.hivearmor.domain.agents_manager.UtmAgentPolicy;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UtmAgentPolicyRepository extends JpaRepository<UtmAgentPolicy, Long> {
    Optional<UtmAgentPolicy> findByPolicyName(String policyName);
    List<UtmAgentPolicy> findByPlatform(String platform);
    List<UtmAgentPolicy> findByIsActive(Boolean isActive);
    List<UtmAgentPolicy> findAllByOrderByPolicyNameAsc();
}
