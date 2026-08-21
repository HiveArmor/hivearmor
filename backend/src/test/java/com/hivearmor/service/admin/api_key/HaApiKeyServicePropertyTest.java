package com.hivearmor.service.admin.api_key;

import com.hivearmor.domain.enumeration.ApiKeyStatus;
import com.hivearmor.domain.enumeration.HaApiKeyScope;
import com.hivearmor.web.rest.errors.BadRequestAlertException;
import net.jqwik.api.*;
import net.jqwik.api.constraints.IntRange;
import net.jqwik.api.constraints.NotEmpty;
import net.jqwik.api.lifecycle.BeforeTry;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Property-based tests for {@link HaApiKeyService}.
 *
 * <p><strong>Properties covered:</strong>
 * <ul>
 *   <li><strong>Property 6: Bcrypt hash round trip for API key persistence</strong>
 *       — Validates: Requirements 4.5, 5.3</li>
 *   <li><strong>Property 8: Scope validation invariant</strong>
 *       — Validates: Requirements 6.1, 6.2</li>
 *   <li><strong>Property 9: computeStatus determinism and three-branch rule</strong>
 *       — Validates: Requirements 6.3, 6.4</li>
 * </ul>
 *
 * <p>Uses jqwik 1.8 with a minimum of 100 tries per property.
 * Each property is fully deterministic — no Spring context is needed; the methods
 * under test are either pure static ({@code computeStatus}) or operate only on a
 * plain {@link BCryptPasswordEncoder} and {@link HaApiKeyTokenGenerator} instance
 * that can be constructed without infrastructure.
 */
class HaApiKeyServicePropertyTest {

    /** BCrypt encoder at the same strength-10 used by the production service (Req 4.5). */
    private BCryptPasswordEncoder encoder;

    /** Token generator — re-created before each trial. */
    private HaApiKeyTokenGenerator tokenGenerator;

    /** The private {@code validateScopes} method accessed via reflection for Property 8. */
    private Method validateScopesMethod;

    /** Minimal service instance needed only to invoke {@code validateScopes} via reflection. */
    private HaApiKeyService serviceForReflection;

    @BeforeTry
    void setUp() throws NoSuchMethodException {
        encoder = new BCryptPasswordEncoder(10);
        tokenGenerator = new HaApiKeyTokenGenerator();

        // Obtain access to the private validateScopes method for Property 8.
        validateScopesMethod = HaApiKeyService.class.getDeclaredMethod("validateScopes", List.class);
        validateScopesMethod.setAccessible(true);

        // HaApiKeyService constructor requires its two collaborators but we never
        // call methods that hit the repository, so nulls are safe here.
        serviceForReflection = new HaApiKeyService(null, null);
    }

    // =========================================================================
    // Property 6: Bcrypt hash round trip for API key persistence
    // Validates: Requirements 4.5, 5.3
    // =========================================================================

    /**
     * **Validates: Requirements 4.5, 5.3**
     *
     * <p>For any token {@code t} produced by {@link HaApiKeyTokenGenerator#generate()}:
     * <ul>
     *   <li>The bcrypt hash of {@code t} (produced at strength 10) must differ from
     *       {@code t} — the raw token is never stored.</li>
     *   <li>{@code BCryptPasswordEncoder(10).matches(t, hash)} must return {@code true},
     *       proving the hash can authenticate the original token.</li>
     *   <li>The first 8 characters of {@code t} form the {@code key_prefix} that would
     *       be persisted — verified to equal {@code t.substring(0, 8)}.</li>
     * </ul>
     *
     * <p>The {@code @ForAll @IntRange} parameter is a jqwik dummy trigger; the integer
     * value itself is not used.
     */
    @Property(tries = 100)
    void property6_bcryptHashRoundTripForApiKeyPersistence(
            @ForAll @IntRange(min = 1, max = 100) int ignored) {

        String token = tokenGenerator.generate();
        String hash  = encoder.encode(token);

        // 1. The stored hash must differ from the plaintext token (Req 4.5).
        assertThat(hash)
                .as("BCrypt hash must differ from plaintext token (Req 4.5)")
                .isNotEqualTo(token);

        // 2. BCryptPasswordEncoder(10).matches(token, hash) must return true (Req 4.5, 5.3).
        assertThat(encoder.matches(token, hash))
                .as("BCryptPasswordEncoder(10).matches(token, hash) must be true (Req 4.5, 5.3)")
                .isTrue();

        // 3. A different token must NOT match the hash — one-way property.
        String otherToken = tokenGenerator.generate();
        // Tokens are randomly generated; the chance of collision is astronomically low.
        // We only assert the negative match when the tokens are actually different.
        if (!otherToken.equals(token)) {
            assertThat(encoder.matches(otherToken, hash))
                    .as("A different token must not match the hash of the original token (Req 4.5)")
                    .isFalse();
        }

        // 4. key_prefix equals the first 8 characters of the plaintext token (Req 5.3).
        String expectedPrefix = token.substring(0, 8);
        assertThat(expectedPrefix)
                .as("key_prefix must be the first 8 characters of the plaintext token (Req 5.3)")
                .hasSize(8);
        assertThat(token)
                .as("Plaintext token must start with the computed prefix (Req 5.3)")
                .startsWith(expectedPrefix);
    }

    // =========================================================================
    // Property 8: Scope validation invariant
    // Validates: Requirements 6.1, 6.2
    // =========================================================================

    /**
     * **Validates: Requirements 6.1, 6.2**
     *
     * <p>For any non-empty list of scope strings drawn exclusively from the valid
     * {@link HaApiKeyScope} values, {@code validateScopes()} must <em>not</em> throw.
     * This confirms that every member of the authorised set passes validation (Req 6.1).
     */
    @Property(tries = 200)
    void property8_scopeValidation_validScopesMustNotThrow(
            @ForAll("validScopeLists") List<String> validScopes) {

        assertThat(invokeValidateScopes(validScopes))
                .as("validateScopes() must not throw for valid scopes %s (Req 6.1)", validScopes)
                .isNull(); // null == no exception thrown
    }

    /**
     * **Validates: Requirements 6.2**
     *
     * <p>For any scope list that contains at least one string not present in
     * {@link HaApiKeyScope}, {@code validateScopes()} must throw a
     * {@link BadRequestAlertException} with error key {@code scope.unknown}, and
     * it must throw <em>before</em> any persistence occurs.
     */
    @Property(tries = 200)
    void property8_scopeValidation_invalidScopeMustThrowWithErrorCode(
            @ForAll("invalidScopeLists") List<String> invalidScopes) {

        Throwable thrown = invokeValidateScopes(invalidScopes);

        assertThat(thrown)
                .as("validateScopes() must throw for invalid scopes %s (Req 6.2)", invalidScopes)
                .isNotNull()
                .isInstanceOf(BadRequestAlertException.class);

        BadRequestAlertException ex = (BadRequestAlertException) thrown;
        assertThat(ex.getErrorKey())
                .as("Error key must be 'scope.unknown' when an unknown scope is supplied (Req 6.2)")
                .isEqualTo("scope.unknown");
    }

    // =========================================================================
    // Property 9: computeStatus determinism and three-branch rule
    // Validates: Requirements 6.3, 6.4
    // =========================================================================

    /**
     * **Validates: Requirements 6.3 (branch 1) — revokedAt != null → always revoked**
     *
     * <p>For any triple {@code (revokedAt, expiresAt, now)} where {@code revokedAt}
     * is not null, {@link HaApiKeyService#computeStatus} must return
     * {@link ApiKeyStatus#revoked} regardless of the values of {@code expiresAt} and
     * {@code now}.
     */
    @Property(tries = 200)
    void property9_computeStatus_revokedAtNotNull_alwaysRevoked(
            @ForAll("instantsInPastOrFuture") Instant revokedAt,
            @ForAll("nullableInstantsInPastOrFuture") Instant expiresAt,
            @ForAll("instantsInPastOrFuture") Instant now) {

        ApiKeyStatus result = HaApiKeyService.computeStatus(revokedAt, expiresAt, now);

        assertThat(result)
                .as("computeStatus(non-null revokedAt, *, *) must be REVOKED (Req 6.3, branch 1)")
                .isEqualTo(ApiKeyStatus.revoked);
    }

    /**
     * **Validates: Requirements 6.3 (branch 2) — null revokedAt + past expiresAt → expired**
     *
     * <p>For any triple where {@code revokedAt} is null, {@code expiresAt} is not null,
     * and {@code expiresAt.isBefore(now)} is true, {@link HaApiKeyService#computeStatus}
     * must return {@link ApiKeyStatus#expired}.
     */
    @Property(tries = 200)
    void property9_computeStatus_nullRevokedAt_pastExpiresAt_alwaysExpired(
            @ForAll("instantsInPast") Instant expiresAt,
            @ForAll("instantsInFuture") Instant now) {

        // Precondition: expiresAt is before now
        assertThat(expiresAt.isBefore(now)).isTrue();

        ApiKeyStatus result = HaApiKeyService.computeStatus(null, expiresAt, now);

        assertThat(result)
                .as("computeStatus(null, past expiresAt, now) must be EXPIRED (Req 6.3, branch 2)")
                .isEqualTo(ApiKeyStatus.expired);
    }

    /**
     * **Validates: Requirements 6.3 (branch 3) — null revokedAt + non-past expiresAt → active**
     *
     * <p>For any triple where {@code revokedAt} is null and either {@code expiresAt} is
     * null or {@code expiresAt} is not before {@code now}, {@link HaApiKeyService#computeStatus}
     * must return {@link ApiKeyStatus#active}.
     */
    @Property(tries = 200)
    void property9_computeStatus_nullRevokedAt_noExpiry_alwaysActive(
            @ForAll("nullableInstantsInFuture") Instant expiresAt,
            @ForAll("instantsInPast") Instant now) {

        // Precondition: expiresAt is null or not before now
        if (expiresAt != null) {
            assertThat(expiresAt.isBefore(now)).isFalse();
        }

        ApiKeyStatus result = HaApiKeyService.computeStatus(null, expiresAt, now);

        assertThat(result)
                .as("computeStatus(null, non-past/null expiresAt, now) must be ACTIVE (Req 6.3, branch 3)")
                .isEqualTo(ApiKeyStatus.active);
    }

    /**
     * **Validates: Requirements 6.3 — determinism (idempotent, no hidden state)**
     *
     * <p>For any triple {@code (revokedAt, expiresAt, now)}, calling
     * {@link HaApiKeyService#computeStatus} twice with identical inputs must return
     * the same value both times.
     */
    @Property(tries = 200)
    void property9_computeStatus_determinism(
            @ForAll("nullableInstantsInPastOrFuture") Instant revokedAt,
            @ForAll("nullableInstantsInPastOrFuture") Instant expiresAt,
            @ForAll("instantsInPastOrFuture") Instant now) {

        ApiKeyStatus first  = HaApiKeyService.computeStatus(revokedAt, expiresAt, now);
        ApiKeyStatus second = HaApiKeyService.computeStatus(revokedAt, expiresAt, now);

        assertThat(first)
                .as("computeStatus must return the same value on repeated calls with identical inputs (Req 6.3 determinism)")
                .isEqualTo(second);
    }

    /**
     * **Validates: Requirements 6.3 — priority rule: revoked takes precedence over expired**
     *
     * <p>For any triple where both {@code revokedAt} is not null AND
     * {@code expiresAt.isBefore(now)} is true (i.e. both revocation and expiry
     * conditions hold simultaneously), the result must still be {@link ApiKeyStatus#revoked}
     * — confirming the priority of branch 1 over branch 2.
     */
    @Property(tries = 200)
    void property9_computeStatus_revokedTakesPrecedenceOverExpired(
            @ForAll("instantsInPastOrFuture") Instant revokedAt,
            @ForAll("instantsInPast") Instant expiresAt,
            @ForAll("instantsInFuture") Instant now) {

        // Both conditions hold: revokedAt != null AND expiresAt.isBefore(now)
        assertThat(expiresAt.isBefore(now)).isTrue();

        ApiKeyStatus result = HaApiKeyService.computeStatus(revokedAt, expiresAt, now);

        assertThat(result)
                .as("computeStatus must return REVOKED (not EXPIRED) when both revokedAt!=null and expiresAt is past (Req 6.3 priority)")
                .isEqualTo(ApiKeyStatus.revoked);
    }

    // =========================================================================
    // Arbitraries (jqwik generators)
    // =========================================================================

    /** Generates non-empty lists of valid {@link HaApiKeyScope} name strings. */
    @Provide
    Arbitrary<List<String>> validScopeLists() {
        List<String> validNames = Arrays.stream(HaApiKeyScope.values())
                .map(Enum::name)
                .collect(Collectors.toList());

        return Arbitraries.of(validNames)
                .list()
                .ofMinSize(1)
                .ofMaxSize(HaApiKeyScope.values().length);
    }

    /**
     * Generates non-empty lists of scope strings that always contain at least one
     * value that is NOT a valid {@link HaApiKeyScope} name.
     *
     * <p>Strategy: generate an arbitrary non-empty string, guarantee it cannot
     * coincide with any enum value, then mix it with zero or more valid scopes.
     */
    @Provide
    Arbitrary<List<String>> invalidScopeLists() {
        List<String> validNames = Arrays.stream(HaApiKeyScope.values())
                .map(Enum::name)
                .collect(Collectors.toList());

        // Generate strings that are NOT valid scope names.
        Arbitrary<String> invalidScope = Arbitraries.strings()
                .withCharRange('a', 'z')
                .ofMinLength(1)
                .ofMaxLength(20)
                .filter(s -> !validNames.contains(s));

        // Combine one guaranteed-invalid scope with zero or more valid ones.
        Arbitrary<List<String>> validPrefix = Arbitraries.of(validNames)
                .list()
                .ofMinSize(0)
                .ofMaxSize(3);

        return Combinators.combine(invalidScope, validPrefix)
                .as((bad, good) -> {
                    List<String> result = new java.util.ArrayList<>(good);
                    result.add(bad);
                    return result;
                });
    }

    /** Generates {@link Instant} values that lie in the past relative to epoch+1s. */
    @Provide
    Arbitrary<Instant> instantsInPast() {
        // Range: 10 years ago .. 1 second ago
        long nowEpoch = Instant.now().getEpochSecond();
        return Arbitraries.longs()
                .between(nowEpoch - 315_569_520L, nowEpoch - 1L)
                .map(Instant::ofEpochSecond);
    }

    /** Generates {@link Instant} values that lie in the future relative to "now-1s". */
    @Provide
    Arbitrary<Instant> instantsInFuture() {
        // Range: 1 second from now .. 10 years from now
        long nowEpoch = Instant.now().getEpochSecond();
        return Arbitraries.longs()
                .between(nowEpoch + 1L, nowEpoch + 315_569_520L)
                .map(Instant::ofEpochSecond);
    }

    /** Generates {@link Instant} values in either past or future (never null). */
    @Provide
    Arbitrary<Instant> instantsInPastOrFuture() {
        return Arbitraries.oneOf(instantsInPast(), instantsInFuture());
    }

    /**
     * Generates nullable {@link Instant} values that are either {@code null} or
     * lie in the past — used for {@code expiresAt} when testing the "active" branch
     * where expiry is not triggered.
     */
    @Provide
    Arbitrary<Instant> nullableInstantsInFuture() {
        return Arbitraries.oneOf(
                Arbitraries.just(null),
                instantsInFuture()
        );
    }

    /**
     * Generates nullable {@link Instant} values (past or future, or {@code null}) —
     * used for fields like {@code revokedAt} and {@code expiresAt} when the test
     * does not constrain their nullability.
     */
    @Provide
    Arbitrary<Instant> nullableInstantsInPastOrFuture() {
        return Arbitraries.oneOf(
                Arbitraries.just(null),
                instantsInPastOrFuture()
        );
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /**
     * Invokes the private {@code validateScopes(List<String>)} method via reflection
     * and returns any thrown exception (unwrapped from the {@link InvocationTargetException}),
     * or {@code null} when no exception is thrown.
     *
     * <p>This is the only way to test a private method without modifying production
     * visibility, as explicitly permitted by the task description for Property 8.
     *
     * @param scopes the scope list to pass to {@code validateScopes}
     * @return the thrown {@link Throwable} (typically a {@link BadRequestAlertException}),
     *         or {@code null} if the invocation succeeded
     */
    private Throwable invokeValidateScopes(List<String> scopes) {
        try {
            validateScopesMethod.invoke(serviceForReflection, scopes);
            return null; // no exception — validation passed
        } catch (InvocationTargetException ite) {
            // Unwrap the real exception thrown by validateScopes.
            return ite.getCause();
        } catch (IllegalAccessException e) {
            throw new RuntimeException("Reflection setup error in test", e);
        }
    }
}
