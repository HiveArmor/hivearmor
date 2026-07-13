package com.hivearmor.repository.agents_manager;

import com.hivearmor.domain.agents_manager.UtmPolicyPushLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UtmPolicyPushLogRepository extends JpaRepository<UtmPolicyPushLog, Long> {
    List<UtmPolicyPushLog> findByPolicyIdOrderByPushedAtDesc(Long policyId);
    List<UtmPolicyPushLog> findByAgentIdOrderByPushedAtDesc(String agentId);
    List<UtmPolicyPushLog> findByPushStatusOrderByPushedAtDesc(String pushStatus);
}
