package com.hivearmor.multitenancy;

import com.hivearmor.domain.User;
import com.hivearmor.repository.HaTenantUserRepository;
import com.hivearmor.repository.UserRepository;
import com.hivearmor.security.jwt.TokenProvider;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class TenantContextFilterSecurityTest {

    private final MsspTenantResolver resolver = mock(MsspTenantResolver.class);
    private final HaTenantUserRepository memberships = mock(HaTenantUserRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final TokenProvider tokens = mock(TokenProvider.class);
    private final TenantContextFilter filter = new TenantContextFilter(resolver, memberships, users, tokens);

    @AfterEach
    void cleanUp() {
        SecurityContextHolder.clearContext();
        TenantContext.clear();
    }

    @Test
    void unauthorizedTenantHeaderFailsClosed() throws Exception {
        authenticate("analyst", "ROLE_ANALYST");
        User user = user(9L, "analyst");
        when(users.findOneByLogin("analyst")).thenReturn(Optional.of(user));
        when(memberships.existsByClientIdAndJhiUserId(44L, 9L)).thenReturn(false);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(requestForTenant("44"), response, (req, res) -> { throw new AssertionError("chain must not run"); });

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentType()).startsWith("application/problem+json");
        assertThat(response.getContentAsString()).contains("tenant-scope-denied");
        assertThat(TenantContext.getClientId()).isNull();
        verify(resolver, never()).resolvePrefix(44L);
    }

    @Test
    void unknownTenantForMsspAdminReturnsNotFoundWithoutErrorRedispatch() throws Exception {
        // MSSP_ADMIN is the cross-tenant operator authority, so it passes the authz
        // gate and reaches tenant resolution (which then 404s for an unknown tenant).
        authenticate("mssp-admin", "MSSP_ADMIN");
        when(resolver.resolvePrefix(404L)).thenReturn(Optional.empty());
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(requestForTenant("404"), response,
            (req, res) -> { throw new AssertionError("chain must not run"); });

        assertThat(response.getStatus()).isEqualTo(404);
        assertThat(response.getContentType()).startsWith("application/problem+json");
        assertThat(response.getContentAsString())
            .contains("tenant-scope-not-found")
            .doesNotContain("Authentication Required");
    }

    @Test
    void plainAdminSelectingNonMemberTenantIsDeniedNotImplicitCrossTenant() throws Exception {
        // P0A1-T15 — ADMIN is NOT an implicit cross-tenant escape. A platform
        // ROLE_ADMIN with no ha_tenant_user membership for the requested tenant is
        // denied (403) BEFORE any tenant resolution — it cannot silently reach another
        // tenant's data the way MSSP_ADMIN can.
        authenticate("admin", "ROLE_ADMIN");
        User user = user(7L, "admin");
        when(users.findOneByLogin("admin")).thenReturn(Optional.of(user));
        when(memberships.existsByClientIdAndJhiUserId(44L, 7L)).thenReturn(false);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(requestForTenant("44"), response,
            (req, res) -> { throw new AssertionError("chain must not run"); });

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentType()).startsWith("application/problem+json");
        assertThat(response.getContentAsString()).contains("tenant-scope-denied");
        assertThat(TenantContext.getClientId()).isNull();
        verify(resolver, never()).resolvePrefix(44L);
    }

    @Test
    void plainAdminSelectingOwnMemberTenantIsAllowed() throws Exception {
        // P0A1-T15 — a platform ROLE_ADMIN that IS a member of the tenant resolves
        // normally (this is how a single-tenant admin's own tenant resolves).
        authenticate("admin", "ROLE_ADMIN");
        User user = user(7L, "admin");
        when(users.findOneByLogin("admin")).thenReturn(Optional.of(user));
        when(memberships.existsByClientIdAndJhiUserId(44L, 7L)).thenReturn(true);
        when(resolver.resolvePrefix(44L)).thenReturn(Optional.of("finance"));
        AtomicReference<Long> observedId = new AtomicReference<>();

        filter.doFilter(requestForTenant("44"), new MockHttpServletResponse(),
            (req, res) -> observedId.set(TenantContext.getClientId()));

        assertThat(observedId.get()).isEqualTo(44L);
        assertThat(TenantContext.getClientId()).isNull();
    }

    @Test
    void authorizedTenantSetsBothIdAndPrefixAndAlwaysClearsThem() throws Exception {
        authenticate("analyst", "ROLE_ANALYST");
        User user = user(9L, "analyst");
        when(users.findOneByLogin("analyst")).thenReturn(Optional.of(user));
        when(memberships.existsByClientIdAndJhiUserId(44L, 9L)).thenReturn(true);
        when(resolver.resolvePrefix(44L)).thenReturn(Optional.of("finance"));
        AtomicReference<Long> observedId = new AtomicReference<>();
        AtomicReference<String> observedPrefix = new AtomicReference<>();

        filter.doFilter(requestForTenant("44"), new MockHttpServletResponse(), (req, res) -> {
            observedId.set(TenantContext.getClientId());
            observedPrefix.set(TenantContext.getClientPrefix());
        });

        assertThat(observedId.get()).isEqualTo(44L);
        assertThat(observedPrefix.get()).isEqualTo("finance");
        assertThat(TenantContext.getClientId()).isNull();
        assertThat(TenantContext.getClientPrefix()).isNull();
    }

    @Test
    void invalidTenantHeaderReturnsBadRequestWithoutGlobalFallback() throws Exception {
        authenticate("analyst", "ROLE_ANALYST");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(requestForTenant("finance"), response, (req, res) -> { throw new AssertionError("chain must not run"); });

        assertThat(response.getStatus()).isEqualTo(400);
        assertThat(response.getContentType()).startsWith("application/problem+json");
        assertThat(response.getContentAsString()).contains("invalid-tenant-scope");
        verifyNoInteractions(resolver, memberships, users);
    }

    private MockHttpServletRequest requestForTenant(String tenantId) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/ha-alerts");
        request.addHeader("X-Tenant-ID", tenantId);
        return request;
    }

    private void authenticate(String login, String role) {
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken(login, "", List.of(new SimpleGrantedAuthority(role))));
    }

    private User user(Long id, String login) {
        User user = new User();
        user.setId(id);
        user.setLogin(login);
        return user;
    }
}
