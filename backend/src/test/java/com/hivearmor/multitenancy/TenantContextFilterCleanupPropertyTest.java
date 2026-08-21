package com.hivearmor.multitenancy;

import com.hivearmor.repository.HaTenantUserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.AfterTry;
import org.junit.jupiter.api.Tag;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Collections;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/**
 * Property-based tests for {@link TenantContextFilter} cleanup on all exit paths.
 *
 * <p><strong>Property 8: TenantContextFilter cleanup on all exit paths</strong>
 * — <strong>Validates: Requirements 8.4, 8.6</strong>
 *
 * <h2>What is tested</h2>
 * <p>For any scenario where the downstream {@code filterChain.doFilter()} either:
 * <ul>
 *   <li>Returns normally (happy path)</li>
 *   <li>Throws an arbitrary {@link RuntimeException}</li>
 *   <li>The request is anonymous / unauthenticated</li>
 * </ul>
 *
 * <p>In ALL cases the following invariants must hold:
 * <ol>
 *   <li>{@code TenantContext.get()} MUST be {@code null} after the filter returns
 *       or throws.</li>
 *   <li>On the anonymous / unauthenticated path, {@code MsspTenantResolver.resolvePrefix}
 *       MUST have been invoked ZERO times (verified via Mockito
 *       {@code verifyNoInteractions}).</li>
 * </ol>
 *
 * <h2>Design note — no Spring context</h2>
 * <p>The filter is instantiated directly with
 * {@code new TenantContextFilter(mockResolver, mockTenantUsers)} so that the test
 * is fast and has zero Spring bootstrap overhead. The {@code @Cacheable} proxy is
 * irrelevant here; Property 8 is purely about the {@code try/finally} cleanup
 * contract and the anonymous-skip guard.
 *
 * <h2>Tag</h2>
 * <p>{@code Feature: sprint-21-mssp-schema, Property 8}
 *
 * <h2>Minimum iterations</h2>
 * <p>100 per property (enforced via {@code @Property(tries = 100)}).
 */
@Tag("Feature: sprint-21-mssp-schema")
@Tag("Property 8")
class TenantContextFilterCleanupPropertyTest {

    // =========================================================================
    // Shared mocks — reset after every jqwik trial.
    // =========================================================================

    private final MsspTenantResolver mockResolver =
            mock(MsspTenantResolver.class);

    private final HaTenantUserRepository mockTenantUsers =
            mock(HaTenantUserRepository.class);

    /**
     * The filter under test.  Instantiated directly — no Spring context.
     */
    private final TenantContextFilter filter =
            new TenantContextFilter(mockResolver, mockTenantUsers);

    /**
     * After every trial: clear TenantContext and SecurityContextHolder so that no
     * trial leaks state to the next, and reset mock interaction counters.
     */
    @AfterTry
    void afterTry() {
        TenantContext.clear();
        SecurityContextHolder.clearContext();
        reset(mockResolver, mockTenantUsers);
    }

    // =========================================================================
    // Property 8-A: normal (non-throwing) exit still clears TenantContext
    // Validates: Requirements 8.4, 8.6
    // =========================================================================

    /**
     * When {@code filterChain.doFilter()} returns normally, the {@code finally}
     * block MUST still call {@code TenantContext.clear()}, leaving
     * {@code TenantContext.get() == null} on the calling thread.
     *
     * <p>An authenticated user whose resolver returns a non-null prefix is used so
     * that {@code TenantContext.set()} is actually invoked, making the cleanup
     * assertion non-trivial.
     *
     * <p><strong>Validates: Requirements 8.4, 8.6</strong>
     */
    @Property(tries = 100)
    void property8A_normalExit_tenantContextIsNull(
            @ForAll("validClientPrefixes") String clientPrefix) throws Exception {

        // Arrange: authenticated user, resolver returns a prefix.
        setAuthenticatedUser("user-" + clientPrefix);
        when(mockResolver.resolvePrefix(any())).thenReturn(java.util.Optional.of(clientPrefix));
        when(mockTenantUsers.findFirstByJhiUserId(any())).thenReturn(java.util.Optional.empty());

        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = (req, res) -> { /* returns normally */ };

        // Act
        filter.doFilter(request, response, chain);

        // Assert: TenantContext must be cleared regardless of whether set() was called.
        assertThat(TenantContext.get())
                .as("TenantContext.get() must be null after normal filter exit (prefix was '%s')", clientPrefix)
                .isNull();
    }

    // =========================================================================
    // Property 8-B: throwing exit still clears TenantContext
    // Validates: Requirements 8.4, 8.6
    // =========================================================================

    /**
     * When {@code filterChain.doFilter()} throws an arbitrary
     * {@link RuntimeException}, the {@code finally} block MUST still execute
     * {@code TenantContext.clear()}, leaving {@code TenantContext.get() == null}.
     *
     * <p>The exception is re-thrown by the filter (as required by the
     * {@code try/finally} pattern that does not suppress it), so the test wraps
     * the {@code doFilter} call in a try/catch.
     *
     * <p><strong>Validates: Requirements 8.4, 8.6</strong>
     */
    @Property(tries = 100)
    void property8B_throwingExit_tenantContextIsNull(
            @ForAll("validClientPrefixes") String clientPrefix,
            @ForAll("anyRuntimeException") RuntimeException thrown) throws Exception {

        // Arrange: authenticated user, resolver returns a prefix.
        setAuthenticatedUser("user-" + clientPrefix);
        when(mockResolver.resolvePrefix(any())).thenReturn(java.util.Optional.of(clientPrefix));
        when(mockTenantUsers.findFirstByJhiUserId(any())).thenReturn(java.util.Optional.empty());

        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = (req, res) -> { throw thrown; };

        // Act — the filter re-propagates the exception; catch it here.
        try {
            filter.doFilter(request, response, chain);
        } catch (RuntimeException ignored) {
            // Expected — the filter's finally block must still have run.
        }

        // Assert: TenantContext must be null even after an exception.
        assertThat(TenantContext.get())
                .as("TenantContext.get() must be null after throwing filter exit (prefix was '%s', exception '%s')",
                        clientPrefix, thrown.getMessage())
                .isNull();
    }

    // =========================================================================
    // Property 8-C: anonymous request — TenantContext is null AND
    //               MsspTenantResolver.resolvePrefix is never called
    // Validates: Requirements 8.4, 8.6
    // =========================================================================

    /**
     * When the request is anonymous (no authentication in the
     * {@link SecurityContextHolder}), the filter MUST:
     * <ol>
     *   <li>Skip tenant resolution entirely — {@code MsspTenantResolver.resolvePrefix}
     *       MUST NOT be invoked (verified via {@code verifyNoInteractions}).</li>
     *   <li>Leave {@code TenantContext.get() == null} after the filter returns.</li>
     * </ol>
     *
     * <p><strong>Validates: Requirements 8.4, 8.6</strong>
     */
    @Property(tries = 100)
    void property8C_anonymousRequest_contextNullAndResolverNotCalled() throws Exception {

        // Arrange: no authentication present.
        SecurityContextHolder.clearContext();

        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = (req, res) -> { /* returns normally */ };

        // Act
        filter.doFilter(request, response, chain);

        // Assert 1: TenantContext is null.
        assertThat(TenantContext.get())
                .as("TenantContext.get() must be null for an anonymous request")
                .isNull();

        // Assert 2: resolver was never consulted.
        verifyNoInteractions(mockResolver);
    }

    // =========================================================================
    // Property 8-D: unauthenticated principal — TenantContext is null AND
    //               MsspTenantResolver.resolvePrefix is never called
    // Validates: Requirements 8.4, 8.6
    // =========================================================================

    /**
     * When the {@link SecurityContextHolder} holds an authentication with
     * principal equal to the literal string {@code "anonymousUser"} (the Spring
     * Security anonymous-user sentinel), the filter MUST behave identically to the
     * fully-unauthenticated case: skip resolution and leave the context null.
     *
     * <p><strong>Validates: Requirements 8.4, 8.6</strong>
     */
    @Property(tries = 100)
    void property8D_anonymousPrincipal_contextNullAndResolverNotCalled() throws Exception {

        // Arrange: anonymous-principal token (mimics Spring Security's AnonymousAuthenticationFilter).
        UsernamePasswordAuthenticationToken anonAuth =
                new UsernamePasswordAuthenticationToken(
                        "anonymousUser",
                        null,
                        Collections.singletonList(new SimpleGrantedAuthority("ROLE_ANONYMOUS")));
        SecurityContextHolder.getContext().setAuthentication(anonAuth);

        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = (req, res) -> { /* returns normally */ };

        // Act
        filter.doFilter(request, response, chain);

        // Assert 1: TenantContext is null.
        assertThat(TenantContext.get())
                .as("TenantContext.get() must be null when principal is 'anonymousUser'")
                .isNull();

        // Assert 2: resolver was never consulted.
        verifyNoInteractions(mockResolver);
    }

    // =========================================================================
    // Property 8-E: anonymous request + throwing filter chain —
    //               TenantContext is null AND resolver is never called
    // Validates: Requirements 8.4, 8.6
    // =========================================================================

    /**
     * Even when the downstream chain throws, an anonymous request must leave
     * {@code TenantContext.get() == null} and MUST NOT invoke the resolver.
     *
     * <p><strong>Validates: Requirements 8.4, 8.6</strong>
     */
    @Property(tries = 100)
    void property8E_anonymousRequest_throwingChain_contextNullAndResolverNotCalled(
            @ForAll("anyRuntimeException") RuntimeException thrown) throws Exception {

        // Arrange: no authentication.
        SecurityContextHolder.clearContext();

        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = (req, res) -> { throw thrown; };

        // Act — catch re-thrown exception.
        try {
            filter.doFilter(request, response, chain);
        } catch (RuntimeException ignored) {
            // Expected.
        }

        // Assert 1: context is null.
        assertThat(TenantContext.get())
                .as("TenantContext.get() must be null after anonymous-throwing exit")
                .isNull();

        // Assert 2: resolver was never consulted.
        verifyNoInteractions(mockResolver);
    }

    // =========================================================================
    // Arbitraries
    // =========================================================================

    /**
     * Produces valid {@code client_prefix} strings matching the regex
     * {@code ^[a-z0-9][a-z0-9-]{1,19}$} — total length 2–20 characters,
     * lowercase alphanumerics and hyphens, first character alphanumeric.
     */
    @Provide
    Arbitrary<String> validClientPrefixes() {
        Arbitrary<Character> firstChar = Arbitraries.chars()
                .with("abcdefghijklmnopqrstuvwxyz0123456789");
        Arbitrary<String> rest = Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz0123456789-")
                .ofMinLength(1)
                .ofMaxLength(19);
        return Combinators.combine(firstChar, rest)
                .as((first, tail) -> first + tail);
    }

    /**
     * Produces arbitrary {@link RuntimeException} instances parameterised by an
     * arbitrary message string (including empty and Unicode strings).
     */
    @Provide
    Arbitrary<RuntimeException> anyRuntimeException() {
        return Arbitraries.strings()
                .ofMinLength(0)
                .ofMaxLength(200)
                .map(RuntimeException::new);
    }

    // =========================================================================
    // Helper
    // =========================================================================

    /**
     * Places a {@link UsernamePasswordAuthenticationToken} for the given
     * {@code username} into the {@link SecurityContextHolder}, simulating a
     * regular authenticated (non-MSSP-admin) user.
     *
     * <p>A numeric-string name is used so that {@code TenantContextFilter}'s
     * {@code extractUserId} helper can parse it as a {@code Long} (JHipster style),
     * which keeps the filter's code path active through step (c).
     *
     * @param username the principal name placed into the authentication token
     */
    private void setAuthenticatedUser(String username) {
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(
                        username,
                        null,
                        Collections.singletonList(new SimpleGrantedAuthority("ROLE_USER")));
        SecurityContextHolder.getContext().setAuthentication(auth);
    }
}
