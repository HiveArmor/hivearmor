package com.hivearmor.repository;

import com.hivearmor.domain.HiveNotificationRule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface HiveNotificationRuleRepository extends JpaRepository<HiveNotificationRule, Long> {

    List<HiveNotificationRule> findAllByTenantId(Long tenantId);

    List<HiveNotificationRule> findAllByEnabledTrue();
}
