package com.hivearmor.service.mssp;

import com.hivearmor.domain.HaClient;
import com.hivearmor.domain.HaTenantUser;
import com.hivearmor.domain.User;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.repository.HaTenantUserRepository;
import com.hivearmor.repository.UserRepository;
import com.hivearmor.service.mssp.dto.NewTenantRequest;
import com.hivearmor.service.mssp.dto.NewTenantResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.security.SecureRandom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link MsspProvisioningService} — pure Mockito, no Spring context.
 *
 * <p>Uses {@link ExtendWith(MockitoExtension.class)} instead of {@code @DataJpaTest}
 * to avoid the {@code ApplicationStartProcessor} issue identified in task T02.
 *
 * <p>Covers:
 * <ul>
 *   <li>(a) Happy path — three saves called, response has correct fields</li>
 *   <li>(b) Duplicate {@code clientPrefix} — {@link DuplicatePrefixException} thrown, no saves</li>
 *   <li>(c) Duplicate {@code adminLogin} — {@link DuplicateLoginException} thrown, only the prefix check ran</li>
 *   <li>(d) Rollback via exception — {@code memberships.save()} throws; exception propagates unchanged</li>
 * </ul>
 *
 * <p>Sprint 23 — MSSP portal backend.
 */
@ExtendWith(MockitoExtension.class)
class MsspProvisioningServiceTest {

    @Mock
    private HaClientRepository clients;

    @Mock
    private UserRepository users;

    @Mock
    private HaTenantUserRepository memberships;

    @Mock
    private SecureRandom random;

    private MsspProvisioningService service;

    /** A valid request used across multiple tests. */
    private static final NewTenantRequest VALID_REQUEST = new NewTenantRequest(
            "Acme Corp",
            "acme",
            "admin@acme.example.com",
            "acme-admin",
            25,
            "standard"
    );

    @BeforeEach
    void setUp() {
        service = new MsspProvisioningService(clients, users, memberships, random);
    }

    // =========================================================================
    // (a) Happy path
    // =========================================================================

    /**
     * When both uniqueness checks pass and all three saves succeed, the returned
     * response must carry the new client's ID, name, prefix, and admin login.
     *
     * <p>Validates: Requirements 8.1, 8.2, 8.3
     */
    @Test
    @DisplayName("provisionTenant — happy path → all three saves called, response populated")
    void provisionTenant_happyPath_savesAllThreeAndReturnsResponse() {
        // Arrange — uniqueness checks pass
        when(clients.existsByClientPrefix("acme")).thenReturn(false);
        when(users.existsByLogin("acme-admin")).thenReturn(false);

        // Saved HaClient gets ID 42
        HaClient savedClient = new HaClient();
        savedClient.setId(42L);
        savedClient.setName("Acme Corp");
        savedClient.setClientPrefix("acme");
        when(clients.save(any(HaClient.class))).thenReturn(savedClient);

        // Saved User gets ID 99
        User savedUser = new User();
        savedUser.setId(99L);
        savedUser.setLogin("acme-admin");
        when(users.save(any(User.class))).thenReturn(savedUser);

        // HaTenantUser save returns a stub (returned value is not used by service)
        when(memberships.save(any(HaTenantUser.class))).thenReturn(new HaTenantUser());

        // Act
        NewTenantResponse response = service.provisionTenant(VALID_REQUEST);

        // Assert — all three saves were called
        verify(clients, times(1)).save(any(HaClient.class));
        verify(users, times(1)).save(any(User.class));
        verify(memberships, times(1)).save(any(HaTenantUser.class));

        // Assert — membership row links the two saved entities
        ArgumentCaptor<HaTenantUser> memberCaptor = ArgumentCaptor.forClass(HaTenantUser.class);
        verify(memberships).save(memberCaptor.capture());
        HaTenantUser captured = memberCaptor.getValue();
        assertThat(captured.getClientId()).isEqualTo(42L);
        assertThat(captured.getJhiUserId()).isEqualTo(99L);
        assertThat(captured.getTenantRole()).isEqualTo("TENANT_ADMIN");

        // Assert — response fields are correct
        assertThat(response).isNotNull();
        assertThat(response.id()).isEqualTo(42L);
        assertThat(response.name()).isEqualTo("Acme Corp");
        assertThat(response.clientPrefix()).isEqualTo("acme");
        assertThat(response.adminLogin()).isEqualTo("acme-admin");
        assertThat(response.createdAt()).isNotNull();
    }

    // =========================================================================
    // (b) Duplicate clientPrefix
    // =========================================================================

    /**
     * When {@code existsByClientPrefix} returns {@code true}, the service must
     * throw {@link DuplicatePrefixException} immediately and never call any
     * {@code save} method.
     *
     * <p>Validates: Requirements 8.5, 8.7
     */
    @Test
    @DisplayName("provisionTenant — duplicate clientPrefix → DuplicatePrefixException, no saves")
    void provisionTenant_duplicatePrefix_throwsAndSkipsAllSaves() {
        // Arrange — prefix already exists
        when(clients.existsByClientPrefix("acme")).thenReturn(true);

        // Act & Assert
        assertThatThrownBy(() -> service.provisionTenant(VALID_REQUEST))
                .isInstanceOf(DuplicatePrefixException.class)
                .hasMessageContaining("acme");

        // No saves should have been called
        verify(clients, never()).save(any());
        verify(users, never()).save(any());
        verify(memberships, never()).save(any());
    }

    // =========================================================================
    // (c) Duplicate adminLogin
    // =========================================================================

    /**
     * When {@code existsByClientPrefix} passes but {@code existsByLogin} returns
     * {@code true}, the service must throw {@link DuplicateLoginException} before
     * touching any of the three save methods.
     *
     * <p>Validates: Requirements 8.6, 8.7
     */
    @Test
    @DisplayName("provisionTenant — duplicate adminLogin → DuplicateLoginException, no saves")
    void provisionTenant_duplicateAdminLogin_throwsAndSkipsAllSaves() {
        // Arrange — prefix is free, login is already taken
        when(clients.existsByClientPrefix("acme")).thenReturn(false);
        when(users.existsByLogin("acme-admin")).thenReturn(true);

        // Act & Assert
        assertThatThrownBy(() -> service.provisionTenant(VALID_REQUEST))
                .isInstanceOf(DuplicateLoginException.class)
                .hasMessageContaining("acme-admin");

        // Prefix check was called, login check was called, but saves were not
        verify(clients, times(1)).existsByClientPrefix("acme");
        verify(users, times(1)).existsByLogin("acme-admin");
        verify(clients, never()).save(any());
        verify(users, never()).save(any());
        verify(memberships, never()).save(any());
    }

    // =========================================================================
    // (d) Rollback via exception — memberships.save() throws
    // =========================================================================

    /**
     * When {@code memberships.save()} throws a {@link RuntimeException}, the
     * exception must propagate unchanged (Spring's {@code @Transactional} would
     * roll back the surrounding transaction in a real context; here we verify the
     * exception is not swallowed by the service itself).
     *
     * <p>Validates: Requirements 8.3, 8.4 (atomicity guarantee)
     */
    @Test
    @DisplayName("provisionTenant — memberships.save() throws RuntimeException → exception propagates")
    void provisionTenant_membershipSaveThrows_exceptionPropagatesUnchanged() {
        // Arrange — all checks pass
        when(clients.existsByClientPrefix("acme")).thenReturn(false);
        when(users.existsByLogin("acme-admin")).thenReturn(false);

        HaClient savedClient = new HaClient();
        savedClient.setId(1L);
        savedClient.setName("Acme Corp");
        savedClient.setClientPrefix("acme");
        when(clients.save(any(HaClient.class))).thenReturn(savedClient);

        User savedUser = new User();
        savedUser.setId(2L);
        savedUser.setLogin("acme-admin");
        when(users.save(any(User.class))).thenReturn(savedUser);

        // memberships.save() blows up
        RuntimeException boom = new RuntimeException("DB constraint violated");
        when(memberships.save(any(HaTenantUser.class))).thenThrow(boom);

        // Act & Assert — the same exception propagates out unchanged
        assertThatThrownBy(() -> service.provisionTenant(VALID_REQUEST))
                .isSameAs(boom);

        // The first two saves were called before the failure
        verify(clients, times(1)).save(any());
        verify(users, times(1)).save(any());
        verify(memberships, times(1)).save(any());
    }
}
