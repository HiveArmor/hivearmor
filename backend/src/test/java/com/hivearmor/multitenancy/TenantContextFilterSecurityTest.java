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
    void unknownTenantForAdministratorReturnsNotFoundWithoutErrorRedispatch() throws Exception {
        authenticate("admin", "ROLE_ADMIN");
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
