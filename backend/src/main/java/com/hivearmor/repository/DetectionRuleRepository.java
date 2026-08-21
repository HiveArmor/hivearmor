package com.hivearmor.repository;

import com.hivearmor.domain.DetectionRule;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Spring Data JPA repository for the {@link DetectionRule} entity.
 *
 * <p>Provides lookup by tenant, status, scope, and severity for rule inventory,
 * filtering, and bulk operations.
 *
 * <p>Sprint 47 — Detection Rules (DET-008 through DET-016).
 */
@Repository
public interface DetectionRuleRepository extends JpaRepository<DetectionRule, String> {

    /**
     * Finds all detection rules belonging to a specific tenant.
     */
    Page<DetectionRule> findByTenantId(Long tenantId, Pageable pageable);

    /**
     * Finds detection rules by tenant and status.
     */
    List<DetectionRule> findByTenantIdAndStatus(Long tenantId, String status);

    /**
     * Finds detection rules by tenant and scope.
     */
    List<DetectionRule> findByTenantIdAndScope(Long tenantId, String scope);

    /**
     * Counts detection rules by tenant and status.
     */
    long countByTenantIdAndStatus(Long tenantId, String status);

    /**
     * Counts detection rules by tenant and scope.
     */
    long countByTenantIdAndScope(Long tenantId, String scope);
}
