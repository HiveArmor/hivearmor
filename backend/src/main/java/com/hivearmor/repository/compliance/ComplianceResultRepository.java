package com.hivearmor.repository.compliance;

import com.hivearmor.domain.compliance.ComplianceResult;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Spring Data JPA repository for {@link ComplianceResult}.
 *
 * <p>Provides MSSP-scoped query variants that append a {@code client_id} predicate
 * when the caller is operating under a tenant context. The {@code clientId} parameter
 * is always bound via a named parameter — never concatenated into the query string —
 * as required by Requirement 2.4.
 *
 * <p>Sprint 24 — S24-T01: per-tenant compliance layer.
 */
@Repository
public interface ComplianceResultRepository extends JpaRepository<ComplianceResult, Long> {

    // -------------------------------------------------------------------------
    // Standard (non-tenant-scoped) queries — return all rows for the predicate
    // -------------------------------------------------------------------------

    /**
     * Returns all compliance results for the given framework, without any
     * {@code client_id} filter. Used when {@code TenantContext.isMssp()} is
     * {@code false}.
     *
     * @param framework the framework name (e.g. {@code "SOC 2"})
     * @return all matching rows, unsorted
     */
    @Query("select cr from ComplianceResult cr where cr.framework = :framework")
    List<ComplianceResult> findByFramework(@Param("framework") String framework);

    // -------------------------------------------------------------------------
    // MSSP-scoped query variants — bind clientId, never concatenate
    // -------------------------------------------------------------------------

    /**
     * Returns compliance results filtered by both framework and owning tenant.
     * Used when {@code TenantContext.isMssp()} is {@code true}.
     *
     * @param framework the framework name
     * @param clientId  the {@code ha_client.id} of the current tenant
     * @return rows belonging to the given tenant for that framework
     */
    @Query("select cr from ComplianceResult cr where cr.framework = :framework and cr.clientId = :clientId")
    List<ComplianceResult> findByFrameworkAndClientId(
            @Param("framework") String framework,
            @Param("clientId") Long clientId);

    /**
     * Returns all compliance results for a specific tenant, sorted ascending by
     * {@code evaluatedAt}. Used by {@code MsspAggregateReportService} to populate
     * per-tenant XLSX sheets.
     *
     * @param clientId the {@code ha_client.id} of the target tenant
     * @return rows for that tenant, oldest first
     */
    @Query("select cr from ComplianceResult cr where cr.clientId = :clientId order by cr.evaluatedAt asc")
    List<ComplianceResult> findByClientIdOrderByEvaluatedAtAsc(@Param("clientId") Long clientId);

    /**
     * Returns all compliance results without any tenant filter.
     * Used for global/non-MSSP queries.
     *
     * @return all rows, unsorted
     */
    @Query("select cr from ComplianceResult cr order by cr.evaluatedAt desc")
    List<ComplianceResult> findAllOrderByEvaluatedAtDesc();

    /**
     * Returns a {@link ComplianceRollup} with aggregate pass/fail counts for the
     * given tenant. Uses a JPQL constructor expression so no intermediate list is
     * loaded into memory.
     *
     * <p>The status comparison uses the exact string {@code 'PASS'} (upper-case) to
     * match the canonical value stored by the compliance evaluation engine.
     *
     * @param clientId the {@code ha_client.id} of the target tenant; must not be
     *                 {@code null}
     * @return a {@link ComplianceRollup} instance; may be {@code null} when the
     *         underlying {@code SUM} returns nothing (no rows for this tenant)
     */
    @Query("SELECT new com.hivearmor.repository.compliance.ComplianceRollup(" +
           "CAST(SUM(CASE WHEN cr.status = 'PASS' THEN 1 ELSE 0 END) AS int), " +
           "CAST(SUM(CASE WHEN cr.status != 'PASS' THEN 1 ELSE 0 END) AS int)) " +
           "FROM ComplianceResult cr WHERE cr.clientId = :clientId")
    ComplianceRollup rollupForClient(@Param("clientId") Long clientId);
}
