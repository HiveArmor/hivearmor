package com.hivearmor.multitenancy;

import com.hivearmor.domain.HaTenantUser;
import com.hivearmor.repository.HaTenantUserRepository;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Example integration tests for {@link TenantContextFilter}.
 *
 * <p>The full Spring Boot context is not loaded. Instead, the filter is instantiated
 * directly with mocked collaborators and exercised by calling
 * {@link TenantContextFilter#doFilter} with Spring's {@link MockHttpServletRequest},
 * {@link MockHttpServletResponse}, and a capturing {@link FilterChain} lambda.
 *
 * <p>Each test case:
 * <ol>
 *   <li>Configures {@link SecurityContextHolder} with the appropriate
 *       {@link org.springframework.security.core.Authentication}.</li>
 *   <li>Builds a {@link MockHttpServletRequest} with the relevant headers.</li>
 *   <li>Runs a capturing {@link FilterChain} that records {@link TenantContext#get()} at
 *       the point the downstream chain would execute.</li>
 *   <li>Calls {@link TenantContextFilter#doFilter} directly.</li>
 *   <li>Asserts the captured value and — after the filter returns — that
 *       {@link TenantContext#get()} is {@code null} on the current thread.</li>
 * </ol>
 *
 * <p>Note: this project uses {@code jjwt} for JWT tokens, not Spring Security OAuth2
 * resource-server. The principal set by {@link com.hivearmor.security.jwt.JWTFilter} is
 * a {@link org.springframework.security.core.userdetails.User} with a plain-string
 * credential (the raw compact JWT). The {@code extractClientIdClaim} method in
 * {@link TenantContextFilter} attempts to parse the credential as a JWT to read
 * a {@code clientId} claim; in tests that don't provide a real signed token, step (b)
 * will always produce {@code null} and the fallback step (c) is what exercises the
 * {@link HaTenantUserRepository} path.
 *
 * <p>Requirements satisfied: 8.4, 8.6, 8.7, 8.8
 */
class TenantContextFilterTest {

    // -------------------------------------------------------------------------
    // Collaborators (mocked)
    // -------------------------------------------------------------------------

    private final MsspTenantResolver mockResolver = mock(MsspTenantResolver.class);
    private final HaTenantUserRepository mockRepo = mock(HaTenantUserRepository.class);

    /** Filter under test — instantiated directly, no Spring proxy. */
    private final TenantContextFilter filter = new TenantContextFilter(mockResolver, mockRepo);

    // -------------------------------------------------------------------------
    // Cleanup — always clear SecurityContextHolder and TenantContext
    // -------------------------------------------------------------------------

    @AfterEach
    void cleanup() {
        SecurityContextHolder.clearContext();
        TenantContext.clear();
    }

    // =========================================================================
    // Step (a): MSSP admin + X-Tenant-Prefix header → TenantContext == "acme"
    // =========================================================================

    @Test
    @DisplayName("Step (a): MSSP_ADMIN with X-Tenant-Prefix header sets TenantContext to the header value")
    void stepA_msspAdminWithHeader_setsTenantContext() throws Exception {
        UsernamePasswordAuthenticationToken adminAuth = new UsernamePasswordAuthenticationToken(
                "admin-user",
                null,
                List.of(new SimpleGrantedAuthority("MSSP_ADMIN"))
        );
        SecurityContextHolder.getContext().setAuthentication(adminAuth);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Tenant-Prefix", "acme");
        MockHttpServletResponse response = new MockHttpServletResponse();

        AtomicReference<String> captured = new AtomicReference<>();
        FilterChain chain = (req, res) -> captured.set(TenantContext.get());

        filter.doFilter(request, response, chain);

        assertThat(captured.get())
                .as("TenantContext inside filter chain (step a) must equal the header value")
                .isEqualTo("acme");

        assertThat(TenantContext.get())
                .as("TenantContext must be null after doFilter returns (finally block)")
                .isNull();

        // MsspTenantResolver must NOT be consulted; step (a) short-circuits before it
        verify(mockResolver, never()).resolvePrefix(any());
    }

    @Test
    @DisplayName("Step (a): X-Tenant-Prefix header value is trimmed before being set in TenantContext")
    void stepA_headerValueIsTrimmed() throws Exception {
        UsernamePasswordAuthenticationToken adminAuth = new UsernamePasswordAuthenticationToken(
                "admin-user",
                null,
                List.of(new SimpleGrantedAuthority("MSSP_ADMIN"))
        );
        SecurityContextHolder.getContext().setAuthentication(adminAuth);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Tenant-Prefix", "  acme  ");
        MockHttpServletResponse response = new MockHttpServletResponse();

        AtomicReference<String> captured = new AtomicReference<>();
        FilterChain chain = (req, res) -> captured.set(TenantContext.get());

        filter.doFilter(request, response, chain);

        assertThat(captured.get())
                .as("X-Tenant-Prefix header must be trimmed before setting TenantContext")
                .isEqualTo("acme");

        assertThat(TenantContext.get())
                .as("TenantContext must be null after filter returns")
                .isNull();
    }

    // =========================================================================
    // Step (b) + step (c) fallthrough: plain-credential auth, userId in details map
    // =========================================================================

    /**
     * In this project the JWT principal is a {@code User} whose credentials are the
     * raw compact token string. {@code extractClientIdClaim} will return {@code null}
     * for any non-JWT credential, so step (b) is a no-op and step (c) via
     * {@link HaTenantUserRepository#findFirstByJhiUserId} is the operative DB-backed
     * resolution step.
     *
     * <p>This test verifies step (c) resolution when the {@code userId} is placed
     * in the details map (the path used by {@code extractUserId}).
     */
    @Test
    @DisplayName("Step (c): non-admin user with userId in details resolves prefix via HaTenantUserRepository")
    void stepC_nonAdmin_userIdInDetails_resolvesViaRepo() throws Exception {
        UsernamePasswordAuthenticationToken userAuth = new UsernamePasswordAuthenticationToken(
                "user-login",
                null,
                List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );
        userAuth.setDetails(Map.of("userId", 42L));
        SecurityContextHolder.getContext().setAuthentication(userAuth);

        HaTenantUser tenantUser = new HaTenantUser();
        tenantUser.setClientId(10L);
        tenantUser.setJhiUserId(42L);
        when(mockRepo.findFirstByJhiUserId(42L)).thenReturn(Optional.of(tenantUser));
        when(mockResolver.resolvePrefix(10L)).thenReturn(Optional.of("delta"));

        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        AtomicReference<String> captured = new AtomicReference<>();
        FilterChain chain = (req, res) -> captured.set(TenantContext.get());

        filter.doFilter(request, response, chain);

        assertThat(captured.get())
                .as("TenantContext (step c) must equal the prefix resolved from HaTenantUserRepository")
                .isEqualTo("delta");

        assertThat(TenantContext.get())
                .as("TenantContext must be null after filter returns")
                .isNull();

        verify(mockRepo, times(1)).findFirstByJhiUserId(42L);
        verify(mockResolver, times(1)).resolvePrefix(10L);
    }

    @Test
    @DisplayName("Step (c): non-admin numeric-name user resolves prefix via HaTenantUserRepository")
    void stepC_noJwtClaim_numericName_fallbackViaRepo() throws Exception {
        // getName() returns "42" (numeric) — extractUserId parses it via Long.parseLong
        UsernamePasswordAuthenticationToken userAuth = new UsernamePasswordAuthenticationToken(
                "42",
                null,
                List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );
        SecurityContextHolder.getContext().setAuthentication(userAuth);

        HaTenantUser tenantUser = new HaTenantUser();
        tenantUser.setClientId(10L);
        tenantUser.setJhiUserId(42L);
        when(mockRepo.findFirstByJhiUserId(42L)).thenReturn(Optional.of(tenantUser));
        when(mockResolver.resolvePrefix(10L)).thenReturn(Optional.of("delta"));

        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        AtomicReference<String> captured = new AtomicReference<>();
        FilterChain chain = (req, res) -> captured.set(TenantContext.get());

        filter.doFilter(request, response, chain);

        assertThat(captured.get())
                .as("TenantContext (step c) must equal the prefix resolved from HaTenantUserRepository")
                .isEqualTo("delta");

        assertThat(TenantContext.get())
                .as("TenantContext must be null after filter returns")
                .isNull();

        verify(mockRepo, times(1)).findFirstByJhiUserId(42L);
        verify(mockResolver, times(1)).resolvePrefix(10L);
    }

    @Test
    @DisplayName("Step (c): when HaTenantUserRepository returns empty, TenantContext stays null")
    void stepC_repoReturnsEmpty_tenantContextRemainsNull() throws Exception {
        UsernamePasswordAuthenticationToken userAuth = new UsernamePasswordAuthenticationToken(
                "99",
                null,
                List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );
        SecurityContextHolder.getContext().setAuthentication(userAuth);

        when(mockRepo.findFirstByJhiUserId(99L)).thenReturn(Optional.empty());

        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        AtomicReference<String> captured = new AtomicReference<>();
        FilterChain chain = (req, res) -> captured.set(TenantContext.get());

        filter.doFilter(request, response, chain);

        // Falls all the way to step (d) — null prefix — TenantContext.set() not called
        assertThat(captured.get())
                .as("TenantContext must be null when all resolution steps fail")
                .isNull();

        assertThat(TenantContext.get()).isNull();

        verify(mockRepo, times(1)).findFirstByJhiUserId(99L);
        // resolver must NOT be called — no clientId was obtained
        verify(mockResolver, never()).resolvePrefix(any());
    }

    // =========================================================================
    // Step (d): unauthenticated request → TenantContext == null, resolver NOT invoked
    // =========================================================================

    @Test
    @DisplayName("Step (d): unauthenticated request keeps TenantContext null and does not invoke MsspTenantResolver")
    void stepD_unauthenticatedRequest_tenantContextNullResolverNotInvoked() throws Exception {
        SecurityContextHolder.clearContext();

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Tenant-Prefix", "should-be-ignored");
        MockHttpServletResponse response = new MockHttpServletResponse();

        AtomicReference<String> captured = new AtomicReference<>();
        FilterChain chain = (req, res) -> captured.set(TenantContext.get());

        filter.doFilter(request, response, chain);

        assertThat(captured.get())
                .as("TenantContext must be null for unauthenticated requests")
                .isNull();

        assertThat(TenantContext.get())
                .as("TenantContext must be null after filter returns")
                .isNull();

        verify(mockResolver, never()).resolvePrefix(any());
        verify(mockRepo, never()).findFirstByJhiUserId(any());
    }

    @Test
    @DisplayName("Step (d): request with isAuthenticated()==false keeps TenantContext null")
    void stepD_notAuthenticatedFlag_tenantContextNull() throws Exception {
        // UsernamePasswordAuthenticationToken with no authorities — isAuthenticated() == false
        UsernamePasswordAuthenticationToken unauthenticated =
                new UsernamePasswordAuthenticationToken("someUser", null);
        SecurityContextHolder.getContext().setAuthentication(unauthenticated);

        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        AtomicReference<String> captured = new AtomicReference<>();
        FilterChain chain = (req, res) -> captured.set(TenantContext.get());

        filter.doFilter(request, response, chain);

        assertThat(captured.get())
                .as("TenantContext must be null when auth.isAuthenticated() == false")
                .isNull();

        assertThat(TenantContext.get()).isNull();

        verify(mockResolver, never()).resolvePrefix(any());
        verify(mockRepo, never()).findFirstByJhiUserId(any());
    }

    @Test
    @DisplayName("Step (d): anonymous principal keeps TenantContext null")
    void stepD_anonymousPrincipal_tenantContextNull() throws Exception {
        // Anonymous user: principal is the literal string "anonymousUser"
        UsernamePasswordAuthenticationToken anonymousAuth = new UsernamePasswordAuthenticationToken(
                "anonymousUser",
                null,
                List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS"))
        );
        SecurityContextHolder.getContext().setAuthentication(anonymousAuth);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Tenant-Prefix", "should-be-ignored");
        MockHttpServletResponse response = new MockHttpServletResponse();

        AtomicReference<String> captured = new AtomicReference<>();
        FilterChain chain = (req, res) -> captured.set(TenantContext.get());

        filter.doFilter(request, response, chain);

        assertThat(captured.get())
                .as("Anonymous principal must produce null TenantContext")
                .isNull();

        assertThat(TenantContext.get()).isNull();

        verify(mockResolver, never()).resolvePrefix(any());
        verify(mockRepo, never()).findFirstByJhiUserId(any());
    }

    // =========================================================================
    // Cleanup guarantee: TenantContext cleared even when downstream chain throws
    // =========================================================================

    @Test
    @DisplayName("finally block clears TenantContext even when the downstream filter chain throws")
    void finallyBlock_clearsTenantContext_evenWhenChainThrows() throws Exception {
        UsernamePasswordAuthenticationToken adminAuth = new UsernamePasswordAuthenticationToken(
                "admin-user",
                null,
                List.of(new SimpleGrantedAuthority("MSSP_ADMIN"))
        );
        SecurityContextHolder.getContext().setAuthentication(adminAuth);

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Tenant-Prefix", "echo");
        MockHttpServletResponse response = new MockHttpServletResponse();

        FilterChain throwingChain = (req, res) -> {
            throw new jakarta.servlet.ServletException("simulated downstream error");
        };

        try {
            filter.doFilter(request, response, throwingChain);
        } catch (jakarta.servlet.ServletException expected) {
            // exception propagates out of the filter as expected
        }

        assertThat(TenantContext.get())
                .as("TenantContext must be cleared by the finally block even when the chain throws")
                .isNull();
    }
}
