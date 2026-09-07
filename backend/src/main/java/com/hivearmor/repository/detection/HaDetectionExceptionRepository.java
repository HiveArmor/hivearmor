package com.hivearmor.repository.detection;

import com.hivearmor.domain.detection.HaDetectionException;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface HaDetectionExceptionRepository extends JpaRepository<HaDetectionException, Long> {

    List<HaDetectionException> findByRuleIdOrderByUpdatedAtDesc(String ruleId);

    List<HaDetectionException> findByRuleIdAndActiveTrue(String ruleId);

    Optional<HaDetectionException> findByIdAndRuleId(Long id, String ruleId);

    long countByRuleIdAndActiveTrue(String ruleId);

    long countByTenantIdIsNull();

    long countByTenantId(Long tenantId);
}
