package com.hivearmor.service.ueba;

import com.hivearmor.domain.ueba.GroupSource;
import com.hivearmor.domain.ueba.HaUebaPeerGroup;
import com.hivearmor.repository.UtmClientRepository;
import com.hivearmor.repository.ueba.HaUebaBaselineRepository;
import com.hivearmor.repository.ueba.HaUebaPeerGroupRepository;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.ueba.metrics.MetricObservationReader;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Property-based test for peer-group assignment determinism in {@link HaUebaBaselineService}.
 *
 * <p><strong>Property 1: Peer-group assignment is total and deterministic</strong><br>
 * For every user {@code u}, {@code clusterUsers} assigns {@code u} to exactly one peer group;
 * if {@code u.adDepartment} is non-empty, the resulting {@code group_kind = AD_DEPARTMENT}
 * and {@code group_key = u.adDepartment}; otherwise {@code group_kind = IPV4_SLASH24} and
 * {@code group_key} equals the /24 subnet of {@code u.lastSourceIp}.
 *
 * <p><strong>Validates: Requirements 2.1, 2.2, 2.3</strong>
 *
 * <h2>Test strategy</h2>
 * <ul>
 *   <li>Generate lists of users with arbitrary adDepartment and mostRecentSrcIp values.</li>
 *   <li>Mock {@link ActiveUserDirectory} to return the generated users.</li>
 *   <li>Mock {@link HaUebaPeerGroupRepository} to capture every {@code save()} call.</li>
 *   <li>Invoke {@code clusterUsers(tenantId, today)} and verify:
 *       <ul>
 *         <li>Every user gets exactly one save (totality).</li>
 *         <li>Users with non-empty adDepartment → groupSource = AD_DEPT, groupKey = adDepartment.</li>
 *         <li>Users with null/blank adDepartment → groupSource = SUBNET24, groupKey = correct /24 subnet.</li>
 *         <li>Calling clusterUsers twice produces the same result (determinism).</li>
 *       </ul>
 *   </li>
 * </ul>
 *
 * <p>Minimum iterations: 100 (configured via {@code @Property(tries = 100)}).
 */
class HaUebaBaselinePeerGroupDeterminismPropertyTest {

    // -------------------------------------------------------------------------
    // Test infrastructure – re-created before every jqwik trial
    // -------------------------------------------------------------------------

    private ActiveUserDirectory activeUserDirectory;
    private HaUebaPeerGroupRepository peerGroupRepository;
    private HaUebaBaselineRepository baselineRepository;
    private MsspIndexResolver indexResolver;
    private OpensearchClientBuilder openSearchClient;
    private MetricObservationReader observationReader;
    private UtmClientRepository clientRepository;
    private List<HaUebaPeerGroup> savedGroups;

    @BeforeTry
    void setUp() {
        activeUserDirectory = mock(ActiveUserDirectory.class);
        peerGroupRepository = mock(HaUebaPeerGroupRepository.class);
        baselineRepository = mock(HaUebaBaselineRepository.class);
        indexResolver = mock(MsspIndexResolver.class);
        openSearchClient = mock(OpensearchClientBuilder.class);
        observationReader = mock(MetricObservationReader.class);
        clientRepository = mock(UtmClientRepository.class);
        savedGroups = new ArrayList<>();

        // Mock findByUserIdAndComputedOn to return empty (new row scenario)
        when(peerGroupRepository.findByUserIdAndComputedOn(any(), any()))
            .thenReturn(Optional.empty());

        // Capture every save call
        when(peerGroupRepository.save(any(HaUebaPeerGroup.class)))
            .thenAnswer(invocation -> {
                HaUebaPeerGroup pg = invocation.getArgument(0);
                savedGroups.add(pg);
                return pg;
            });
    }

    private HaUebaBaselineService buildService() {
        return new HaUebaBaselineService(
            indexResolver,
            openSearchClient,
            peerGroupRepository,
            baselineRepository,
            activeUserDirectory,
            observationReader,
            clientRepository
        );
    }

    // =========================================================================
    // Property 1: Peer-group assignment is total and deterministic
    // Validates: Requirements 2.1, 2.2, 2.3
    // =========================================================================

    /**
     * <strong>Validates: Requirements 2.1, 2.2, 2.3</strong>
     *
     * <p>For every user in the generated list:
     * <ul>
     *   <li>Exactly one {@link HaUebaPeerGroup} row is saved (totality).</li>
     *   <li>If adDepartment is non-empty → groupSource = AD_DEPT, groupKey = adDepartment.</li>
     *   <li>If adDepartment is null/blank → groupSource = SUBNET24, groupKey = /24 subnet.</li>
     * </ul>
     */
    @Property(tries = 100)
    @Label("Property 1: Peer-group assignment is total — every user gets exactly one save with correct group")
    void property1_peerGroupAssignmentTotalAndCorrect(
            @ForAll("activeUsers") List<TestActiveUser> users) {

        String tenantId = "test-tenant";
        LocalDate today = LocalDate.of(2026, 7, 28);

        // Wire mock to return the generated users
        when(activeUserDirectory.listByTenant(tenantId))
            .thenReturn(new ArrayList<>(users));

        HaUebaBaselineService service = buildService();
        service.clusterUsers(tenantId, today);

        // Totality: exactly one save per user
        assertThat(savedGroups)
            .as("Every user must get exactly one peer group save")
            .hasSize(users.size());

        // Verify each user's assignment
        for (int i = 0; i < users.size(); i++) {
            TestActiveUser user = users.get(i);
            HaUebaPeerGroup saved = savedGroups.get(i);

            assertThat(saved.getUserId())
                .as("Saved group must reference the correct userId")
                .isEqualTo(user.getUserId());

            assertThat(saved.getComputedOn())
                .as("Saved group must have computedOn = today")
                .isEqualTo(today);

            assertThat(saved.getTenantId())
                .as("Saved group must carry the user's tenantId")
                .isEqualTo(user.getTenantId());

            if (user.getAdDepartment() != null && !user.getAdDepartment().isBlank()) {
                // AD department path
                assertThat(saved.getGroupSource())
                    .as("User with non-empty adDepartment must get AD_DEPT groupSource")
                    .isEqualTo(GroupSource.AD_DEPT);
                assertThat(saved.getGroupKey())
                    .as("User with non-empty adDepartment must get groupKey = adDepartment")
                    .isEqualTo(user.getAdDepartment());
            } else {
                // Subnet fallback path
                assertThat(saved.getGroupSource())
                    .as("User with null/blank adDepartment must get SUBNET24 groupSource")
                    .isEqualTo(GroupSource.SUBNET24);
                String expectedSubnet = expectedSubnet24(user.getMostRecentSrcIp());
                assertThat(saved.getGroupKey())
                    .as("User with null/blank adDepartment must get groupKey = /24 subnet of '%s'",
                        user.getMostRecentSrcIp())
                    .isEqualTo(expectedSubnet);
            }
        }
    }

    /**
     * <strong>Validates: Requirements 2.1, 2.2, 2.3</strong>
     *
     * <p>Calling {@code clusterUsers} twice with the same inputs produces
     * identical peer-group assignments (determinism).
     */
    @Property(tries = 100)
    @Label("Property 1b: Peer-group assignment is deterministic — two calls produce identical results")
    void property1b_peerGroupAssignmentDeterministic(
            @ForAll("activeUsers") List<TestActiveUser> users) {

        String tenantId = "test-tenant";
        LocalDate today = LocalDate.of(2026, 7, 28);

        when(activeUserDirectory.listByTenant(tenantId))
            .thenReturn(new ArrayList<>(users));

        HaUebaBaselineService service = buildService();

        // First invocation
        service.clusterUsers(tenantId, today);
        List<HaUebaPeerGroup> firstRun = new ArrayList<>(savedGroups);

        // Reset captures for second invocation
        savedGroups.clear();

        // Second invocation with same inputs
        service.clusterUsers(tenantId, today);
        List<HaUebaPeerGroup> secondRun = new ArrayList<>(savedGroups);

        // Both runs must produce the same number of saves
        assertThat(secondRun).hasSameSizeAs(firstRun);

        // Each save in the second run must match the corresponding first-run save
        for (int i = 0; i < firstRun.size(); i++) {
            HaUebaPeerGroup first = firstRun.get(i);
            HaUebaPeerGroup second = secondRun.get(i);

            assertThat(second.getUserId())
                .as("Determinism: userId must match between runs for user index %d", i)
                .isEqualTo(first.getUserId());
            assertThat(second.getGroupKey())
                .as("Determinism: groupKey must match between runs for user '%s'", first.getUserId())
                .isEqualTo(first.getGroupKey());
            assertThat(second.getGroupSource())
                .as("Determinism: groupSource must match between runs for user '%s'", first.getUserId())
                .isEqualTo(first.getGroupSource());
        }
    }

    // =========================================================================
    // Arbitraries
    // =========================================================================

    /**
     * Generates a list of 1–20 active users with varying adDepartment and IP fields.
     * Users have:
     * <ul>
     *   <li>Unique userIds</li>
     *   <li>adDepartment: either a non-blank string, null, or blank (to exercise both paths)</li>
     *   <li>mostRecentSrcIp: a valid IPv4 address in dotted-quad notation</li>
     * </ul>
     */
    @Provide
    Arbitrary<List<TestActiveUser>> activeUsers() {
        Arbitrary<TestActiveUser> userArb = Combinators.combine(
            Arbitraries.strings().alpha().ofMinLength(3).ofMaxLength(12),  // userId suffix
            adDepartments(),
            ipv4Addresses()
        ).as((idSuffix, dept, ip) -> new TestActiveUser(
            "user-" + idSuffix,
            "test-tenant",
            dept,
            ip
        ));

        return userArb.list().ofMinSize(1).ofMaxSize(20);
    }

    /**
     * Generates adDepartment values: ~50% non-blank strings, ~25% null, ~25% blank/whitespace.
     */
    @Provide
    Arbitrary<String> adDepartments() {
        Arbitrary<String> nonBlank = Arbitraries.strings()
            .alpha()
            .ofMinLength(2)
            .ofMaxLength(30);

        Arbitrary<String> nullValue = Arbitraries.just(null);

        Arbitrary<String> blankValues = Arbitraries.of("", "   ", "\t", " \n ");

        return Arbitraries.frequencyOf(
            Tuple.of(5, nonBlank),
            Tuple.of(3, nullValue),
            Tuple.of(2, blankValues)
        );
    }

    /**
     * Generates valid IPv4 addresses in dotted-quad notation (a.b.c.d).
     */
    @Provide
    Arbitrary<String> ipv4Addresses() {
        return Combinators.combine(
            Arbitraries.integers().between(1, 255),
            Arbitraries.integers().between(0, 255),
            Arbitraries.integers().between(0, 255),
            Arbitraries.integers().between(1, 254)
        ).as((a, b, c, d) -> a + "." + b + "." + c + "." + d);
    }

    // =========================================================================
    // Helper methods
    // =========================================================================

    /**
     * Computes the expected /24 subnet for a given IPv4 address, mirroring
     * the logic in {@link HaUebaBaselineService#subnet24(String)}.
     */
    private static String expectedSubnet24(String ipv4) {
        if (ipv4 == null || ipv4.isEmpty()) {
            return "0.0.0.0/24";
        }
        int lastDot = ipv4.lastIndexOf('.');
        if (lastDot < 0) {
            return ipv4 + ".0/24";
        }
        return ipv4.substring(0, lastDot) + ".0/24";
    }

    // =========================================================================
    // Test double: ActiveUser implementation
    // =========================================================================

    /**
     * Simple implementation of {@link ActiveUser} for test purposes.
     */
    static class TestActiveUser implements ActiveUser {

        private final String userId;
        private final String tenantId;
        private final String adDepartment;
        private final String mostRecentSrcIp;

        TestActiveUser(String userId, String tenantId, String adDepartment, String mostRecentSrcIp) {
            this.userId = userId;
            this.tenantId = tenantId;
            this.adDepartment = adDepartment;
            this.mostRecentSrcIp = mostRecentSrcIp;
        }

        @Override
        public String getUserId() { return userId; }

        @Override
        public String getTenantId() { return tenantId; }

        @Override
        public String getAdDepartment() { return adDepartment; }

        @Override
        public String getMostRecentSrcIp() { return mostRecentSrcIp; }

        @Override
        public String toString() {
            return "TestActiveUser{userId='" + userId + "', dept='" + adDepartment
                + "', ip='" + mostRecentSrcIp + "'}";
        }
    }
}
