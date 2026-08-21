package com.hivearmor.web.rest.mssp;

import com.hivearmor.service.mssp.MsspMembershipService;
import com.hivearmor.service.mssp.dto.AddTenantMemberRequest;
import com.hivearmor.service.mssp.dto.PatchTenantMemberRequest;
import com.hivearmor.service.mssp.dto.TenantMemberDTO;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;

/**
 * REST controller for MSSP tenant user-membership endpoints.
 *
 * <p>Every method is gated by {@code @PreAuthorize("hasAuthority('MSSP_ADMIN')")}
 * at the class level. Missing or under-privileged JWTs receive {@code 401} and
 * {@code 403} respectively from JHipster's {@code JwtFilter} / Spring Security.
 *
 * <p>Sprint 23 — S23-T05: list members, add member, remove member, update member role.
 *
 * <p><strong>Requirements: 14.1, 14.2, 14.3, 14.4, 14.6, 14.8, 14.9, 14.10, 14.11, 17.2, 17.3</strong>
 */
@RestController
@RequestMapping("/api/ha-mssp")
@PreAuthorize("hasAuthority('MSSP_ADMIN')")
public class MsspTenantUserController {

    private final MsspMembershipService membershipService;

    public MsspTenantUserController(MsspMembershipService membershipService) {
        this.membershipService = membershipService;
    }

    /**
     * Lists all members of a managed tenant.
     *
     * @param id the {@code ha_client.id} path variable
     * @return list of {@link TenantMemberDTO} with HTTP {@code 200}; {@code 404} if tenant not found
     */
    @GetMapping("/tenants/{id}/users")
    public List<TenantMemberDTO> listMembers(@PathVariable Long id) {
        return membershipService.list(id);
    }

    /**
     * Adds a user to a managed tenant.
     *
     * @param id  the {@code ha_client.id} path variable
     * @param req validated request body containing {@code userId} and {@code tenantRole}
     * @return created {@link TenantMemberDTO} with HTTP {@code 201} and a {@code Location} header;
     *         {@code 404} if tenant or user not found; {@code 409} if membership already exists
     */
    @PostMapping("/tenants/{id}/users")
    public ResponseEntity<TenantMemberDTO> addMember(
            @PathVariable Long id,
            @Valid @RequestBody AddTenantMemberRequest req) {
        TenantMemberDTO created = membershipService.add(id, req);
        URI location = URI.create("/api/ha-mssp/tenants/" + id + "/users/" + created.userId());
        return ResponseEntity.created(location).body(created);
    }

    /**
     * Removes a user from a managed tenant.
     *
     * <p>This operation deletes exactly one row from {@code ha_tenant_user} identified by
     * {@code (tenantId, userId)}. It NEVER deletes from {@code jhi_user} or
     * {@code jhi_user_authority}.
     *
     * @param id     the {@code ha_client.id} path variable
     * @param userId the {@code jhi_user.id} path variable
     * @return HTTP {@code 204 No Content}; {@code 404} if membership not found
     */
    @DeleteMapping("/tenants/{id}/users/{userId}")
    public ResponseEntity<Void> removeMember(
            @PathVariable Long id,
            @PathVariable Long userId) {
        membershipService.remove(id, userId);
        return ResponseEntity.noContent().build();
    }

    /**
     * Updates the {@code tenantRole} of an existing tenant membership.
     *
     * @param id     the {@code ha_client.id} path variable
     * @param userId the {@code jhi_user.id} path variable
     * @param req    validated request body containing the new {@code tenantRole}
     * @return updated {@link TenantMemberDTO} with HTTP {@code 200}; {@code 404} if membership not found
     */
    @PatchMapping("/tenants/{id}/users/{userId}")
    public TenantMemberDTO updateMemberRole(
            @PathVariable Long id,
            @PathVariable Long userId,
            @Valid @RequestBody PatchTenantMemberRequest req) {
        return membershipService.updateRole(id, userId, req);
    }
}
