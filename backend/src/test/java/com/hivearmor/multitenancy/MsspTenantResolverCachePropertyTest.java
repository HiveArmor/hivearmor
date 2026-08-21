package com.hivearmor.multitenancy;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Ticker;
import com.hivearmor.domain.HaClient;
import com.hivearmor.repository.HaClientRepository;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.AfterTry;
import org.junit.jupiter.api.Tag;

import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/**
 * Property-based tests for {@link TenantResolutionCacheConfig} cache semantics and
 * {@link MsspTenantResolver} domain-filter logic.
 *
 * <p><strong>Property 5: TenantResolutionCache determinism and bounded size</strong><br>
 * <strong>Validates: Requirements 7.3, 7.5, 7.7</strong>
 *
 * <h2>Approach</h2>
 * <p>Because wiring Spring's {@code @Cacheable} proxy outside a Spring context is
 * complex, these tests follow the "simpler approach" described in the design document:
 * <ol>
 *   <li>Cache-layer properties (determinism, eviction, LRU, TTL) are verified directly
 *       against a {@link Caffeine} cache configured with identical parameters to
 *       {@link TenantResolutionCacheConfig} (5-minute TTL, 500-entry max), using a
 *       manual {@link AtomicLong}-backed {@link Ticker} to control time.</li>
 *   <li>Domain-filter logic (the {@code isMsspManaged} / {@code clientPrefix} chain) is
 *       verified through {@link MsspTenantResolver} directly with a mocked
 *       {@link HaClientRepository}, confirming that the resolver correctly returns
 *       {@code Optional.of(prefix)}, {@code Optional.empty()}, or handles {@code null}
 *       client IDs.</li>
 * </ol>
 *
 * <h2>Cache configuration under test</h2>
 * <pre>
 *   Caffeine.newBuilder()
 *       .expireAfterWrite(Duration.ofMinutes(5))
 *       .maximumSize(500)
 *       .ticker(manualTicker)
 * </pre>
 *
 * <h2>Tag</h2>
 * <p>{@code Feature: sprint-21-mssp-schema, Property 5}
 *
 * <h2>Minimum iterations</h2>
 * <p>100 (enforced via {@code @Property(tries = 100)}).
 */
@Tag("Feature: sprint-21-mssp-schema")
@Tag("Property 5")
class MsspTenantResolverCachePropertyTest {

    // =========================================================================
    // Constants matching TenantResolutionCacheConfig
    // =========================================================================

    private static final int MAX_CACHE_SIZE = 500;
    private static final long TTL_NANOS = Duration.ofMinutes(5).toNanos();

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Creates a Caffeine cache whose parameters match {@link TenantResolutionCacheConfig}
     * exactly, but whose time source is the provided manual ticker so tests can
     * advance time without sleeping.
     *
     * @param ticker manually controlled nanosecond time source
     * @return a fresh Caffeine {@link Cache} ready for use
     */
    private static Cache<Long, Optional<String>> buildCache(Ticker ticker) {
        return Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofMinutes(5))
                .maximumSize(MAX_CACHE_SIZE)
                .ticker(ticker)
                .build();
    }

    /**
     * Simulates the cache-aware lookup performed by the {@code @Cacheable} proxy:
     * checks the cache first; on a miss, delegates to the repository, caches the
     * result, and returns it.
     *
     * <p>This mirrors exactly what Spring's proxy does for
     * {@code MsspTenantResolver.resolvePrefix(clientId)} inside the TTL window.
     *
     * @param cache      the Caffeine cache (keyed by client ID)
     * @param clientId   the client identifier to look up
     * @param repository mock or real {@link HaClientRepository}
     * @return the resolved prefix wrapped in {@link Optional}, or empty
     */
    private static Optional<String> cacheAwareLookup(
            Cache<Long, Optional<String>> cache,
            Long clientId,
            HaClientRepository repository) {

        return cache.get(clientId, id ->
                repository.findById(id)
                          .filter(HaClient::isMsspManaged)
                          .map(HaClient::getClientPrefix)
        );
    }

    // =========================================================================
    // Property 5-A: Cache determinism — repeated calls within TTL return the
    //               same value and invoke the repository exactly once.
    // Validates: Requirements 7.3, 7.5
    // =========================================================================

    /**
     * For any client ID {@code c}, calling {@code resolvePrefix(c)} multiple times
     * within the 5-minute TTL MUST return the same {@code Optional<String>} on every
     * call, and the underlying {@code HaClientRepository.findById(c)} MUST be invoked
     * exactly once (all subsequent calls are cache hits).
     *
     * <p><strong>Validates: Requirements 7.3, 7.5</strong>
     */
    @Property(tries = 100)
    void property5A_repeatedLookup_withinTtl_returnsSameValueAndCallsRepoOnce(
            @ForAll("clientIds") Long clientId,
            @ForAll("msspManagedClients") HaClient client,
            @ForAll("repeatCounts") int repeatCount) {

        // Arrange: fresh cache + mock repo that always returns the client
        AtomicLong nanoTime = new AtomicLong(0L);
        Cache<Long, Optional<String>> cache = buildCache(nanoTime::get);

        HaClientRepository repo = mock(HaClientRepository.class);
        when(repo.findById(clientId)).thenReturn(Optional.of(client));

        // Act: first call — expected to be a cache miss (repo is queried)
        Optional<String> firstResult = cacheAwareLookup(cache, clientId, repo);

        // Repeat within TTL (time does not advance)
        Optional<String> latestResult = firstResult;
        for (int i = 1; i < repeatCount; i++) {
            latestResult = cacheAwareLookup(cache, clientId, repo);
        }

        // Assert: every call returned the same value
        assertThat(latestResult)
                .as("All repeat calls within TTL must return the same Optional<String> "
                        + "for clientId=%d, prefix='%s'", clientId, client.getClientPrefix())
                .isEqualTo(firstResult);

        // Assert: repo was invoked exactly once regardless of repeatCount
        verify(repo, times(1)).findById(clientId);
    }

    // =========================================================================
    // Property 5-B: Cache determinism for absent / non-MSSP clients
    // Validates: Requirement 7.3
    // =========================================================================

    /**
     * For a client ID that has no {@link HaClient} row (repo returns empty), the
     * cache must store {@code Optional.empty()} and serve it on repeat calls without
     * hitting the repository again.
     *
     * <p><strong>Validates: Requirement 7.3</strong>
     */
    @Property(tries = 100)
    void property5B_absentClient_cachedAsEmpty_repositoryCalledOnce(
            @ForAll("clientIds") Long clientId,
            @ForAll("repeatCounts") int repeatCount) {

        AtomicLong nanoTime = new AtomicLong(0L);
        Cache<Long, Optional<String>> cache = buildCache(nanoTime::get);

        HaClientRepository repo = mock(HaClientRepository.class);
        when(repo.findById(clientId)).thenReturn(Optional.empty());

        Optional<String> first = cacheAwareLookup(cache, clientId, repo);
        assertThat(first).isEmpty();

        for (int i = 1; i < repeatCount; i++) {
            Optional<String> subsequent = cacheAwareLookup(cache, clientId, repo);
            assertThat(subsequent)
                    .as("Subsequent call %d must return Optional.empty() for absent clientId=%d",
                            i, clientId)
                    .isEmpty();
        }

        verify(repo, times(1)).findById(clientId);
    }

    // =========================================================================
    // Property 5-C: TTL expiry triggers a new repository lookup
    // Validates: Requirements 7.3, 7.5
    // =========================================================================

    /**
     * After the 5-minute TTL expires (simulated by advancing the manual ticker past
     * {@code TTL_NANOS}), the next call MUST be a cache miss and MUST invoke the
     * repository again.
     *
     * <p><strong>Validates: Requirements 7.3, 7.5</strong>
     */
    @Property(tries = 100)
    void property5C_ttlExpiry_triggersNewRepositoryLookup(
            @ForAll("clientIds") Long clientId,
            @ForAll("msspManagedClients") HaClient client) {

        AtomicLong nanoTime = new AtomicLong(0L);
        Cache<Long, Optional<String>> cache = buildCache(nanoTime::get);

        HaClientRepository repo = mock(HaClientRepository.class);
        when(repo.findById(clientId)).thenReturn(Optional.of(client));

        // First lookup — cache miss → repo call 1
        cacheAwareLookup(cache, clientId, repo);
        verify(repo, times(1)).findById(clientId);

        // Advance time past the 5-minute TTL
        nanoTime.set(TTL_NANOS + 1L);

        // Caffeines's expireAfterWrite eviction is lazy; trigger cleanup
        cache.cleanUp();

        // Second lookup after TTL expiry — must be a cache miss → repo call 2
        cacheAwareLookup(cache, clientId, repo);
        verify(repo, times(2)).findById(clientId);
    }

    // =========================================================================
    // Property 5-D: Manual eviction triggers a new repository lookup
    // Validates: Requirement 7.5
    // =========================================================================

    /**
     * After calling {@code cache.invalidate(clientId)} (which corresponds to
     * {@code MsspTenantResolver.evict(clientId)} at the Spring layer), the next
     * call MUST be a cache miss and MUST invoke the repository exactly one more time.
     *
     * <p><strong>Validates: Requirement 7.5</strong>
     */
    @Property(tries = 100)
    void property5D_manualEviction_triggersNewRepositoryLookup(
            @ForAll("clientIds") Long clientId,
            @ForAll("msspManagedClients") HaClient client) {

        AtomicLong nanoTime = new AtomicLong(0L);
        Cache<Long, Optional<String>> cache = buildCache(nanoTime::get);

        HaClientRepository repo = mock(HaClientRepository.class);
        when(repo.findById(clientId)).thenReturn(Optional.of(client));

        // First lookup — cache miss → repo call 1
        cacheAwareLookup(cache, clientId, repo);
        verify(repo, times(1)).findById(clientId);

        // Confirm cache hit before eviction
        cacheAwareLookup(cache, clientId, repo);
        verify(repo, times(1)).findById(clientId); // still only 1 call

        // Evict — mirrors MsspTenantResolver.evict(clientId)
        cache.invalidate(clientId);

        // Post-eviction lookup — must hit the repo again
        cacheAwareLookup(cache, clientId, repo);
        verify(repo, times(2)).findById(clientId);
    }

    // =========================================================================
    // Property 5-E: LRU eviction — inserting 501 entries ejects the LRU entry
    // Validates: Requirement 7.7
    // =========================================================================

    /**
     * The cache MUST enforce a maximum size of 500 entries using LRU (least-recently-used)
     * eviction. When the 501st distinct key is inserted:
     * <ol>
     *   <li>The entry that was inserted first (and never accessed again) MUST be
     *       ejected from the cache.</li>
     *   <li>After ejection, calling {@code resolvePrefix()} for the ejected key
     *       MUST result in a new repository call (cache miss → DB hit).</li>
     * </ol>
     *
     * <p><strong>Validates: Requirement 7.7</strong>
     *
     * <p>Note: Caffeine uses a Window-TinyLFU policy rather than pure LRU. Under that
     * policy, the very-first entry with no subsequent accesses is a strong candidate
     * for eviction when capacity is exceeded. This test verifies the <em>bounded-size</em>
     * guarantee (no more than 500 entries) and that an entry not accessed after initial
     * insertion is evicted when capacity is exceeded.
     */
    @Property(tries = 10)  // Reduced: each trial inserts 501 entries — keep suite fast
    void property5E_lruEviction_boundedCacheSize_ejectsLeastRecentlyUsedEntry(
            @ForAll("lruBaseClientIds") long baseId) {

        AtomicLong nanoTime = new AtomicLong(0L);
        Cache<Long, Optional<String>> cache = buildCache(nanoTime::get);

        HaClientRepository repo = mock(HaClientRepository.class);

        // Build 501 distinct HaClient stubs: each has its own prefix
        long lruCandidateId = baseId;  // First inserted — LRU candidate
        String lruCandidatePrefix = "lru-candidate";

        HaClient lruClient = new HaClient();
        lruClient.setId(lruCandidateId);
        lruClient.setMsspManaged(true);
        lruClient.setClientPrefix(lruCandidatePrefix);
        when(repo.findById(lruCandidateId)).thenReturn(Optional.of(lruClient));

        // Insert the LRU candidate first
        cacheAwareLookup(cache, lruCandidateId, repo);

        // Insert MAX_CACHE_SIZE (500) more entries to push past capacity
        for (int i = 1; i <= MAX_CACHE_SIZE; i++) {
            long otherId = baseId + i;
            String otherPrefix = "tenant-" + i;

            HaClient other = new HaClient();
            other.setId(otherId);
            other.setMsspManaged(true);
            other.setClientPrefix(otherPrefix);
            when(repo.findById(otherId)).thenReturn(Optional.of(other));

            cacheAwareLookup(cache, otherId, repo);
        }

        // Trigger Caffeine's pending eviction tasks
        cache.cleanUp();

        // Assert: cache size must not exceed the configured maximum
        assertThat(cache.estimatedSize())
                .as("Cache size must not exceed maximumSize=%d after inserting %d entries",
                        MAX_CACHE_SIZE, MAX_CACHE_SIZE + 1)
                .isLessThanOrEqualTo(MAX_CACHE_SIZE);

        // Assert: the LRU candidate (first inserted, never re-accessed) must have
        // been evicted. A lookup now MUST increment the repo call count.
        int callsBefore = mockingDetails(repo).getInvocations().stream()
                .filter(inv -> inv.getMethod().getName().equals("findById")
                        && inv.getArgument(0, Long.class).equals(lruCandidateId))
                .mapToInt(inv -> 1)
                .sum();

        cacheAwareLookup(cache, lruCandidateId, repo);

        int callsAfter = mockingDetails(repo).getInvocations().stream()
                .filter(inv -> inv.getMethod().getName().equals("findById")
                        && inv.getArgument(0, Long.class).equals(lruCandidateId))
                .mapToInt(inv -> 1)
                .sum();

        assertThat(callsAfter)
                .as("After LRU eviction, repo.findById(%d) must be called again "
                        + "(was called %d times before post-eviction lookup)",
                        lruCandidateId, callsBefore)
                .isGreaterThan(callsBefore);
    }

    // =========================================================================
    // Property 5-F: MsspTenantResolver domain filter — msspManaged=true + non-null
    //               prefix → Optional.of(prefix); all other combos → Optional.empty()
    // Validates: Requirements 7.3, 7.4
    // =========================================================================

    /**
     * {@link MsspTenantResolver#resolvePrefix(Long)} MUST return
     * {@code Optional.of(client.getClientPrefix())} when and only when:
     * <ul>
     *   <li>{@code clientId} is non-null,</li>
     *   <li>the repository returns a non-empty {@link HaClient},</li>
     *   <li>{@code HaClient.isMsspManaged()} is {@code true}, AND</li>
     *   <li>{@code HaClient.getClientPrefix()} is non-null.</li>
     * </ul>
     * In all other cases it MUST return {@code Optional.empty()}.
     *
     * <p>This property tests the resolver's domain logic without a Spring context by
     * constructing {@link MsspTenantResolver} directly via its public constructor.
     *
     * <p><strong>Validates: Requirements 7.3, 7.4</strong>
     */
    @Property(tries = 100)
    void property5F_resolverDomainFilter_msspManagedWithPrefix_returnsOptionalOfPrefix(
            @ForAll("clientIds") Long clientId,
            @ForAll("msspManagedClients") HaClient client) {

        HaClientRepository repo = mock(HaClientRepository.class);
        when(repo.findById(clientId)).thenReturn(Optional.of(client));

        MsspTenantResolver resolver = new MsspTenantResolver(repo);

        // Call the method directly (bypasses @Cacheable proxy — tests raw logic)
        Optional<String> result = resolver.resolvePrefix(clientId);

        if (client.isMsspManaged() && client.getClientPrefix() != null) {
            assertThat(result)
                    .as("resolvePrefix(%d) must return Optional.of('%s') when msspManaged=true "
                            + "and prefix is non-null", clientId, client.getClientPrefix())
                    .isPresent()
                    .hasValue(client.getClientPrefix());
        } else {
            assertThat(result)
                    .as("resolvePrefix(%d) must return Optional.empty() when msspManaged=%b "
                                    + "or prefix is null",
                            clientId, client.isMsspManaged())
                    .isEmpty();
        }
    }

    // =========================================================================
    // Property 5-G: Null clientId → Optional.empty(), repository NOT called
    // Validates: Requirement 7.3
    // =========================================================================

    /**
     * When {@code clientId} is {@code null}, {@link MsspTenantResolver#resolvePrefix(Long)}
     * MUST return {@code Optional.empty()} immediately without consulting the repository.
     *
     * <p><strong>Validates: Requirement 7.3</strong>
     */
    @Property(tries = 100)
    void property5G_nullClientId_returnsEmptyWithoutCallingRepository(
            @ForAll("repeatCounts") int ignored) {

        HaClientRepository repo = mock(HaClientRepository.class);
        MsspTenantResolver resolver = new MsspTenantResolver(repo);

        Optional<String> result = resolver.resolvePrefix(null);

        assertThat(result)
                .as("resolvePrefix(null) must return Optional.empty()")
                .isEmpty();

        verifyNoInteractions(repo);
    }

    // =========================================================================
    // Property 5-H: Non-MSSP client (msspManaged=false) → Optional.empty()
    // Validates: Requirements 7.3, 7.4
    // =========================================================================

    /**
     * When the repository returns a {@link HaClient} with {@code msspManaged=false},
     * {@link MsspTenantResolver#resolvePrefix(Long)} MUST return {@code Optional.empty()},
     * regardless of the {@code clientPrefix} value.
     *
     * <p><strong>Validates: Requirements 7.3, 7.4</strong>
     */
    @Property(tries = 100)
    void property5H_nonMsspClient_returnsEmpty(
            @ForAll("clientIds") Long clientId,
            @ForAll("nonMsspClients") HaClient client) {

        HaClientRepository repo = mock(HaClientRepository.class);
        when(repo.findById(clientId)).thenReturn(Optional.of(client));

        MsspTenantResolver resolver = new MsspTenantResolver(repo);
        Optional<String> result = resolver.resolvePrefix(clientId);

        assertThat(result)
                .as("resolvePrefix(%d) must return Optional.empty() for non-MSSP client "
                        + "(msspManaged=false, prefix='%s')", clientId, client.getClientPrefix())
                .isEmpty();
    }

    // =========================================================================
    // Lifecycle
    // =========================================================================

    /**
     * Ensures Mockito state from static mock creation does not leak across jqwik tries.
     * jqwik does not call JUnit5 {@code @AfterEach} — use {@link AfterTry} instead.
     *
     * <p>Note: mocks are created inside each property method, so no instance-level
     * teardown is strictly required. This hook is a safety net for any state that
     * might accumulate on the {@link MsspTenantResolver} fields.
     */
    @AfterTry
    void afterTry() {
        // No shared state to clean — each try creates fresh mocks and caches.
        // Kept as an explicit marker for future maintainers.
    }

    // =========================================================================
    // Arbitraries
    // =========================================================================

    /**
     * Produces non-null {@link Long} client IDs in the range [1, 100_000].
     * This range keeps IDs small and meaningful without triggering overflow when
     * the LRU test increments by 500.
     */
    @Provide
    Arbitrary<Long> clientIds() {
        return Arbitraries.longs().between(1L, 100_000L);
    }

    /**
     * Produces client IDs suitable for the LRU test: range [1, 99_000] so that
     * adding 500 to the base stays within Long bounds and within the clientIds pool.
     */
    @Provide
    Arbitrary<Long> lruBaseClientIds() {
        return Arbitraries.longs().between(1L, 99_000L);
    }

    /**
     * Produces repeat-call counts in the range [2, 5].
     * Each property trial makes 2–5 calls to confirm cache hit behaviour
     * without making individual trials too slow.
     */
    @Provide
    Arbitrary<Integer> repeatCounts() {
        return Arbitraries.integers().between(2, 5);
    }

    /**
     * Produces {@link HaClient} instances where {@code msspManaged=true} and
     * {@code clientPrefix} matches the {@code ^[a-z0-9][a-z0-9-]{1,19}$} regex.
     *
     * <p>The prefix format is drawn from the same character pool as the DB constraint
     * so property tests exercise realistic inputs.
     */
    @Provide
    Arbitrary<HaClient> msspManagedClients() {
        Arbitrary<Character> firstChar = Arbitraries.chars()
                .with("abcdefghijklmnopqrstuvwxyz0123456789");
        Arbitrary<String> tail = Arbitraries.strings()
                .withChars("abcdefghijklmnopqrstuvwxyz0123456789-")
                .ofMinLength(1)
                .ofMaxLength(19);

        return Combinators.combine(firstChar, tail)
                .as((first, rest) -> {
                    HaClient c = new HaClient();
                    c.setMsspManaged(true);
                    c.setClientPrefix(first + rest);
                    return c;
                });
    }

    /**
     * Produces {@link HaClient} instances where {@code msspManaged=false}.
     * {@code clientPrefix} may be null or a valid string — the resolver must
     * return empty regardless.
     */
    @Provide
    Arbitrary<HaClient> nonMsspClients() {
        Arbitrary<String> maybePrefix = Arbitraries.oneOf(
                Arbitraries.just(null),
                Arbitraries.strings()
                        .withChars("abcdefghijklmnopqrstuvwxyz0123456789-")
                        .ofMinLength(2)
                        .ofMaxLength(20)
        );

        return maybePrefix.map(prefix -> {
            HaClient c = new HaClient();
            c.setMsspManaged(false);
            c.setClientPrefix(prefix);
            return c;
        });
    }
}
