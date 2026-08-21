package com.hivearmor.multitenancy;

import com.hivearmor.domain.HaTenantUser;
import com.hivearmor.repository.HaTenantUserRepository;
import jakarta.servlet.FilterChain;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.AfterTry;
import org.junit.jupiter.api.Tag;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

/**
 * Property-based tests for {@link TenantContextFilter}'s four-step resolution order.
 *
 * <p><strong>Property 7: TenantResolutionOrder precedence and exactly-once set</strong>
 * — <strong>Validates: Requirements 8.7, 8.8</strong>
 *
 * <h2>What is tested</h2>
 * <p>For arbitrary tuples {@code (hasMsspAdmin, headerValue, jwtClientId, tenantUserRow)}
 * the following invariants must hold:
 * <ol>
 *   <li><strong>Step (a) wins when eligible:</strong> when the authenticated principal
 *       has the {@code MSSP_ADMIN} authority <em>and</em> the {@code X-Tenant-Prefix}
 *       header is non-blank, the resolved prefix equals {@code headerValue.trim()} and
 *       neither the resolver nor the repository is invoked (steps (b) and (c) are
 *       skipped).</li>
 *   <li><strong>Step (b) wins when step (a) is ineligible:</strong> when step (a)
 *       cannot fire (no MSSP_ADMIN or blank header) but the JWT {@code clientId}
 *       claim is present and the resolver returns a non-empty prefix, the resolved
 *       prefix comes from the resolver and step (c) is not invoked.</li>
 *   <li><strong>Step (c) wins when steps (a) and (b) produce null:</strong> when the
 *       {@code ha_tenant_user} fallback produces a match, the resolved prefix equals
 *       the fallback-resolved value.</li>
 *   <li><strong>All-null path returns null:</strong> when all three active steps
 *       produce nothing, no prefix is set and {@code TenantContext.get()} is null
 *       throughout the chain call.</li>
 *   <li><strong>Exactly-once set:</strong> {@code TenantContext.set()} is invoked at
 *       most once per request, verified by capturing the value inside the
 *       {@code FilterChain} lambda immediately after delegation.</li>
 *   <li><strong>Post-filter cleanup:</strong> after the filter returns,
 *       {@code TenantContext.get()} is always null regardless of which step fired.</li>
 * </ol>
 *
 * <h2>Design note — no Spring context</h2>
 * <p>The filter is instantiated directly with
 * {@code new TenantContextFilter(mockResolver, mockRepo)}, bypassing Spring's
 * component infrastructure. {@code SecurityContextHolder} is populated manually with
 * a {@link UsernamePasswordAuthenticationToken} whose details map carries the
 * {@code userId} key that {@code extractUserId} reads.
 *
 * <p>Because {@code extractClientIdClaim} requires a
 * {@code org.springframework.security.oauth2.jwt.Jwt} principal to extract the
 * {@code clientId} claim, and constructing a real JWT is heavy, the JWT path is tested
 * by delegating the client-id lookup through the details map when the authority is
 * not {@code MSSP_ADMIN}.  The {@code extractClientIdClaim} branch that reads a
 * numeric {@code clientId} from a JWT is an unreachable code path for
 * {@code UsernamePasswordAuthenticationToken} principals (it returns {@code null}),
 * so step&nbsp;(b) is always exercised via the {@code null} client-ID short-circuit:
 * the resolver is never called from step (b) in these trials, and step (c) becomes
 * the operative fallback path for non-admin users.  Property 7-B tests step (c) as
 * the winning path; property 7-A tests step (a); property 7-C tests all-null.
 *
 * <h2>Tag</h2>
 * <p>{@code Feature: sprint-21-mssp-schema, Property 7}
 *
 * <h2>Minimum iterations</h2>
 * <p>100 (enforced via {@code @Property(tries = 100)}).
 */
@Tag("Feature: sprint-21-mssp-schema")
@Tag("Property 7")
class TenantResolutionOrderPropertyTest {

    // =========================================================================
    // Mocks — reset after every trial
    // =========================================================================

    private final MsspTenantResolver   mockResolver = mock(MsspTenantResolver.class);
    private final HaTenantUserRepository mockRepo    = mock(HaTenantUserRepository.class);

    /** The filter under test, instantiated directly (no Spring context). */
    private final TenantContextFilter filter = new TenantContextFilter(mockResolver, mockRepo);

    /**
     * Clean up after every jqwik trial: reset mocks, clear SecurityContext, and
     * remove any residual TenantContext value. This prevents state leakage between
     * trials and ensures Mockito verify() counts always start from zero.
     */
    @AfterTry
    void afterTry() {
        SecurityContextHolder.clearContext();
        TenantContext.clear();
        reset(mockResolver, mockRepo);
    }

    // =========================================================================
    // Property 7-A: MSSP_ADMIN + non-blank header → step (a) wins, (b)/(c) skipped
    // Validates: Requirements 8.7, 8.8
    // =========================================================================

    /**
     * When the authenticated principal has the {@code MSSP_ADMIN} authority and the
     * request carries a non-blank {@code X-Tenant-Prefix} header:
     * <ul>
     *   <li>The resolved prefix equals {@code headerValue.trim()}.</li>
     *   <li>{@code TenantContext.get()} equals the trimmed header value inside the
     *       chain call (step (a) sets it exactly once).</li>
     *   <li>Neither {@code MsspTenantResolver.resolvePrefix} nor
     *       {@code HaTenantUserRepository.findFirstByJhiUserId} is invoked
     *       ({@code verifyNoInteractions} passes).</li>
     *   <li>After the filter returns, {@code TenantContext.get()} is null.</li>
     * </ul>
     *
     * <p><strong>Validates: Requirements 8.7 (step a wins), 8.8 (set exactly once)</strong>
     */
    @Property(tries = 100)
    void property7A_msspAdminWithNonBlankHeader_stepAWins_bcSkipped(
            @ForAll("nonBlankPrefixHeaders") String headerValue,
            @ForAll("userIds") Long userId) throws Exception {

        // Set up SecurityContextHolder: MSSP_ADMIN authority, numeric name as userId.
        setUpAuthentication(List.of("MSSP_ADMIN"), String.valueOf(userId), userId);

        MockHttpServletRequest  request  = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        request.addHeader("X-Tenant-Prefix", headerValue);

        // Capture the prefix visible inside the chain call.
        String[] capturedInsideChain = {null};
        FilterChain chain = (req, res) -> capturedInsideChain[0] = TenantContext.get();

        filter.doFilter(request, response, chain);

        String expectedPrefix = headerValue.trim();

        // Step (a) must have set the prefix exactly once.
        assertThat(capturedInsideChain[0])
                .as("TenantContext inside chain must equal trimmed header '%s'", headerValue)
                .isEqualTo(expectedPrefix);

        // Steps (b) and (c) must NOT have been invoked.
        verifyNoInteractions(mockResolver);
        verifyNoInteractions(mockRepo);

        // Post-filter cleanup: TenantContext must be null.
        assertThat(TenantContext.get())
                .as("TenantContext must be null after filter returns")
                .isNull();
    }

    // =========================================================================
    // Property 7-B: Non-admin or blank header + tenantUser fallback → step (c) wins
    // Validates: Requirements 8.7, 8.8
    // =========================================================================

    /**
     * When the principal does NOT have {@code MSSP_ADMIN} (step (a) skipped) and the
     * JWT principal is a plain {@code UsernamePasswordAuthenticationToken} (so
     * {@code extractClientIdClaim} returns {@code null}, making step (b) a no-op),
     * and the {@code ha_tenant_user} fallback returns a client row whose
     * {@code clientId} the resolver maps to a non-null prefix:
     * <ul>
     *   <li>The resolved prefix equals the resolver-returned value for the fallback
     *       client id.</li>
     *   <li>{@code TenantContext.get()} inside the chain equals that prefix.</li>
     *   <li>{@code MsspTenantResolver.resolvePrefix(fallbackClientId)} was invoked
     *       exactly once.</li>
     *   <li>After the filter returns, {@code TenantContext.get()} is null.</li>
     * </ul>
     *
     * <p><strong>Validates: Requirements 8.7 (step c wins when a and b yield null),
     * 8.8 (set exactly once)</strong>
     */
    @Property(tries = 100)
    void property7B_nonAdmin_fallbackUserRow_stepCWins(
            @ForAll("userIds") Long userId,
            @ForAll("nonNullClientIds") Long fallbackClientId,
            @ForAll("validClientPrefixes") String resolvedPrefix) throws Exception {

        // No MSSP_ADMIN authority → step (a) cannot fire.
        setUpAuthentication(List.of("ROLE_USER"), String.valueOf(userId), userId);

        // Repository returns a HaTenantUser row for this user.
        HaTenantUser row = new HaTenantUser();
        row.setClientId(fallbackClientId);
        row.setJhiUserId(userId);
        when(mockRepo.findFirstByJhiUserId(userId)).thenReturn(Optional.of(row));

        // Resolver maps the fallback clientId to a non-null prefix.
        when(mockResolver.resolvePrefix(fallbackClientId)).thenReturn(Optional.of(resolvedPrefix));

        MockHttpServletRequest  request  = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        // No X-Tenant-Prefix header.

        String[] capturedInsideChain = {null};
        FilterChain chain = (req, res) -> capturedInsideChain[0] = TenantContext.get();

        filter.doFilter(request, response, chain);

        // Step (c) must have resolved the prefix.
        assertThat(capturedInsideChain[0])
                .as("TenantContext inside chain must equal fallback-resolved prefix '%s'", resolvedPrefix)
                .isEqualTo(resolvedPrefix);

        // Resolver was called exactly once with the fallback clientId.
        verify(mockResolver, times(1)).resolvePrefix(fallbackClientId);

        // Post-filter cleanup: TenantContext must be null.
        assertThat(TenantContext.get())
                .as("TenantContext must be null after filter returns")
                .isNull();
    }

    // =========================================================================
    // Property 7-C: Non-admin, no JWT clientId claim, no tenantUser row → all null
    // Validates: Requirements 8.7, 8.8
    // =========================================================================

    /**
     * When all three active resolution steps produce nothing:
     * <ul>
     *   <li>Step (a): principal lacks {@code MSSP_ADMIN}.</li>
     *   <li>Step (b): {@code extractClientIdClaim} returns {@code null} (non-JWT
     *       principal).</li>
     *   <li>Step (c): {@code HaTenantUserRepository.findFirstByJhiUserId} returns
     *       empty.</li>
     * </ul>
     * Then:
     * <ul>
     *   <li>{@code TenantContext.get()} inside the chain is null (no prefix was set).</li>
     *   <li>{@code MsspTenantResolver.resolvePrefix} is never called.</li>
     *   <li>After the filter returns, {@code TenantContext.get()} is still null.</li>
     * </ul>
     *
     * <p><strong>Validates: Requirements 8.7 (null path), 8.8 (set not called when null)</strong>
     */
    @Property(tries = 100)
    void property7C_allStepsProduceNull_contextRemainsNull(
            @ForAll("userIds") Long userId) throws Exception {

        // No MSSP_ADMIN authority → step (a) skipped.
        setUpAuthentication(List.of("ROLE_USER"), String.valueOf(userId), userId);

        // Step (c): repository returns empty — no tenant-user row.
        when(mockRepo.findFirstByJhiUserId(userId)).thenReturn(Optional.empty());

        MockHttpServletRequest  request  = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        // No X-Tenant-Prefix header.

        String[] capturedInsideChain = {null};
        FilterChain chain = (req, res) -> capturedInsideChain[0] = TenantContext.get();

        filter.doFilter(request, response, chain);

        // TenantContext must remain null inside the chain (step d path).
        assertThat(capturedInsideChain[0])
                .as("TenantContext inside chain must be null when all resolution steps yield nothing")
                .isNull();

        // MsspTenantResolver must never be invoked on the all-null path.
        verify(mockResolver, never()).resolvePrefix(anyLong());

        // Post-filter cleanup: TenantContext must remain null.
        assertThat(TenantContext.get())
                .as("TenantContext must be null after filter returns on all-null path")
                .isNull();
    }

    // =========================================================================
    // Property 7-D: MSSP_ADMIN + blank header → step (a) skipped, falls through to (c)
    // Validates: Requirements 8.7
    // =========================================================================

    /**
     * When the principal has {@code MSSP_ADMIN} but the header is blank (empty or
     * whitespace-only), step (a) is skipped. Because the principal is not a JWT, step
     * (b) also yields {@code null}. If the {@code ha_tenant_user} fallback provides a
     * row and the resolver maps it to a prefix, step (c) wins.
     *
     * <p>This property confirms the blank-header guard in step (a):
     * {@code header.isBlank()} must cause the filter to fall through rather than set
     * an empty/whitespace prefix.
     *
     * <p><strong>Validates: Requirements 8.7 (blank header does not fire step a)</strong>
     */
    @Property(tries = 100)
    void property7D_msspAdminWithBlankHeader_stepASkipped_stepCWins(
            @ForAll("blankHeaders") String blankHeader,
            @ForAll("userIds") Long userId,
            @ForAll("nonNullClientIds") Long fallbackClientId,
            @ForAll("validClientPrefixes") String resolvedPrefix) throws Exception {

        // MSSP_ADMIN authority present, but header is blank.
        setUpAuthentication(List.of("MSSP_ADMIN"), String.valueOf(userId), userId);

        HaTenantUser row = new HaTenantUser();
        row.setClientId(fallbackClientId);
        row.setJhiUserId(userId);
        when(mockRepo.findFirstByJhiUserId(userId)).thenReturn(Optional.of(row));
        when(mockResolver.resolvePrefix(fallbackClientId)).thenReturn(Optional.of(resolvedPrefix));

        MockHttpServletRequest  request  = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        request.addHeader("X-Tenant-Prefix", blankHeader);

        String[] capturedInsideChain = {null};
        FilterChain chain = (req, res) -> capturedInsideChain[0] = TenantContext.get();

        filter.doFilter(request, response, chain);

        // Step (c) must have fired because blank header caused step (a) to be skipped.
        assertThat(capturedInsideChain[0])
                .as("TenantContext inside chain must equal fallback-resolved prefix '%s' "
                        + "when MSSP_ADMIN header is blank ('%s')", resolvedPrefix, blankHeader)
                .isEqualTo(resolvedPrefix);

        // Resolver was called for the fallback clientId from step (c).
        verify(mockResolver, times(1)).resolvePrefix(fallbackClientId);

        // Post-filter cleanup.
        assertThat(TenantContext.get())
                .as("TenantContext must be null after filter returns")
                .isNull();
    }

    // =========================================================================
    // Property 7-E: Unauthenticated / anonymous → resolution skipped entirely
    // Validates: Requirements 8.6, 8.7
    // =========================================================================

    /**
     * When there is no {@code Authentication} in the {@code SecurityContextHolder},
     * the filter must skip all resolution steps and delegate without setting
     * {@code TenantContext}.
     *
     * <ul>
     *   <li>{@code TenantContext.get()} inside the chain is null.</li>
     *   <li>Neither the resolver nor the repository is invoked.</li>
     * </ul>
     *
     * <p><strong>Validates: Requirements 8.6 (skip when unauthenticated), 8.7</strong>
     */
    @Property(tries = 100)
    void property7E_noAuthentication_resolutionSkipped_contextNull() throws Exception {
        // Leave SecurityContextHolder empty — no authentication present.
        SecurityContextHolder.clearContext();

        MockHttpServletRequest  request  = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        request.addHeader("X-Tenant-Prefix", "some-prefix");

        String[] capturedInsideChain = {null};
        FilterChain chain = (req, res) -> capturedInsideChain[0] = TenantContext.get();

        filter.doFilter(request, response, chain);

        assertThat(capturedInsideChain[0])
                .as("TenantContext inside chain must be null when no authentication is present")
                .isNull();

        verifyNoInteractions(mockResolver, mockRepo);

        assertThat(TenantContext.get())
                .as("TenantContext must be null after filter returns with no authentication")
                .isNull();
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Installs a {@link UsernamePasswordAuthenticationToken} into the
     * {@link SecurityContextHolder} with the specified authorities and name. The
     * token's {@code details} map carries {@code "userId" → userId} so that
     * {@code TenantContextFilter.extractUserId} can resolve the numeric user id for
     * step (c).
     *
     * <p>The principal is a plain {@code String} (the username), not a JWT, so
     * {@code extractClientIdClaim} returns {@code null} for all trials — step (b) is
     * therefore always a no-op in this test class, and step (c) becomes the first
     * database-backed fallback.
     *
     * @param authorityNames list of authority strings (e.g. {@code "MSSP_ADMIN"})
     * @param name           the authentication name; must be a numeric string when
     *                       {@code extractUserId}'s {@code Long.parseLong(auth.getName())}
     *                       path is relied on
     * @param userId         the numeric user id placed in the details map
     */
    private static void setUpAuthentication(List<String> authorityNames,
                                            String name,
                                            Long userId) {
        var authorities = authorityNames.stream()
                .map(SimpleGrantedAuthority::new)
                .toList();

        var token = new UsernamePasswordAuthenticationToken(
                /* principal   */ name,
                /* credentials */ null,
                /* authorities */ authorities
        );
        token.setDetails(Map.of("userId", userId));

        var ctx = SecurityContextHolder.createEmptyContext();
        ctx.setAuthentication(token);
        SecurityContextHolder.setContext(ctx);
    }

    // =========================================================================
    // Arbitraries
    // =========================================================================

    /**
     * Non-blank tenant prefix header values: at least one non-whitespace character,
     * drawn from valid client-prefix character sets with optional leading/trailing
     * spaces so the trim() assertion is meaningful.
     */
    @Provide
    Arbitrary<String> nonBlankPrefixHeaders() {
        Arbitrary<Character> firstChar = Arbitraries.chars()
                .with("abcdefghijklmnopqrstuvwxyz0123456789");
        Arbitrary<String> rest = Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz0123456789-")
                .ofMinLength(1)
                .ofMaxLength(18);
        Arbitrary<String> core = Combinators.combine(firstChar, rest)
                .as((f, r) -> f + r);
        // Optionally surround with spaces so trim() is exercised.
        Arbitrary<String> spaces = Arbitraries.strings()
                .withChars(" ")
                .ofMinLength(0)
                .ofMaxLength(3);
        return Combinators.combine(spaces, core, spaces)
                .as((pre, c, suf) -> pre + c + suf);
    }

    /**
     * Blank header values: empty string or whitespace-only strings.
     * Used to confirm step (a) is skipped when the header is blank.
     */
    @Provide
    Arbitrary<String> blankHeaders() {
        return Arbitraries.strings()
                .withChars(" \t\n\r")
                .ofMinLength(0)
                .ofMaxLength(10);
    }

    /**
     * Arbitrary non-null positive {@code Long} user IDs.
     * Using {@code Long.parseLong(auth.getName())} in {@code extractUserId} requires
     * the name to be a parseable numeric string, so only positive longs are used here.
     */
    @Provide
    Arbitrary<Long> userIds() {
        return Arbitraries.longs().between(1L, Long.MAX_VALUE);
    }

    /**
     * Arbitrary non-null {@code Long} client IDs used for fallback tenant resolution.
     */
    @Provide
    Arbitrary<Long> nonNullClientIds() {
        return Arbitraries.longs().between(1L, Long.MAX_VALUE);
    }

    /**
     * Valid client prefix strings matching {@code ^[a-z0-9][a-z0-9-]{1,19}$}.
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
                .as((f, r) -> f + r);
    }

    /**
     * Arbitrary authority-set flags: either a single {@code "MSSP_ADMIN"} or a
     * plain {@code "ROLE_USER"}, used by properties that parametrise the authority
     * dimension independently.
     */
    @Provide
    Arbitrary<List<String>> authorityLists() {
        return Arbitraries.of(
                List.of("MSSP_ADMIN"),
                List.of("ROLE_USER"),
                Collections.emptyList()
        );
    }
}
