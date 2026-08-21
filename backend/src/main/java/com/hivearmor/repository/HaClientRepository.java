package com.hivearmor.repository;

import com.hivearmor.domain.HaClient;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Spring Data JPA repository for the {@link HaClient} entity.
 *
 * <p>Provides standard CRUD operations via {@link JpaRepository} plus the
 * MSSP-specific derived queries used by {@code MsspTenantResolver} and
 * {@code MsspOverviewService}.
 *
 * <p>Sprint 21 — MSSP foundation layer.
 * <p>Sprint 23 — added {@code findByMsspManagedTrueAndClientPrefixIsNotNull}.
 *
 * @see com.hivearmor.multitenancy.MsspTenantResolver
 */
@Repository
public interface HaClientRepository extends JpaRepository<HaClient, Long> {

    /**
     * Finds the MSSP-managed client whose {@code client_prefix} matches the
     * given value.
     *
     * <p>The derived query translates to:
     * <pre>
     *   SELECT * FROM ha_client
     *   WHERE client_prefix = :clientPrefix
     *     AND mssp_managed  = TRUE
     *   LIMIT 1
     * </pre>
     *
     * <p>The {@code client_prefix} column carries a {@code UNIQUE} constraint
     * ({@code uc_ha_client_prefix}), so at most one row can match. Returns
     * {@link Optional#empty()} when no MSSP-managed row exists for the prefix.
     *
     * @param clientPrefix the tenant prefix to look up; must not be {@code null}
     * @return an {@link Optional} containing the matching {@link HaClient}, or
     *         {@link Optional#empty()} if no MSSP-managed client has that prefix
     */
    Optional<HaClient> findByClientPrefixAndMsspManagedTrue(String clientPrefix);

    /**
     * Returns all MSSP-managed clients that have a non-null {@code client_prefix}.
     *
     * <p>Used by {@code MsspOverviewService} to build the tenants health list.
     * Translates to:
     * <pre>
     *   SELECT * FROM ha_client
     *   WHERE mssp_managed = TRUE
     *     AND client_prefix IS NOT NULL
     * </pre>
     *
     * @return list of MSSP-managed {@link HaClient} rows with a client prefix set;
     *         never {@code null}, may be empty
     */
    List<HaClient> findByMsspManagedTrueAndClientPrefixIsNotNull();

    /**
     * Returns all MSSP-managed clients that have a non-null {@code client_prefix},
     * sorted ascending by name (case-insensitive).
     *
     * <p>Used by {@code MsspAggregateReportService} to build the aggregate XLSX
     * workbook. The ORDER BY uses {@code LOWER(c.name)} to ensure consistent,
     * locale-independent alphabetical ordering.
     *
     * @return list of MSSP-managed {@link HaClient} rows with a client prefix set,
     *         sorted by lower-cased name; never {@code null}, may be empty
     */
    @Query("SELECT c FROM HaClient c WHERE c.msspManaged = true AND c.clientPrefix IS NOT NULL ORDER BY LOWER(c.name) ASC")
    List<HaClient> findManagedTenantsSortedByName();

    /**
     * Returns {@code true} if a row with the given {@code client_prefix} already
     * exists (regardless of {@code mssp_managed}).
     *
     * <p>Used by {@code MsspProvisioningService} as a fast pre-flight uniqueness
     * check before inserting a new tenant.
     *
     * @param clientPrefix the prefix to check; must not be {@code null}
     * @return {@code true} if at least one row with that prefix exists
     */
    boolean existsByClientPrefix(String clientPrefix);

    /**
     * Returns {@code true} if an {@code ha_client} row with the given primary key
     * exists <em>and</em> has {@code mssp_managed = true}.
     *
     * <p>Used by {@code MsspMembershipService} as the tenant pre-flight check for
     * all membership write operations.
     *
     * @param id the {@code ha_client.id} to check; must not be {@code null}
     * @return {@code true} if the row exists and is MSSP-managed
     */
    boolean existsByIdAndMsspManagedTrue(Long id);
}
