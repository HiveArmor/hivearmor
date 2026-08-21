package com.hivearmor.service.mssp;

import com.hivearmor.domain.HaClient;
import com.hivearmor.domain.HaTenantUser;
import com.hivearmor.domain.User;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.repository.HaTenantUserRepository;
import com.hivearmor.repository.UserRepository;
import com.hivearmor.service.mssp.dto.NewTenantRequest;
import com.hivearmor.service.mssp.dto.NewTenantResponse;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
import org.junit.jupiter.api.Tag;

import java.security.SecureRandom;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Property 3: Tenant provisioning is atomic under failure at any step
 *
 * <p>Validates: Requirements 8.3, 8.4, 8.10, 8.11
 *
 * <p>Uses pure Mockito (no Spring context) so every trial is fast and isolated.
 * jqwik re-creates all mocks before each trial via {@link BeforeTry}.
 *
 * <h2>Properties covered</h2>
 * <ol>
 *   <li>Duplicate {@code clientPrefix} → {@link DuplicatePrefixException}, no saves
 *       called.</li>
 *   <li>Duplicate {@code adminLogin} → {@link DuplicateLoginException}, no saves
 *       called.</li>
 *   <li>Exception at {@code memberships.save()} propagates unchanged (same instance).</li>
 *   <li>Happy-path: exactly one save each to clients, users, memberships; response
 *       carries correct id / prefix / login; membership links correct client and user
 *       ids with role {@code "TENANT_ADMIN"}.</li>
 * </ol>
 *
 * <p>Sprint 23 — MSSP portal backend.
 */
@Tag("Feature: sprint-23-mssp-portal")
@Label("Feature: sprint-23-mssp-portal, Property 3: Tenant provisioning is atomic under failure at any step")
class MsspProvisioningServicePropertyTest {

    // -------------------------------------------------------------------------
    // Mocks — re-created fresh for every jqwik trial via @BeforeTry
    // -------------------------------------------------------------------------

    private HaClientRepository      clients;
    private UserRepository           users;
    private HaTenantUserRepository   memberships;
    private SecureRandom             random;
    private MsspProvisioningService  service;

    @BeforeTry
    void setUp() {
        clients     = mock(HaClientRepository.class);
        users       = mock(UserRepository.class);
        memberships = mock(HaTenantUserRepository.class);
        random      = new SecureRandom();
        service     = new MsspProvisioningService(clients, users, memberships, random);
    }

    // =========================================================================
    // Arbitraries
    // =========================================================================

    /**
     * Valid {@code clientPrefix}: matches {@code ^[a-z0-9-]{2,20}$} with no
     * leading/trailing hyphen.
     */
    @Provide
    Arbitrary<String> validPrefixes() {
        return Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz0123456789-")
                .ofMinLength(2).ofMaxLength(20)
                .filter(s -> !s.startsWith("-") && !s.endsWith("-"));
    }

    /**
     * Fully-populated {@link NewTenantRequest} values that satisfy all bean-validation
     * constraints declared on the record.
     */
    @Provide
    Arbitrary<NewTenantRequest> validRequests() {
        return Combinators.combine(
                Arbitraries.strings().alpha().ofMinLength(1).ofMaxLength(50),
                validPrefixes(),
                Arbitraries.strings().alpha().ofMinLength(1).ofMaxLength(20)
                        .map(s -> s + "@test.com"),
                Arbitraries.strings().alpha().ofMinLength(1).ofMaxLength(20),
                Arbitraries.integers().between(1, 1000),
                Arbitraries.of("standard", "enterprise", "trial")
        ).as(NewTenantRequest::new);
    }

    // =========================================================================
    // Property 3a — duplicate prefix prevents all saves
    // Validates: Requirements 8.3, 8.10
    // =========================================================================

    /**
     * **Validates: Requirements 8.3, 8.10**
     *
     * <p>When {@code clients.existsByClientPrefix()} returns {@code true} the service
     * must throw {@link DuplicatePrefixException} and must never call {@code save()} on
     * any repository.
     */
    @Property(tries = 100)
    @Label("Feature: sprint-23-mssp-portal, Property 3: duplicate prefix prevents all saves")
    void property3_duplicatePrefixPreventsAllSaves(
            @ForAll("validRequests") NewTenantRequest req) {

        // Arrange: prefix already exists in ha_client
        when(clients.existsByClientPrefix(req.clientPrefix())).thenReturn(true);

        // Act + Assert: must throw DuplicatePrefixException
        assertThatThrownBy(() -> service.provisionTenant(req))
                .isInstanceOf(DuplicatePrefixException.class);

        // No row must have been written
        verify(clients,     never()).save(any(HaClient.class));
        verify(users,       never()).save(any(User.class));
        verify(memberships, never()).save(any(HaTenantUser.class));
    }

    // =========================================================================
    // Property 3b — duplicate login prevents all saves
    // Validates: Requirements 8.4, 8.10
    // =========================================================================

    /**
     * **Validates: Requirements 8.4, 8.10**
     *
     * <p>When {@code users.existsByLogin()} returns {@code true} the service must throw
     * {@link DuplicateLoginException} and must never call {@code save()} on any
     * repository.
     */
    @Property(tries = 100)
    @Label("Feature: sprint-23-mssp-portal, Property 3: duplicate login prevents all saves")
    void property3_duplicateLoginPreventsAllSaves(
            @ForAll("validRequests") NewTenantRequest req) {

        // Arrange: prefix is free, but login already exists in jhi_user
        when(clients.existsByClientPrefix(req.clientPrefix())).thenReturn(false);
        when(users.existsByLogin(req.adminLogin())).thenReturn(true);

        // Act + Assert: must throw DuplicateLoginException
        assertThatThrownBy(() -> service.provisionTenant(req))
                .isInstanceOf(DuplicateLoginException.class);

        // No row must have been written
        verify(clients,     never()).save(any(HaClient.class));
        verify(users,       never()).save(any(User.class));
        verify(memberships, never()).save(any(HaTenantUser.class));
    }

    // =========================================================================
    // Property 3c — exception at memberships.save propagates unchanged
    // Validates: Requirements 8.11
    // =========================================================================

    /**
     * **Validates: Requirements 8.11**
     *
     * <p>When the save of {@code ha_tenant_user} throws a {@link RuntimeException} the
     * exact exception instance must propagate out of {@code provisionTenant()} unchanged
     * (same object reference).  Spring's {@code @Transactional} would then roll back all
     * previously-flushed inserts.
     */
    @Property(tries = 100)
    @Label("Feature: sprint-23-mssp-portal, Property 3: exception at memberships.save propagates unchanged")
    void property3_exceptionAtMembershipSavePropagates(
            @ForAll("validRequests") NewTenantRequest req) {

        // Arrange: happy-path until memberships.save, which throws
        when(clients.existsByClientPrefix(req.clientPrefix())).thenReturn(false);
        when(users.existsByLogin(req.adminLogin())).thenReturn(false);

        HaClient savedClient = new HaClient();
        savedClient.setId(1L);
        savedClient.setName(req.name());
        savedClient.setClientPrefix(req.clientPrefix());
        when(clients.save(any())).thenReturn(savedClient);

        User savedUser = new User();
        savedUser.setId(2L);
        savedUser.setLogin(req.adminLogin());
        when(users.save(any())).thenReturn(savedUser);

        RuntimeException injected = new RuntimeException("simulated DB failure");
        when(memberships.save(any())).thenThrow(injected);

        // Act + Assert: the exact same exception instance must propagate
        assertThatThrownBy(() -> service.provisionTenant(req))
                .isSameAs(injected);
    }

    // =========================================================================
    // Property 3d — happy path inserts all three rows with correct linkage
    // Validates: Requirements 8.3, 8.4, 8.10, 8.11
    // =========================================================================

    /**
     * **Validates: Requirements 8.3, 8.4, 8.10, 8.11**
     *
     * <p>When pre-flight checks pass and all saves succeed, the service must:
     * <ol>
     *   <li>Call {@code clients.save()} exactly once.</li>
     *   <li>Call {@code users.save()} exactly once.</li>
     *   <li>Call {@code memberships.save()} exactly once, with an {@link HaTenantUser}
     *       whose {@code clientId} matches the saved client's id, whose {@code jhiUserId}
     *       matches the saved user's id, and whose {@code tenantRole} is
     *       {@code "TENANT_ADMIN"}.</li>
     *   <li>Return a {@link NewTenantResponse} carrying the correct {@code id},
     *       {@code clientPrefix}, and {@code adminLogin}.</li>
     * </ol>
     */
    @Property(tries = 100)
    @Label("Feature: sprint-23-mssp-portal, Property 3: happy path inserts all three rows with correct linkage")
    void property3_happyPathInsertsAllThreeRows(
            @ForAll("validRequests") NewTenantRequest req) {

        // Arrange
        when(clients.existsByClientPrefix(req.clientPrefix())).thenReturn(false);
        when(users.existsByLogin(req.adminLogin())).thenReturn(false);

        HaClient savedClient = new HaClient();
        savedClient.setId(10L);
        savedClient.setName(req.name());
        savedClient.setClientPrefix(req.clientPrefix());
        when(clients.save(any())).thenReturn(savedClient);

        User savedUser = new User();
        savedUser.setId(20L);
        savedUser.setLogin(req.adminLogin());
        when(users.save(any())).thenReturn(savedUser);

        HaTenantUser savedMembership = new HaTenantUser();
        savedMembership.setId(30L);
        when(memberships.save(any())).thenReturn(savedMembership);

        // Act
        NewTenantResponse response = service.provisionTenant(req);

        // Assert: response carries correct scalar fields
        assertThat(response.id())
                .as("response.id must equal the persisted client id")
                .isEqualTo(10L);
        assertThat(response.clientPrefix())
                .as("response.clientPrefix must equal req.clientPrefix")
                .isEqualTo(req.clientPrefix());
        assertThat(response.adminLogin())
                .as("response.adminLogin must equal req.adminLogin (lower-cased)")
                .isEqualToIgnoringCase(req.adminLogin());

        // Assert: exactly one save per repository
        verify(clients,     times(1)).save(any(HaClient.class));
        verify(users,       times(1)).save(any(User.class));

        // Assert: HaTenantUser saved with correct linkage to the client and user rows
        verify(memberships, times(1)).save(argThat(m ->
                m.getClientId()  != null && m.getClientId().equals(10L) &&
                m.getJhiUserId() != null && m.getJhiUserId().equals(20L) &&
                "TENANT_ADMIN".equals(m.getTenantRole())
        ));
    }
}
