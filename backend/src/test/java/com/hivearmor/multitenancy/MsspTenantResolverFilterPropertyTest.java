package com.hivearmor.multitenancy;

import com.hivearmor.domain.HaClient;
import com.hivearmor.repository.HaClientRepository;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.AfterTry;
import org.junit.jupiter.api.Tag;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Property-based tests for the domain-filter logic inside
 * {@link MsspTenantResolver#resolvePrefix(Long)}.
 *
 * <p><strong>Property 6: MsspTenantResolver domain filter</strong>
 * — <strong>Validates: Requirements 7.4</strong>
 *
 * <h2>What is tested</h2>
 * <p>The resolver's core DB-filter logic: for an arbitrary {@link HaClient} row
 * varying {@code msspManaged} and {@code clientPrefix}, and for an arbitrary
 * {@code clientId} (including {@code null}), the following invariant must hold:
 *
 * <ul>
 *   <li>{@code resolvePrefix(clientId)} returns {@code Optional.of(clientPrefix)}
 *       <em>iff</em> {@code msspManaged == true} AND {@code clientPrefix != null}.</li>
 *   <li>{@code resolvePrefix(clientId)} returns {@code Optional.empty()} in every
 *       other case:
 *       <ul>
 *         <li>{@code clientId == null} — guard clause returns empty immediately</li>
 *         <li>Repository returns {@code Optional.empty()} (client not found)</li>
 *         <li>{@code msspManaged == false}, regardless of {@code clientPrefix}</li>
 *         <li>{@code msspManaged == true} but {@code clientPrefix == null}</li>
 *       </ul>
 *   </li>
 * </ul>
 *
 * <h2>Design note — bypassing the Spring cache proxy</h2>
 * <p>The resolver is instantiated directly with {@code new MsspTenantResolver(mockRepo)}
 * rather than being obtained from a Spring application context. This intentionally
 * bypasses the {@code @Cacheable} AOP proxy, which means
 * {@code HaClientRepository.findById(clientId)} is called on <em>every</em>
 * invocation. The Caffeine cache is irrelevant to this property; the property is
 * purely about the domain filter predicate
 * {@code filter(HaClient::isMsspManaged).map(HaClient::getClientPrefix)}.
 *
 * <h2>Tag</h2>
 * <p>{@code Feature: sprint-21-mssp-schema, Property 6}
 *
 * <h2>Minimum iterations</h2>
 * <p>100 per property (enforced via {@code @Property(tries = 100)}).
 */
@Tag("Feature: sprint-21-mssp-schema")
@Tag("Property 6")
class MsspTenantResolverFilterPropertyTest {

    // =========================================================================
    // Shared mock — recreated fresh for each jqwik trial via @AfterTry reset.
    // =========================================================================

    /**
     * Mocked repository. Configured per trial inside each property method.
     * Mockito is used directly (no Spring context); this keeps the test fast and
     * focused on pure domain logic.
     */
    private final HaClientRepository mockRepo = mock(HaClientRepository.class);

    /**
     * The resolver under test — instantiated directly to bypass the
     * {@code @Cacheable} Spring AOP proxy.
     */
    private final MsspTenantResolver resolver = new MsspTenantResolver(mockRepo);

    /**
     * Resets the mock interactions after every jqwik trial so that
     * {@code verify()} counts start from zero in the next trial.
     */
    @AfterTry
    void afterTry() {
        reset(mockRepo);
    }

    // =========================================================================
    // Property 6-A: resolvePrefix returns Optional.of(prefix) iff
    //   msspManaged == true AND clientPrefix != null
    // Validates: Requirements 7.4
    // =========================================================================

    /**
     * For any non-null {@code clientId}, when the repository returns an
     * {@link HaClient} with {@code msspManaged == true} and a non-null
     * {@code clientPrefix}, {@code resolvePrefix(clientId)} must return
     * {@code Optional.of(clientPrefix)}.
     *
     * <p><strong>Validates: Requirements 7.4</strong>
     */
    @Property(tries = 100)
    void property6A_msspManagedTrueAndNonNullPrefix_returnsOptionalOfPrefix(
            @ForAll("nonNullClientIds") Long clientId,
            @ForAll("validClientPrefixes") String clientPrefix) {

        HaClient client = buildClient(clientId, true, clientPrefix);
        when(mockRepo.findById(clientId)).thenReturn(Optional.of(client));

        Optional<String> result = resolver.resolvePrefix(clientId);

        assertThat(result)
                .as("resolvePrefix(%d) must return Optional.of('%s') when msspManaged=true and clientPrefix is non-null",
                        clientId, clientPrefix)
                .isPresent()
                .contains(clientPrefix);

        verify(mockRepo, times(1)).findById(clientId);
    }

    // =========================================================================
    // Property 6-B: resolvePrefix returns Optional.empty() when
    //   msspManaged == false (regardless of clientPrefix value)
    // Validates: Requirements 7.4
    // =========================================================================

    /**
     * For any non-null {@code clientId} and any {@code clientPrefix} value
     * (including {@code null}), when the repository returns an {@link HaClient}
     * with {@code msspManaged == false}, {@code resolvePrefix(clientId)} must
     * return {@code Optional.empty()}.
     *
     * <p><strong>Validates: Requirements 7.4</strong>
     */
    @Property(tries = 100)
    void property6B_msspManagedFalse_returnsEmpty_regardlessOfPrefix(
            @ForAll("nonNullClientIds") Long clientId,
            @ForAll("optionalClientPrefixes") String clientPrefix) {

        HaClient client = buildClient(clientId, false, clientPrefix);
        when(mockRepo.findById(clientId)).thenReturn(Optional.of(client));

        Optional<String> result = resolver.resolvePrefix(clientId);

        assertThat(result)
                .as("resolvePrefix(%d) must return Optional.empty() when msspManaged=false (clientPrefix='%s')",
                        clientId, clientPrefix)
                .isEmpty();

        verify(mockRepo, times(1)).findById(clientId);
    }

    // =========================================================================
    // Property 6-C: resolvePrefix returns Optional.empty() when
    //   msspManaged == true but clientPrefix == null
    // Validates: Requirements 7.4
    // =========================================================================

    /**
     * For any non-null {@code clientId}, when the repository returns an
     * {@link HaClient} with {@code msspManaged == true} but
     * {@code clientPrefix == null}, {@code resolvePrefix(clientId)} must return
     * {@code Optional.empty()}.
     *
     * <p>This case exercises the {@code .map(HaClient::getClientPrefix)} step in
     * the chain: an MSSP-managed client without an allocated prefix maps to an
     * absent {@code Optional}.
     *
     * <p><strong>Validates: Requirements 7.4</strong>
     */
    @Property(tries = 100)
    void property6C_msspManagedTrueButNullPrefix_returnsEmpty(
            @ForAll("nonNullClientIds") Long clientId) {

        HaClient client = buildClient(clientId, true, null);
        when(mockRepo.findById(clientId)).thenReturn(Optional.of(client));

        Optional<String> result = resolver.resolvePrefix(clientId);

        assertThat(result)
                .as("resolvePrefix(%d) must return Optional.empty() when msspManaged=true but clientPrefix is null",
                        clientId)
                .isEmpty();

        verify(mockRepo, times(1)).findById(clientId);
    }

    // =========================================================================
    // Property 6-D: resolvePrefix returns Optional.empty() when clientId == null
    //   (guard clause — repository must NOT be called)
    // Validates: Requirements 7.4
    // =========================================================================

    /**
     * When {@code clientId} is {@code null}, {@code resolvePrefix(null)} must
     * return {@code Optional.empty()} immediately, without consulting the
     * repository.
     *
     * <p>This is the guard-clause path at the top of
     * {@code MsspTenantResolver.resolvePrefix}: {@code if (clientId == null) return Optional.empty()}.
     *
     * <p><strong>Validates: Requirements 7.4</strong>
     */
    @Property(tries = 100)
    void property6D_nullClientId_returnsEmpty_withoutCallingRepo(
            @ForAll("msspManagedFlags") boolean msspManaged,
            @ForAll("optionalClientPrefixes") String clientPrefix) {

        // No repository stub needed — the guard clause must prevent any DB call.
        Optional<String> result = resolver.resolvePrefix(null);

        assertThat(result)
                .as("resolvePrefix(null) must return Optional.empty() without querying the repository")
                .isEmpty();

        // The repository must never be called when clientId is null.
        verify(mockRepo, never()).findById(any());
    }

    // =========================================================================
    // Property 6-E: resolvePrefix returns Optional.empty() when client is not found
    //   (repository returns Optional.empty())
    // Validates: Requirements 7.4
    // =========================================================================

    /**
     * For any non-null {@code clientId}, when the repository returns
     * {@code Optional.empty()} (the client row does not exist),
     * {@code resolvePrefix(clientId)} must return {@code Optional.empty()}.
     *
     * <p><strong>Validates: Requirements 7.4</strong>
     */
    @Property(tries = 100)
    void property6E_clientNotFound_returnsEmpty(
            @ForAll("nonNullClientIds") Long clientId) {

        when(mockRepo.findById(clientId)).thenReturn(Optional.empty());

        Optional<String> result = resolver.resolvePrefix(clientId);

        assertThat(result)
                .as("resolvePrefix(%d) must return Optional.empty() when the repository returns empty (client not found)",
                        clientId)
                .isEmpty();

        verify(mockRepo, times(1)).findById(clientId);
    }

    // =========================================================================
    // Arbitraries
    // =========================================================================

    /**
     * Produces non-null {@code Long} client IDs covering positive, negative, and
     * boundary values. {@code null} is excluded because it is tested separately in
     * property 6-D.
     */
    @Provide
    Arbitrary<Long> nonNullClientIds() {
        return Arbitraries.longs()
                .between(Long.MIN_VALUE, Long.MAX_VALUE)
                .filter(id -> id != null);
    }

    /**
     * Produces valid {@code client_prefix} strings matching the regex
     * {@code ^[a-z0-9][a-z0-9-]{1,19}$} — total length 2–20 characters,
     * lowercase alphanumerics and hyphens, first character alphanumeric.
     *
     * <p>These are non-null by construction, suitable for testing the happy path.
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
     * Produces either a valid {@code client_prefix} string or {@code null}.
     * Used in properties that need to exercise both non-null and null prefix paths.
     */
    @Provide
    Arbitrary<String> optionalClientPrefixes() {
        Arbitrary<Character> firstChar = Arbitraries.chars()
                .with("abcdefghijklmnopqrstuvwxyz0123456789");

        Arbitrary<String> rest = Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz0123456789-")
                .ofMinLength(1)
                .ofMaxLength(19);

        Arbitrary<String> validPrefix = Combinators.combine(firstChar, rest)
                .as((first, tail) -> first + tail);

        return Arbitraries.oneOf(
                validPrefix,
                Arbitraries.just(null)
        );
    }

    /**
     * Produces arbitrary {@code boolean} values for the {@code msspManaged} field.
     */
    @Provide
    Arbitrary<Boolean> msspManagedFlags() {
        return Arbitraries.of(Boolean.TRUE, Boolean.FALSE);
    }

    // =========================================================================
    // Helper
    // =========================================================================

    /**
     * Builds a minimal {@link HaClient} instance with the specified field values.
     * The {@code id} is set for completeness but is not used by the property
     * predicate (the repository mock is pre-configured to return this object).
     *
     * @param id           the client row ID
     * @param msspManaged  value for the {@code mssp_managed} column
     * @param clientPrefix value for the {@code client_prefix} column (may be {@code null})
     * @return a populated {@link HaClient} instance
     */
    private static HaClient buildClient(Long id, boolean msspManaged, String clientPrefix) {
        HaClient client = new HaClient();
        client.setId(id);
        client.setMsspManaged(msspManaged);
        client.setClientPrefix(clientPrefix);
        return client;
    }
}
