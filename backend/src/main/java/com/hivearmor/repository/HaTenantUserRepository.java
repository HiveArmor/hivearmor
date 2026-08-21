package com.hivearmor.repository;

import com.hivearmor.domain.HaTenantUser;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Spring Data JPA repository for the {@link HaTenantUser} entity.
 *
 * <p>Provides standard CRUD operations inherited from {@link JpaRepository} plus
 * a derived query used by {@code TenantContextFilter} step&nbsp;(c) to look up the
 * default tenant assignment for an authenticated user.
 *
 * <p>{@link #findFirstByJhiUserId(Long)} maps to
 * {@code SELECT ... FROM ha_tenant_user WHERE jhi_user_id = ? LIMIT 1}.
 * If a user has more than one tenant assignment, this returns any one of them and
 * the filter treats that {@code clientId} as the default; MSSP admins override the
 * default via step&nbsp;(a) ({@code X-Tenant-Prefix} header) instead.
 *
 * <p>Sprint 21 — MSSP foundation layer.
 * <p>Sprint 23 — added {@code countDistinctActiveUserIds} and {@code countByClientId}.
 *
 * @see com.hivearmor.multitenancy.TenantContextFilter
 */
@Repository
public interface HaTenantUserRepository extends JpaRepository<HaTenantUser, Long> {

    /**
     * Returns the first {@link HaTenantUser} row whose {@code jhi_user_id} matches
     * the given value, or {@link Optional#empty()} if no row exists.
     *
     * <p>Called by {@code TenantContextFilter.resolvePrefix} when the JWT contains no
     * {@code clientId} claim (step&nbsp;c of the four-step resolution order). The
     * result is used only to read {@code clientId}; no {@code HaClient} graph is
     * eagerly loaded from this call.
     *
     * @param jhiUserId the {@code id} of the {@code jhi_user} record; must not be
     *                  {@code null}
     * @return an {@link Optional} containing the first matching tenant-user row, or
     *         {@link Optional#empty()} if none exists
     */
    Optional<HaTenantUser> findFirstByJhiUserId(Long jhiUserId);

    /**
     * Counts distinct {@code jhi_user_id} values in {@code ha_tenant_user} whose
     * corresponding {@code jhi_user} record has {@code activated = true}.
     *
     * <p>Used by {@code MsspOverviewService} to populate
     * {@code MsspOverviewDTO.activeUserCount}. The JPQL join ensures only active
     * user accounts are included.
     *
     * @return count of distinct active user IDs across all tenant assignments
     */
    @Query("SELECT COUNT(DISTINCT tu.jhiUserId) FROM HaTenantUser tu " +
           "JOIN User u ON u.id = tu.jhiUserId " +
           "WHERE u.activated = true")
    long countDistinctActiveUserIds();

    /**
     * Counts the number of {@code ha_tenant_user} rows for the given tenant
     * (i.e. {@code client_id}).
     *
     * <p>Used by {@code MsspOverviewService.toHealth} to populate
     * {@code TenantHealthDTO.userCount} per tenant.
     *
     * @param clientId the {@code ha_client.id} of the tenant; must not be {@code null}
     * @return number of user memberships for that tenant
     */
    long countByClientId(Long clientId);

    /**
     * Returns the {@link HaTenantUser} row whose {@code client_id} and
     * {@code jhi_user_id} match the given values.
     *
     * <p>Used by {@code MsspMembershipService} to locate a specific membership
     * before updating or deleting it.
     *
     * @param clientId  the {@code ha_client.id} of the tenant; must not be {@code null}
     * @param jhiUserId the {@code jhi_user.id} of the member; must not be {@code null}
     * @return an {@link Optional} containing the matching row, or empty if none exists
     */
    Optional<HaTenantUser> findByClientIdAndJhiUserId(Long clientId, Long jhiUserId);

    /**
     * Returns {@code true} if a membership row exists for the given tenant/user pair.
     *
     * <p>Used by {@code MsspMembershipService} as a fast duplicate check in
     * {@code add}.
     *
     * @param clientId  the {@code ha_client.id}; must not be {@code null}
     * @param jhiUserId the {@code jhi_user.id}; must not be {@code null}
     * @return {@code true} if at least one row matches
     */
    boolean existsByClientIdAndJhiUserId(Long clientId, Long jhiUserId);

    /**
     * Returns all {@link HaTenantUser} rows for the given tenant.
     *
     * <p>Used by {@code MsspMembershipService.list} to fetch the full member list
     * for a tenant before joining with {@code jhi_user} to populate the DTO.
     *
     * @param clientId the {@code ha_client.id}; must not be {@code null}
     * @return list of membership rows; never {@code null}, may be empty
     */
    List<HaTenantUser> findByClientId(Long clientId);
}
