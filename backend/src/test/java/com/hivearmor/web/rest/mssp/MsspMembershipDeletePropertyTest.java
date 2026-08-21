package com.hivearmor.web.rest.mssp;

import com.hivearmor.domain.HaTenantUser;
import com.hivearmor.repository.HaTenantUserRepository;
import com.hivearmor.repository.UserRepository;
import com.hivearmor.service.mssp.MsspMembershipService;
import com.hivearmor.repository.HaClientRepository;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
import org.junit.jupiter.api.Tag;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Collections;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;

/**
 * Property 7: {@code DELETE /api/ha-mssp/tenants/{id}/users/{userId}} mutates only
 * {@code ha_tenant_user}.
 *
 * <p><strong>Feature: sprint-23-mssp-portal, Property 7:
 * DELETE /api/ha-mssp/tenants/{id}/users/{userId} mutates only ha_tenant_user</strong>
 *
 * <p><strong>Validates: Requirements 14.5, 14.6</strong>
 *
 * <h2>Properties covered</h2>
 * <ol>
 *   <li><strong>Service-layer mutation guard</strong>: for any {@code (tenantId, userId)}
 *       pair, calling {@link MsspMembershipService#remove(Long, Long)} calls
 *       {@code memberships.delete(row)} EXACTLY ONCE and NEVER invokes any mutating
 *       method on the {@code users} repository ({@code delete}, {@code deleteById},
 *       {@code save}, {@code saveAll}, {@code deleteAll}, {@code deleteAllById}).</li>
 *   <li><strong>Controller layer</strong>: the controller returns HTTP {@code 204 No
 *       Content} (empty body) for a valid delete, and delegates exactly once to
 *       {@code MsspMembershipService.remove(tenantId, userId)}.</li>
 * </ol>
 *
 * <h2>Approach</h2>
 * <p>Pure Mockito — no Spring context, no {@code @DataJpaTest}, no database. jqwik
 * rebuilds all mocks via {@link BeforeTry} before every trial so state never leaks
 * across iterations. The controller property uses a standalone MockMvc setup with an
 * inline {@code MSSP_ADMIN} filter that installs the required authority so
 * {@code @PreAuthorize} does not interfere with the mutation-guard assertion.
 *
 * <h2>Minimum iterations</h2>
 * <p>100 per property (enforced via {@code @Property(tries = 100)}).
 *
 * <p>Sprint 23 — S23-T05: tenant membership management.
 */
@Tag("Feature: sprint-23-mssp-portal")
@Tag("Property 7")
@Label("Feature: sprint-23-mssp-portal, Property 7: DELETE /api/ha-mssp/tenants/{id}/users/{userId} mutates only ha_tenant_user")
class MsspMembershipDeletePropertyTest {

    // -------------------------------------------------------------------------
    // Mocks and system-under-test — re-created fresh for every jqwik trial
    // -------------------------------------------------------------------------

    /** Repository for {@code ha_tenant_user} rows. */
    private HaTenantUserRepository memberships;

    /** Repository for {@code jhi_user} rows — must never be mutated by remove(). */
    private UserRepository users;

    /** Repository for {@code ha_client} rows — needed by MsspMembershipService ctor. */
    private HaClientRepository clients;

    /** Service under test (property 7A). */
    private MsspMembershipService service;

    /** Service mock injected into the controller (property 7B). */
    private MsspMembershipService membershipService;

    /** Standalone MockMvc wrapping the real controller (property 7B). */
    private MockMvc mockMvc;

    /**
     * Inline servlet filter that installs a static {@code MSSP_ADMIN} principal
     * before every request so the class-level {@code @PreAuthorize} annotation on
     * {@link MsspTenantUserController} does not reject the test request.
     */
    static final OncePerRequestFilter MSSP_ADMIN_FILTER = new OncePerRequestFilter() {
        @Override
        protected void doFilterInternal(HttpServletRequest req,
                                        HttpServletResponse resp,
                                        FilterChain chain)
                throws ServletException, IOException {
            SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                    "admin", null,
                    Collections.singletonList(new SimpleGrantedAuthority("MSSP_ADMIN"))));
            chain.doFilter(req, resp);
        }
    };

    /**
     * Rebuilds fresh Mockito mocks and constructs brand-new instances of the
     * service and controller before every jqwik trial. This ensures no stub
     * expectations or captured argument state leaks between iterations.
     */
    @BeforeTry
    void setUp() {
        // Property 7A: service-layer mocks
        memberships = mock(HaTenantUserRepository.class);
        users       = mock(UserRepository.class);
        clients     = mock(HaClientRepository.class);
        service     = new MsspMembershipService(clients, memberships, users);

        // Property 7B: controller-layer mocks with standalone MockMvc
        membershipService = mock(MsspMembershipService.class);
        MsspTenantUserController controller = new MsspTenantUserController(membershipService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .addFilter(MSSP_ADMIN_FILTER)
            .setControllerAdvice(new MsspProblemHandler())
            .build();
    }

    // =========================================================================
    // Arbitraries
    // =========================================================================

    /**
     * Generates positive {@code Long} tenant IDs in the range [1, Long.MAX_VALUE].
     * Negative IDs and zero are excluded because {@code ha_client.id} is a generated
     * primary key and is always positive.
     */
    @Provide
    Arbitrary<Long> validTenantIds() {
        return Arbitraries.longs().greaterOrEqual(1L);
    }

    /**
     * Generates positive {@code Long} user IDs in the range [1, Long.MAX_VALUE].
     * Negative IDs and zero are excluded because {@code jhi_user.id} is a generated
     * primary key and is always positive.
     */
    @Provide
    Arbitrary<Long> validUserIds() {
        return Arbitraries.longs().greaterOrEqual(1L);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Builds a minimal {@link HaTenantUser} with the given {@code clientId} and
     * {@code jhiUserId}. The {@code id} and {@code tenantRole} are set to arbitrary
     * but deterministic values that allow the service to identify the row.
     *
     * @param tenantId the {@code ha_client.id}
     * @param userId   the {@code jhi_user.id}
     * @return a populated but unpersisted {@link HaTenantUser} instance
     */
    private static HaTenantUser buildMembership(Long tenantId, Long userId) {
        HaTenantUser row = new HaTenantUser();
        row.setId(tenantId * 1000L + userId); // deterministic synthetic id
        row.setClientId(tenantId);
        row.setJhiUserId(userId);
        row.setTenantRole("ANALYST");
        return row;
    }

    // =========================================================================
    // Property 7A — Service layer: remove() mutates only ha_tenant_user
    // Validates: Requirements 14.5, 14.6
    // =========================================================================

    /**
     * **Validates: Requirements 14.5, 14.6**
     *
     * <p>For any positive {@code (tenantId, userId)} pair:
     * <ol>
     *   <li>The membership row is found via
     *       {@code memberships.findByClientIdAndJhiUserId(tenantId, userId)}.</li>
     *   <li>{@link MsspMembershipService#remove(Long, Long)} is invoked.</li>
     *   <li>{@code memberships.delete(row)} is called EXACTLY ONCE.</li>
     *   <li>NO mutating method on the {@code users} repository is ever called:
     *       {@code delete}, {@code deleteById}, {@code save}, {@code saveAll},
     *       {@code deleteAll}, {@code deleteAllById} are all verified NEVER.</li>
     * </ol>
     */
    @Property(tries = 100)
    @Label("Feature: sprint-23-mssp-portal, Property 7: DELETE /api/ha-mssp/tenants/{id}/users/{userId} mutates only ha_tenant_user")
    void property7_deleteOnlyMutatesHaTenantUser(
            @ForAll("validTenantIds") Long tenantId,
            @ForAll("validUserIds") Long userId) {

        // Arrange: the membership row exists
        HaTenantUser row = buildMembership(tenantId, userId);
        when(memberships.findByClientIdAndJhiUserId(tenantId, userId))
            .thenReturn(Optional.of(row));

        // Act
        service.remove(tenantId, userId);

        // Assert: exactly one delete on memberships
        verify(memberships, times(1)).delete(row);

        // Assert: ZERO mutating calls on users repo
        verify(users, never()).delete(any());
        verify(users, never()).deleteById(any());
        verify(users, never()).save(any());
        verify(users, never()).saveAll(any());
        verify(users, never()).deleteAll();
        verify(users, never()).deleteAllById(any());
    }

    // =========================================================================
    // Property 7B — Controller layer: DELETE returns 204 and delegates once
    // Validates: Requirements 14.5, 14.6
    // =========================================================================

    /**
     * **Validates: Requirements 14.5, 14.6**
     *
     * <p>For any positive {@code (tenantId, userId)} pair, the controller:
     * <ol>
     *   <li>Returns HTTP {@code 204 No Content}.</li>
     *   <li>Returns an empty response body (content-length 0).</li>
     *   <li>Delegates to {@link MsspMembershipService#remove(tenantId, userId)}
     *       EXACTLY ONCE.</li>
     * </ol>
     *
     * <p>The {@code membershipService} mock is a pure Mockito stub — no repository
     * or database is involved.
     */
    @Property(tries = 100)
    @Label("Feature: sprint-23-mssp-portal, Property 7: controller returns 204 and delegates delete")
    void property7_controllerReturns204AndDelegatesDelete(
            @ForAll("validTenantIds") Long tenantId,
            @ForAll("validUserIds") Long userId) throws Exception {

        doNothing().when(membershipService).remove(tenantId, userId);

        MvcResult result = mockMvc.perform(
            delete("/api/ha-mssp/tenants/{id}/users/{userId}", tenantId, userId))
            .andReturn();

        assertThat(result.getResponse().getStatus())
            .as("DELETE /api/ha-mssp/tenants/%d/users/%d should return 204 No Content",
                tenantId, userId)
            .isEqualTo(204);

        assertThat(result.getResponse().getContentLength())
            .as("DELETE response body must be empty (content-length 0)")
            .isEqualTo(0);

        verify(membershipService, times(1)).remove(tenantId, userId);
    }
}
