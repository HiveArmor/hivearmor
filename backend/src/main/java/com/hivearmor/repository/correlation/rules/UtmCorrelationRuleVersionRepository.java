package com.hivearmor.repository.correlation.rules;

import com.hivearmor.domain.correlation.rules.UtmCorrelationRuleVersion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UtmCorrelationRuleVersionRepository extends JpaRepository<UtmCorrelationRuleVersion, Long> {

    List<UtmCorrelationRuleVersion> findByRuleIdOrderByVersionNumDesc(Long ruleId);

    Optional<UtmCorrelationRuleVersion> findByRuleIdAndVersionNum(Long ruleId, Integer versionNum);

    int countByRuleId(Long ruleId);
}
