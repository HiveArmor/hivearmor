package com.hivearmor.repository.edr;

import com.hivearmor.domain.edr.UtmEdrRule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UtmEdrRuleRepository extends JpaRepository<UtmEdrRule, Long> {
    List<UtmEdrRule> findByIsActiveTrue();
    List<UtmEdrRule> findByEventType(String eventType);
    List<UtmEdrRule> findByPlatform(String platform);
    List<UtmEdrRule> findByEventTypeAndPlatform(String eventType, String platform);
    boolean existsByRuleName(String ruleName);
}
