package com.hivearmor.security;

import com.hivearmor.domain.HaApiKey;
import com.hivearmor.repository.HaApiKeyRepository;
import com.hivearmor.service.admin.api_key.HaApiKeyTokenGenerator;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletResponse;
import net.jqwik.api.*;
import net.jqwik.api.constraints.IntRange;
import net.jqwik.api.lifecycle.BeforeTry;
import org.mockito.Mockito;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Property-based tests for {@link HaApiKeyAuthenticationFilter}.
 *
 * <p><strong>Property 10: Auth filter rejects revoked or expired keys</strong>
 * — Validates: Requirements 6.5
 *
 * <p>For any {@link HaApiKey} whose status is {@code revoked} (i.e.
 * {@code revokedAt != null}) or {@code expired} (i.e. {@code expiresAt} is in the
 * past), the filter must:
 * <ol>
 *   <li>Respond with HTTP 401 via {@code HttpServletResponse.sendError(401, ...)}.</li>
 *   <li>Never invoke {@code FilterChain.doFilter(...)} — the controller is never
 *       reached.</li>
 * </ol>
 *
 * <p><strong>Test strategy (alternative / simpler approach):</strong>
 * Because {@link HaApiKeyAuthenticationFilter} owns a
 * {@code private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(10)}
 * that cannot be injected or overridden, the test uses real tokens and real bcrypt
 * hashes rather than attempting to mock the encoder. Specifically, for each trial:
 * <ol>
 *   <li>Generate a real token via {@link HaApiKeyTokenGenerator#generate()}.</li>
 *   <li>Hash it with a {@code BCryptPasswordEncoder(10)} instance — matching the
 *       filter's internal encoder exactly.</li>
 *   <li>Build an {@link HaApiKey} entity with the real hash and set either
 *       {@code revokedAt} or {@code expiresAt} to mark the key as invalid.</li>
 *   <li>Mock {@link HaApiKeyRepository#findByKeyPrefix(String)} to return that
 *       entity.</li>
 *   <li>Issue a {@code MockHttpServletRequest} carrying the real token and assert
 *       that the filter calls {@code sendError(401)} and never advances the
 *       filter chain.</li>
 * </ol>
 *
 * <p>The bcrypt cost (strength 10) means individual trials are intentionally slow
 * (~80–120 ms each on modern hardware). {@code tries = 10} keeps the full suite
 * under 2 seconds for this property.
 *
 * <p>Uses jqwik 1.8 with Mockito (available via Spring Boot Test BOM).
 * No Spring context is needed.
 */
class HaApiKeyAuthenticationFilterPropertyTest {

    // =========================================================================
    // Test infrastructure — re-created before every jqwik trial
    // =========================================================================

    /** Token generator — produces real tokens in the format {@code ha_[A-Za-z0-9_-]{40}}. */
    private HaApiKeyTokenGenerator tokenGenerator;

    /**
     * BCrypt encoder at strength 10 — mirrors the {@code private final} encoder
     * inside {@link HaApiKeyAuthenticationFilter} exactly.
     */
    private BCryptPasswordEncoder encoder;

    /** Mock repository — re-created per trial to prevent state bleed. */
    private HaApiKeyRepository mockRepo;

    /**
     * System under test.
     * Instantiated directly — {@code @Component @RequiredArgsConstructor} means
     * {@code new HaApiKeyAuthenticationFilter(mockRepo)} is the correct constructor.
     */
    private HaApiKeyAuthenticationFilter filter;

    @BeforeTry
    void setUp() {
        tokenGenerator = new HaApiKeyTokenGenerator();
        encoder        = new BCryptPasswordEncoder(10);
        mockRepo       = Mockito.mock(HaApiKeyRepository.class);
        filter         = new HaApiKeyAuthenticationFilter(mockRepo);
    }

    // =========================================================================
    // Property 10 (branch A): revoked keys — revokedAt != null
    // Validates: Requirements 6.5
    // =========================================================================

    /**
     * **Validates: Requirements 6.5**
     *
     * <p>For any {@link HaApiKey} whose {@code revokedAt} field is not {@code null}
     * (regardless of {@code expiresAt}), the authentication filter must respond
     * HTTP 401 and must NOT continue the filter chain.
     *
     * <p>The {@code @IntRange} dummy parameter drives 10 independent jqwik trials.
     * BCrypt cost-10 is the primary bottleneck; 10 trials keep the property under
     * ~2 s while still exercising the property across varied token values.
     */
    @Property(tries = 10)
    void property10_revokedKey_filterRejects401_andDoesNotContinueChain(
            @ForAll @IntRange(min = 1, max = 10) int ignored) throws Exception {

        // 1 — Generate a real token and its bcrypt hash.
        String token = tokenGenerator.generate();
        String hash  = encoder.encode(token);

        // 2 — Build a revoked HaApiKey entity (revokedAt is non-null).
        HaApiKey revokedKey = buildKey(hash, token,
                Instant.now().minus(5, ChronoUnit.MINUTES),  // revokedAt = 5 min ago
                null);                                         // expiresAt = absent

        // 3 — Stub the repository to return this entity for the token's prefix.
        String prefix = token.substring(0, 8);
        Mockito.when(mockRepo.findByKeyPrefix(prefix)).thenReturn(Optional.of(revokedKey));

        // 4 — Execute the filter with a real-token Authorization header.
        MockHttpServletRequest  request  = buildRequest(token);
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain             chain    = Mockito.mock(FilterChain.class);

        filter.doFilterInternal(request, response, chain);

        // 5a — Filter must send HTTP 401.
        assertThat(response.getStatus())
                .as("Filter must respond with HTTP 401 for a revoked key (Req 6.5)")
                .isEqualTo(401);

        // 5b — Filter must NOT continue the filter chain.
        Mockito.verify(chain, Mockito.never())
               .doFilter(Mockito.any(), Mockito.any());
    }

    // =========================================================================
    // Property 10 (branch B): expired keys — expiresAt is in the past
    // Validates: Requirements 6.5
    // =========================================================================

    /**
     * **Validates: Requirements 6.5**
     *
     * <p>For any {@link HaApiKey} whose {@code expiresAt} field is in the past and
     * whose {@code revokedAt} field is {@code null}, the authentication filter must
     * respond HTTP 401 and must NOT continue the filter chain.
     */
    @Property(tries = 10)
    void property10_expiredKey_filterRejects401_andDoesNotContinueChain(
            @ForAll @IntRange(min = 1, max = 10) int ignored) throws Exception {

        // 1 — Generate a real token and its bcrypt hash.
        String token = tokenGenerator.generate();
        String hash  = encoder.encode(token);

        // 2 — Build an expired HaApiKey entity (expiresAt is in the past, revokedAt null).
        HaApiKey expiredKey = buildKey(hash, token,
                null,                                                            // revokedAt = absent
                Instant.now().minus(1, ChronoUnit.HOURS));                       // expiresAt = 1 hr ago

        // 3 — Stub the repository.
        String prefix = token.substring(0, 8);
        Mockito.when(mockRepo.findByKeyPrefix(prefix)).thenReturn(Optional.of(expiredKey));

        // 4 — Execute the filter.
        MockHttpServletRequest  request  = buildRequest(token);
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain             chain    = Mockito.mock(FilterChain.class);

        filter.doFilterInternal(request, response, chain);

        // 5a — Filter must send HTTP 401.
        assertThat(response.getStatus())
                .as("Filter must respond with HTTP 401 for an expired key (Req 6.5)")
                .isEqualTo(401);

        // 5b — Filter must NOT continue the filter chain.
        Mockito.verify(chain, Mockito.never())
               .doFilter(Mockito.any(), Mockito.any());
    }

    // =========================================================================
    // Property 10 (branch C): revoked AND expired simultaneously
    // Validates: Requirements 6.5 — revoked takes precedence
    // =========================================================================

    /**
     * **Validates: Requirements 6.5**
     *
     * <p>When a key has <em>both</em> {@code revokedAt != null} AND an expired
     * {@code expiresAt}, the filter must still respond HTTP 401 and must NOT
     * continue the filter chain. This confirms that the combined condition is
     * also handled correctly, consistent with the priority rule in
     * {@code computeStatus} (revoked takes precedence).
     */
    @Property(tries = 10)
    void property10_revokedAndExpiredKey_filterRejects401_andDoesNotContinueChain(
            @ForAll @IntRange(min = 1, max = 10) int ignored) throws Exception {

        // 1 — Generate a real token and its bcrypt hash.
        String token = tokenGenerator.generate();
        String hash  = encoder.encode(token);

        // 2 — Build a key that is BOTH revoked AND expired.
        HaApiKey bothKey = buildKey(hash, token,
                Instant.now().minus(10, ChronoUnit.MINUTES),  // revokedAt = 10 min ago
                Instant.now().minus(2, ChronoUnit.HOURS));     // expiresAt = 2 hr ago

        // 3 — Stub the repository.
        String prefix = token.substring(0, 8);
        Mockito.when(mockRepo.findByKeyPrefix(prefix)).thenReturn(Optional.of(bothKey));

        // 4 — Execute the filter.
        MockHttpServletRequest  request  = buildRequest(token);
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain             chain    = Mockito.mock(FilterChain.class);

        filter.doFilterInternal(request, response, chain);

        // 5a — Filter must send HTTP 401.
        assertThat(response.getStatus())
                .as("Filter must respond HTTP 401 when key is both revoked and expired (Req 6.5)")
                .isEqualTo(401);

        // 5b — Filter must NOT continue the filter chain.
        Mockito.verify(chain, Mockito.never())
               .doFilter(Mockito.any(), Mockito.any());
    }

    // =========================================================================
    // Control: active key must continue the chain (sanity / non-regression)
    // =========================================================================

    /**
     * Sanity check — ensures the filter does NOT reject an active key.
     *
     * <p>This is not part of Property 10 itself, but it guards against a
     * trivial implementation that always returns 401 (which would make Properties
     * 10A–C pass while being completely incorrect). An active key (no revocation,
     * no expiry) must let the chain continue.
     */
    @Property(tries = 5)
    void control_activeKey_filterContinuesChain(
            @ForAll @IntRange(min = 1, max = 5) int ignored) throws Exception {

        // 1 — Generate a real token and its bcrypt hash.
        String token = tokenGenerator.generate();
        String hash  = encoder.encode(token);

        // 2 — Build an active HaApiKey entity (both timestamp fields null).
        HaApiKey activeKey = buildKey(hash, token, null, null);

        // 3 — Stub the repository; also stub save() for updateLastUsedAt().
        String prefix = token.substring(0, 8);
        Mockito.when(mockRepo.findByKeyPrefix(prefix)).thenReturn(Optional.of(activeKey));
        Mockito.when(mockRepo.save(Mockito.any())).thenReturn(activeKey);

        // 4 — Execute the filter.
        MockHttpServletRequest  request  = buildRequest(token);
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain             chain    = Mockito.mock(FilterChain.class);

        filter.doFilterInternal(request, response, chain);

        // 5 — Active key: chain must be invoked exactly once, status must be 200 (default).
        Mockito.verify(chain, Mockito.times(1))
               .doFilter(Mockito.any(), Mockito.any());

        assertThat(response.getStatus())
                .as("Active key must not trigger a 401 response")
                .isEqualTo(HttpServletResponse.SC_OK);
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /**
     * Builds a minimal {@link HaApiKey} entity with the given bcrypt hash, token
     * prefix, and optional revocation / expiry timestamps.
     *
     * @param hash      the bcrypt hash of the plaintext token (strength 10)
     * @param token     the plaintext token — used to derive {@code keyPrefix}
     * @param revokedAt optional revocation timestamp; {@code null} = not revoked
     * @param expiresAt optional expiry timestamp; {@code null} = no expiry
     * @return a populated {@link HaApiKey} instance (not persisted)
     */
    private HaApiKey buildKey(String hash, String token, Instant revokedAt, Instant expiresAt) {
        HaApiKey key = new HaApiKey();
        key.setId(UUID.randomUUID());
        key.setName("test-key");
        key.setKeyHash(hash);
        key.setKeyPrefix(token.substring(0, 8));
        key.setScopes("read_alerts");
        key.setCreatedAt(Instant.now().minus(1, ChronoUnit.DAYS));
        key.setCreatedBy("test-admin");
        key.setRevokedAt(revokedAt);
        key.setExpiresAt(expiresAt);
        return key;
    }

    /**
     * Creates a {@link MockHttpServletRequest} with the {@code Authorization: ApiKey
     * <token>} header set, simulating a real API-key client request.
     *
     * @param token the plaintext API-key token to embed in the header
     * @return a configured mock request
     */
    private MockHttpServletRequest buildRequest(String token) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/ha-admin/api-keys");
        request.addHeader("Authorization", "ApiKey " + token);
        return request;
    }
}
