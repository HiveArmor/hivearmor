package com.hivearmor.repository.correlation.rules;

import com.hivearmor.domain.correlation.rules.UtmRulePushLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UtmRulePushLogRepository extends JpaRepository<UtmRulePushLog, Long> {

    List<UtmRulePushLog> findByRuleIdOrderByPushedAtDesc(Long ruleId);

    List<UtmRulePushLog> findByAgentIdAndPushStatusOrderByPushedAtDesc(String agentId, String pushStatus);
}
