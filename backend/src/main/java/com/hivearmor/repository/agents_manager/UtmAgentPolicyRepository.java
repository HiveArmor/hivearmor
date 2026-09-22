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

    // SPEC-04 (W1b) — tenant-scoped reads. Null-tenant (pre-backfill) rows excluded.
    List<UtmAgentPolicy> findByTenantIdOrderByPolicyNameAsc(Long tenantId);
    Optional<UtmAgentPolicy> findByIdAndTenantId(Long id, Long tenantId);

    // ---- PT-1 (template library) --------------------------------------------------
    // The template library is: this tenant's own templates (any scope) UNION every
    // GLOBAL template (readable cross-tenant). ORG templates of OTHER tenants are excluded.
    // Under RLS the DB already enforces this (tenant_isolation OR global_template_read);
    // the explicit predicate keeps the app-layer read correct pre-RLS / as superuser too.
    @org.springframework.data.jpa.repository.Query(
        "SELECT p FROM UtmAgentPolicy p WHERE p.isTemplate = true AND "
        + "(p.tenantId = :tenantId OR p.scope = 'GLOBAL') "
        + "ORDER BY p.policyName ASC")
    List<UtmAgentPolicy> findVisibleTemplates(@org.springframework.data.repository.query.Param("tenantId") Long tenantId);

    // By-id template load restricted to library visibility (own-tenant OR GLOBAL).
    @org.springframework.data.jpa.repository.Query(
        "SELECT p FROM UtmAgentPolicy p WHERE p.id = :id AND p.isTemplate = true AND "
        + "(p.tenantId = :tenantId OR p.scope = 'GLOBAL')")
    Optional<UtmAgentPolicy> findVisibleTemplateById(
        @org.springframework.data.repository.query.Param("id") Long id,
        @org.springframework.data.repository.query.Param("tenantId") Long tenantId);

    // Name uniqueness check for clone within the visible TEMPLATE library (own-tenant OR GLOBAL).
    // Scoped to is_template=true so a clone name only collides with other library templates,
    // not with ad-hoc (non-template) policies — matches findVisibleTemplates visibility.
    @org.springframework.data.jpa.repository.Query(
        "SELECT CASE WHEN COUNT(p) > 0 THEN true ELSE false END FROM UtmAgentPolicy p "
        + "WHERE p.policyName = :name AND p.isTemplate = true AND (p.tenantId = :tenantId OR p.scope = 'GLOBAL')")
    boolean existsVisibleByPolicyName(
        @org.springframework.data.repository.query.Param("name") String name,
        @org.springframework.data.repository.query.Param("tenantId") Long tenantId);
}
