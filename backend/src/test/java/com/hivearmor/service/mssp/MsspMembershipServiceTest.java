package com.hivearmor.service.mssp;

import com.hivearmor.domain.HaTenantUser;
import com.hivearmor.domain.User;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.repository.HaTenantUserRepository;
import com.hivearmor.repository.UserRepository;
import com.hivearmor.service.mssp.dto.AddTenantMemberRequest;
import com.hivearmor.service.mssp.dto.PatchTenantMemberRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link MsspMembershipService} — pure Mockito, no Spring context.
 *
 * <p>Covers:
 * <ul>
 *   <li>(a) {@code remove()} deletes exactly one {@code ha_tenant_user} row and
 *       never touches {@code jhi_user} or authority tables</li>
 *   <li>(b) {@code add()} throws {@link DuplicateMembershipException} when pair
 *       already exists, without calling {@code memberships.save()}</li>
 *   <li>(c) {@code add()} and {@code updateRole()} throw {@link NotFoundException}
 *       for missing tenant, user, or membership</li>
 *   <li>(d) {@code updateRole()} mutates only {@code tenant_role}, preserving other
 *       fields, verified via {@link ArgumentCaptor}</li>
 * </ul>
 *
 * <p>Sprint 23 — MSSP portal backend (S23-T05).
 *
 * <p><strong>Validates: Requirements 14.2, 14.3, 14.4, 14.6, 14.8, 14.9</strong>
 */
@ExtendWith(MockitoExtension.class)
class MsspMembershipServiceTest {

    @Mock
    private HaClientRepository clients;

    @Mock
    private HaTenantUserRepository memberships;

    @Mock
    private UserRepository users;

    private MsspMembershipService service;

    @BeforeEach
    void setUp() {
        service = new MsspMembershipService(clients, memberships, users);
    }

    // =========================================================================
    // (a) remove() — only deletes the membership row; never touches jhi_user
    // =========================================================================

    /**
     * {@code remove(tenantId, userId)} must delete exactly the {@link HaTenantUser}
     * row identified by the {@code (clientId, jhiUserId)} pair and must never call
     * any mutating method on {@link UserRepository}.
     *
     * <p>Validates: Requirements 14.4, 14.8
     */
    @Test
    @DisplayName("remove() — deletes exactly one ha_tenant_user row, never touches jhi_user")
    void remove_existingMembership_deletesRowAndNeverTouchesUserTable() {
        // Arrange
        Long tenantId = 1L;
        Long userId = 2L;

        HaTenantUser existing = new HaTenantUser();
        existing.setId(10L);
        existing.setClientId(tenantId);
        existing.setJhiUserId(userId);
        existing.setTenantRole("TENANT_VIEWER");

        when(memberships.findByClientIdAndJhiUserId(tenantId, userId))
                .thenReturn(Optional.of(existing));

        // Act
        service.remove(tenantId, userId);

        // Assert — membership row was deleted
        verify(memberships, times(1)).delete(existing);

        // Assert — jhi_user table was never touched
        verify(users, never()).delete(any());
        verify(users, never()).deleteById(any());
        verify(users, never()).save(any());
    }

    // =========================================================================
    // (b) add() — DuplicateMembershipException when pair already exists
    // =========================================================================

    /**
     * When a membership row for {@code (tenantId, userId)} already exists,
     * {@code add()} must throw {@link DuplicateMembershipException} and must never
     * call {@code memberships.save()}.
     *
     * <p>Validates: Requirements 14.3, 14.9
     */
    @Test
    @DisplayName("add() — duplicate membership → DuplicateMembershipException, save never called")
    void add_duplicateMembership_throwsAndSkipsSave() {
        // Arrange
        Long tenantId = 1L;
        Long userId = 2L;

        when(clients.existsByIdAndMsspManagedTrue(tenantId)).thenReturn(true);

        User existingUser = new User();
        existingUser.setId(userId);
        existingUser.setLogin("alice");
        when(users.findById(userId)).thenReturn(Optional.of(existingUser));

        when(memberships.existsByClientIdAndJhiUserId(tenantId, userId)).thenReturn(true);

        AddTenantMemberRequest req = new AddTenantMemberRequest(userId, "TENANT_VIEWER");

        // Act & Assert
        assertThatThrownBy(() -> service.add(tenantId, req))
                .isInstanceOf(DuplicateMembershipException.class);

        verify(memberships, never()).save(any());
    }

    // =========================================================================
    // (c) NotFoundException for missing tenant / user / membership
    // =========================================================================

    @Nested
    @DisplayName("NotFoundException cases")
    class NotFoundCases {

        /**
         * {@code add()} must throw {@link NotFoundException} when the tenant does
         * not exist or is not MSSP-managed.
         *
         * <p>Validates: Requirements 14.3, 14.6
         */
        @Test
        @DisplayName("add() — tenant not found → NotFoundException")
        void add_tenantNotFound_throwsNotFoundException() {
            Long tenantId = 99L;
            when(clients.existsByIdAndMsspManagedTrue(tenantId)).thenReturn(false);

            AddTenantMemberRequest req = new AddTenantMemberRequest(2L, "TENANT_VIEWER");

            assertThatThrownBy(() -> service.add(tenantId, req))
                    .isInstanceOf(NotFoundException.class)
                    .hasMessageContaining("tenant");

            verify(memberships, never()).save(any());
        }

        /**
         * {@code add()} must throw {@link NotFoundException} when the tenant exists
         * but the specified user does not.
         *
         * <p>Validates: Requirements 14.3, 14.6
         */
        @Test
        @DisplayName("add() — tenant present, user not found → NotFoundException")
        void add_userNotFound_throwsNotFoundException() {
            Long tenantId = 1L;
            Long userId = 99L;

            when(clients.existsByIdAndMsspManagedTrue(tenantId)).thenReturn(true);
            when(users.findById(userId)).thenReturn(Optional.empty());

            AddTenantMemberRequest req = new AddTenantMemberRequest(userId, "TENANT_VIEWER");

            assertThatThrownBy(() -> service.add(tenantId, req))
                    .isInstanceOf(NotFoundException.class)
                    .hasMessageContaining("user");

            verify(memberships, never()).save(any());
        }

        /**
         * {@code updateRole()} must throw {@link NotFoundException} when no
         * membership row exists for the given {@code (tenantId, userId)} pair.
         *
         * <p>Validates: Requirement 14.6
         */
        @Test
        @DisplayName("updateRole() — membership not found → NotFoundException")
        void updateRole_membershipNotFound_throwsNotFoundException() {
            Long tenantId = 1L;
            Long userId = 2L;

            when(memberships.findByClientIdAndJhiUserId(tenantId, userId))
                    .thenReturn(Optional.empty());

            PatchTenantMemberRequest req = new PatchTenantMemberRequest("TENANT_ADMIN");

            assertThatThrownBy(() -> service.updateRole(tenantId, userId, req))
                    .isInstanceOf(NotFoundException.class)
                    .hasMessageContaining("membership");

            verify(memberships, never()).save(any());
        }
    }

    // =========================================================================
    // (d) updateRole() — only mutates tenant_role, clientId and jhiUserId unchanged
    // =========================================================================

    /**
     * {@code updateRole()} must set {@code tenantRole} to the requested value on
     * the existing entity and save it, while leaving {@code clientId} and
     * {@code jhiUserId} unchanged.
     *
     * <p>Validates: Requirements 14.2, 14.9
     */
    @Test
    @DisplayName("updateRole() — mutates only tenantRole, preserves clientId and jhiUserId")
    void updateRole_existingMembership_mutatesOnlyTenantRole() {
        // Arrange
        Long tenantId = 1L;
        Long userId = 2L;

        HaTenantUser existing = new HaTenantUser();
        existing.setId(10L);
        existing.setClientId(tenantId);
        existing.setJhiUserId(userId);
        existing.setTenantRole("TENANT_VIEWER");

        when(memberships.findByClientIdAndJhiUserId(tenantId, userId))
                .thenReturn(Optional.of(existing));

        // Save returns the captured entity (same reference — simulates JPA behaviour)
        when(memberships.save(any(HaTenantUser.class))).thenAnswer(inv -> inv.getArgument(0));

        // The service also calls users.findById to populate the DTO
        when(users.findById(userId)).thenReturn(Optional.empty());

        PatchTenantMemberRequest req = new PatchTenantMemberRequest("TENANT_ADMIN");

        // Act
        service.updateRole(tenantId, userId, req);

        // Assert — capture what was actually saved
        ArgumentCaptor<HaTenantUser> captor = ArgumentCaptor.forClass(HaTenantUser.class);
        verify(memberships, times(1)).save(captor.capture());

        HaTenantUser saved = captor.getValue();
        assertThat(saved.getTenantRole()).isEqualTo("TENANT_ADMIN");
        assertThat(saved.getClientId()).isEqualTo(tenantId);
        assertThat(saved.getJhiUserId()).isEqualTo(userId);
    }
}
