package com.hivearmor.service.mssp;

import com.hivearmor.domain.HaTenantUser;
import com.hivearmor.domain.User;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.repository.HaTenantUserRepository;
import com.hivearmor.repository.UserRepository;
import com.hivearmor.service.mssp.dto.AddTenantMemberRequest;
import com.hivearmor.service.mssp.dto.PatchTenantMemberRequest;
import com.hivearmor.service.mssp.dto.TenantMemberDTO;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Service for managing tenant membership (the {@code ha_tenant_user} table).
 *
 * <p>All four public methods enforce the invariant that membership operations
 * never touch the {@code jhi_user} or {@code jhi_user_authority} tables — only
 * {@code ha_tenant_user} rows are mutated.
 *
 * <p>Sprint 23 — tenant user management (S23-T05).
 *
 * @see com.hivearmor.web.rest.mssp.MsspTenantUserController
 */
@Service
public class MsspMembershipService {

    private final HaClientRepository clients;
    private final HaTenantUserRepository memberships;
    private final UserRepository users;

    public MsspMembershipService(
            HaClientRepository clients,
            HaTenantUserRepository memberships,
            UserRepository users) {
        this.clients = clients;
        this.memberships = memberships;
        this.users = users;
    }

    // -------------------------------------------------------------------------
    // List members
    // -------------------------------------------------------------------------

    /**
     * Returns all members of the given tenant.
     *
     * @param tenantId the {@code ha_client.id}; must refer to an MSSP-managed tenant
     * @return list of member DTOs; never {@code null}
     * @throws NotFoundException when the tenant does not exist or is not MSSP-managed
     */
    @Transactional(readOnly = true)
    public List<TenantMemberDTO> list(Long tenantId) {
        if (!clients.existsByIdAndMsspManagedTrue(tenantId)) {
            throw new NotFoundException("tenant", tenantId);
        }

        List<HaTenantUser> rows = memberships.findByClientId(tenantId);
        return rows.stream()
            .map(row -> {
                User user = users.findById(row.getJhiUserId()).orElse(null);
                return toDTO(row, user);
            })
            .toList();
    }

    // -------------------------------------------------------------------------
    // Add member
    // -------------------------------------------------------------------------

    /**
     * Adds a user to the given tenant.
     *
     * @param tenantId the {@code ha_client.id}
     * @param req      validated request containing {@code userId} and {@code tenantRole}
     * @return the freshly created membership DTO
     * @throws NotFoundException          when the tenant or user does not exist
     * @throws DuplicateMembershipException when the user is already a member
     */
    @Transactional
    public TenantMemberDTO add(Long tenantId, AddTenantMemberRequest req) {
        if (!clients.existsByIdAndMsspManagedTrue(tenantId)) {
            throw new NotFoundException("tenant", tenantId);
        }

        User user = users.findById(req.userId())
            .orElseThrow(() -> new NotFoundException("user", req.userId()));

        if (memberships.existsByClientIdAndJhiUserId(tenantId, req.userId())) {
            throw new DuplicateMembershipException(tenantId, req.userId());
        }

        HaTenantUser row = new HaTenantUser();
        row.setClientId(tenantId);
        row.setJhiUserId(req.userId());
        row.setTenantRole(req.tenantRole());

        HaTenantUser saved = memberships.save(row);
        return toDTO(saved, user);
    }

    // -------------------------------------------------------------------------
    // Remove member
    // -------------------------------------------------------------------------

    /**
     * Removes exactly one {@code ha_tenant_user} row identified by the
     * {@code (clientId, jhiUserId)} pair.
     *
     * <p><strong>This method MUST NOT and does not call any mutating operation on
     * {@code jhi_user} or {@code jhi_user_authority}.</strong> It deletes only the
     * membership join-table row.
     *
     * @param tenantId the {@code ha_client.id}
     * @param userId   the {@code jhi_user.id} of the member to remove
     * @throws NotFoundException when no membership row matches the given pair
     */
    @Transactional
    public void remove(Long tenantId, Long userId) {
        HaTenantUser row = memberships.findByClientIdAndJhiUserId(tenantId, userId)
            .orElseThrow(() -> new NotFoundException("membership", tenantId + "/" + userId));

        memberships.delete(row);
    }

    // -------------------------------------------------------------------------
    // Update role
    // -------------------------------------------------------------------------

    /**
     * Updates the {@code tenant_role} of an existing membership row.
     *
     * @param tenantId the {@code ha_client.id}
     * @param userId   the {@code jhi_user.id}
     * @param req      validated request containing the new {@code tenantRole}
     * @return the updated membership DTO
     * @throws NotFoundException when no membership row matches the given pair
     */
    @Transactional
    public TenantMemberDTO updateRole(Long tenantId, Long userId, PatchTenantMemberRequest req) {
        HaTenantUser row = memberships.findByClientIdAndJhiUserId(tenantId, userId)
            .orElseThrow(() -> new NotFoundException("membership", tenantId + "/" + userId));

        row.setTenantRole(req.tenantRole());
        HaTenantUser saved = memberships.save(row);

        User user = users.findById(userId).orElse(null);
        return toDTO(saved, user);
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /**
     * Converts a {@link HaTenantUser} row and its associated {@link User} (may be
     * {@code null} if the user row has been hard-deleted) into a {@link TenantMemberDTO}.
     */
    private static TenantMemberDTO toDTO(HaTenantUser row, User user) {
        return new TenantMemberDTO(
            row.getId(),
            row.getJhiUserId(),
            user != null ? user.getLogin() : null,
            user != null ? user.getEmail() : null,
            row.getTenantRole(),
            user != null && user.getActivated()
        );
    }
}
