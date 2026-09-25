package com.hivearmor.repository.agents_manager;

import com.hivearmor.domain.agents_manager.HostTemplateAssociation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * PT-3 — host→template association tables. Visibility = the caller tenant's own tables
 * UNION every GLOBAL table (a GLOBAL table is a cross-tenant default binding). ORG tables
 * of OTHER tenants are excluded. Under RLS the DB enforces this
 * ({@code tenant_isolation OR global_read}); the explicit predicate keeps the app-layer
 * read correct pre-RLS / as superuser too — same discipline as {@code UtmAgentPolicyRepository}.
 */
@Repository
public interface HostTemplateAssociationRepository extends JpaRepository<HostTemplateAssociation, Long> {

    /** All association tables visible to the tenant (own OR GLOBAL), stable order. */
    @Query("SELECT a FROM HostTemplateAssociation a WHERE "
        + "(a.tenantId = :tenantId OR a.scope = 'GLOBAL') "
        + "ORDER BY a.scope ASC, a.name ASC")
    List<HostTemplateAssociation> findVisible(@Param("tenantId") Long tenantId);

    /** By-id load restricted to tenant visibility (own OR GLOBAL). */
    @Query("SELECT a FROM HostTemplateAssociation a WHERE a.id = :id AND "
        + "(a.tenantId = :tenantId OR a.scope = 'GLOBAL')")
    Optional<HostTemplateAssociation> findVisibleById(@Param("id") Long id,
                                                      @Param("tenantId") Long tenantId);

    /** The caller tenant's own ORG table(s) — used for effective-policy resolution. */
    @Query("SELECT a FROM HostTemplateAssociation a WHERE a.tenantId = :tenantId AND a.scope = 'ORG' "
        + "ORDER BY a.id ASC")
    List<HostTemplateAssociation> findOrgTablesForTenant(@Param("tenantId") Long tenantId);

    /** GLOBAL default table(s) — resolved as a fallback after the tenant's own ORG rows. */
    @Query("SELECT a FROM HostTemplateAssociation a WHERE a.scope = 'GLOBAL' ORDER BY a.id ASC")
    List<HostTemplateAssociation> findGlobalTables();

    /** Name-uniqueness check within the visible set (own OR GLOBAL). */
    @Query("SELECT CASE WHEN COUNT(a) > 0 THEN true ELSE false END FROM HostTemplateAssociation a "
        + "WHERE a.name = :name AND (a.tenantId = :tenantId OR a.scope = 'GLOBAL')")
    boolean existsVisibleByName(@Param("name") String name, @Param("tenantId") Long tenantId);
}
