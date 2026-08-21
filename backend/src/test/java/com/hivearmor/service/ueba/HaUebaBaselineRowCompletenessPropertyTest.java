package com.hivearmor.service.ueba;

import com.hivearmor.domain.ueba.HaUebaBaseline;
import com.hivearmor.domain.ueba.HaUebaPeerGroup;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.repository.UtmClientRepository;
import com.hivearmor.repository.ueba.HaUebaBaselineRepository;
import com.hivearmor.repository.ueba.HaUebaPeerGroupRepository;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.ueba.metrics.MetricObservationReader;
import com.hivearmor.service.ueba.metrics.UebaMetrics;
import net.jqwik.api.*;
import net.jqwik.api.lifecycle.BeforeTry;
import org.mockito.ArgumentCaptor;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.DoubleStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Property-based test for baseline row completeness.
 *
 * <p><strong>Property 2: Baseline coverage is total across metrics</strong>
 *
 * <p>After {@code computeBaselines(tenantId, date)} completes, for every peer group
 * with at least two members there exists exactly one {@code ha_ueba_baseline} row per
 * metric name in {@code Metric_Set} for that {@code (tenantId, group_key, date)}
 * combination.
 *
 * <p><strong>Validates: Requirements 2.4, 2.5</strong>
 */
class HaUebaBaselineRowCompletenessPropertyTest {

    // -------------------------------------------------------------------------
    // Test infrastructure — re-created before every jqwik trial
    // -------------------------------------------------------------------------

    private MsspIndexResolver indexResolver;
    private OpensearchClientBuilder openSearchClient;
    private HaUebaPeerGroupRepository peerGroupRepository;
    private HaUebaBaselineRepository baselineRepository;
    private ActiveUserDirectory activeUsers;
    private MetricObservationReader observationReader;
    private HaUebaBaselineService service;

    @BeforeTry
    void setUp() {
        indexResolver = mock(MsspIndexResolver.class);
        openSearchClient = mock(OpensearchClientBuilder.class);
        peerGroupRepository = mock(HaUebaPeerGroupRepository.class);
        baselineRepository = mock(HaUebaBaselineRepository.class);
        activeUsers = mock(ActiveUserDirectory.class);
        observationReader = mock(MetricObservationReader.class);

        service = new HaUebaBaselineService(
            indexResolver, openSearchClient, peerGroupRepository,
            baselineRepository, activeUsers, observationReader,
            mock(UtmClientRepository.class)
        );
    }

    // =========================================================================
    // Property 2: Baseline coverage is total across metrics
    // Validates: Requirements 2.4, 2.5
    // =========================================================================

    /**
     * <strong>Validates: Requirements 2.4, 2.5</strong>
     *
     * <p>For any random configuration of peer groups (1-10 groups, 1-5 members each),
     * after {@code computeBaselines(today)} runs:
     * <ul>
     *   <li>For every group with ≥2 members, exactly 5 baseline rows are saved
     *       (one per metric in {@code Metric_Set}).</li>
     *   <li>No baseline row is saved for groups with &lt;2 members.</li>
     * </ul>
     */
    @Property(tries = 100)
    @Label("Property 2: Baseline coverage is total across metrics")
    void property2_baselineCoverageIsTotalAcrossMetrics(
            @ForAll("peerGroupConfigs") List<PeerGroupConfig> configs) {

        LocalDate today = LocalDate.of(2026, 7, 28);

        // Derive distinct group keys and their members from the generated configs
        Map<String, List<String>> groupToMembers = new LinkedHashMap<>();
        for (PeerGroupConfig cfg : configs) {
            groupToMembers.computeIfAbsent(cfg.groupKey(), k -> new ArrayList<>())
                .addAll(cfg.memberUserIds());
        }

        // Setup mock: distinctGroupKeysForDay returns all group keys
        List<String> groupKeys = new ArrayList<>(groupToMembers.keySet());
        when(peerGroupRepository.distinctGroupKeysForDay(today)).thenReturn(groupKeys);

        // Setup mock: userIdsForGroupOnDay returns the members for each group
        for (Map.Entry<String, List<String>> entry : groupToMembers.entrySet()) {
            when(peerGroupRepository.userIdsForGroupOnDay(entry.getKey(), today))
                .thenReturn(entry.getValue());
        }

        // Setup mock: findByUserIdAndComputedOn returns a peer group with tenantId
        for (Map.Entry<String, List<String>> entry : groupToMembers.entrySet()) {
            if (!entry.getValue().isEmpty()) {
                HaUebaPeerGroup pg = new HaUebaPeerGroup();
                pg.setTenantId("tenant-1");
                pg.setGroupKey(entry.getKey());
                when(peerGroupRepository.findByUserIdAndComputedOn(entry.getValue().get(0), today))
                    .thenReturn(Optional.of(pg));
            }
        }

        // Setup mock: observationReader returns non-empty DoubleStream for any metric/members
        when(observationReader.readDailyObservations(anyString(), anyList(), any(LocalDate.class), any(LocalDate.class)))
            .thenAnswer(invocation -> DoubleStream.of(10.0, 20.0, 30.0, 15.0, 25.0));

        // Setup mock: baselineRepository.findByGroupKeyAndMetricNameAndComputedOn returns empty
        // (forces creation of new rows)
        when(baselineRepository.findByGroupKeyAndMetricNameAndComputedOn(anyString(), anyString(), any(LocalDate.class)))
            .thenReturn(Optional.empty());

        // Setup mock: baselineRepository.save returns the argument
        when(baselineRepository.save(any(HaUebaBaseline.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        // --- Act ---
        service.computeBaselines(today);

        // --- Assert ---
        ArgumentCaptor<HaUebaBaseline> captor = ArgumentCaptor.forClass(HaUebaBaseline.class);

        // Capture all save() calls (may be zero if no groups have ≥2 members)
        verify(baselineRepository, atLeast(0)).save(captor.capture());
        List<HaUebaBaseline> savedBaselines = captor.getAllValues();

        // Groups with ≥2 members should have exactly 5 baseline rows each (one per metric)
        Set<String> groupsWithTwoOrMoreMembers = groupToMembers.entrySet().stream()
            .filter(e -> e.getValue().size() >= 2)
            .map(Map.Entry::getKey)
            .collect(Collectors.toSet());

        Set<String> groupsWithFewerThanTwoMembers = groupToMembers.entrySet().stream()
            .filter(e -> e.getValue().size() < 2)
            .map(Map.Entry::getKey)
            .collect(Collectors.toSet());

        // For groups with ≥2 members: exactly 5 baselines saved (one per metric)
        for (String groupKey : groupsWithTwoOrMoreMembers) {
            List<HaUebaBaseline> baselinesForGroup = savedBaselines.stream()
                .filter(b -> groupKey.equals(b.getGroupKey()))
                .toList();

            assertThat(baselinesForGroup)
                .as("Group '%s' with ≥2 members should have exactly 5 baseline rows", groupKey)
                .hasSize(UebaMetrics.METRIC_SET.size());

            // Each metric in METRIC_SET should appear exactly once
            Set<String> savedMetrics = baselinesForGroup.stream()
                .map(HaUebaBaseline::getMetricName)
                .collect(Collectors.toSet());

            assertThat(savedMetrics)
                .as("Group '%s' should have baselines for all metrics in Metric_Set", groupKey)
                .containsExactlyInAnyOrderElementsOf(UebaMetrics.METRIC_SET);
        }

        // For groups with <2 members: no baseline rows should be saved
        for (String groupKey : groupsWithFewerThanTwoMembers) {
            List<HaUebaBaseline> baselinesForGroup = savedBaselines.stream()
                .filter(b -> groupKey.equals(b.getGroupKey()))
                .toList();

            assertThat(baselinesForGroup)
                .as("Group '%s' with <2 members should have zero baseline rows saved", groupKey)
                .isEmpty();
        }
    }

    // =========================================================================
    // Generators
    // =========================================================================

    /**
     * Generates 1-10 peer group configurations, each with 1-5 members.
     * At least one group is guaranteed to have ≥2 members so the property
     * exercises the baseline computation path. The remainder may have 1 member
     * (testing the skip behavior).
     */
    @Provide
    Arbitrary<List<PeerGroupConfig>> peerGroupConfigs() {
        // A group guaranteed to have ≥2 members
        Arbitrary<PeerGroupConfig> largeGroup = Combinators.combine(
            Arbitraries.strings().alpha().ofMinLength(3).ofMaxLength(12),
            Arbitraries.integers().between(2, 5)
        ).as((groupKey, memberCount) -> {
            List<String> members = new ArrayList<>();
            for (int i = 0; i < memberCount; i++) {
                members.add("user-" + groupKey + "-" + i);
            }
            return new PeerGroupConfig(groupKey, members);
        });

        // A group with 1-5 members (may have <2)
        Arbitrary<PeerGroupConfig> anyGroup = Combinators.combine(
            Arbitraries.strings().alpha().ofMinLength(3).ofMaxLength(12),
            Arbitraries.integers().between(1, 5)
        ).as((groupKey, memberCount) -> {
            List<String> members = new ArrayList<>();
            for (int i = 0; i < memberCount; i++) {
                members.add("user-" + groupKey + "-" + i);
            }
            return new PeerGroupConfig(groupKey, members);
        });

        // Always include at least one large group, plus 0-9 additional groups
        return Combinators.combine(
            largeGroup,
            anyGroup.list().ofMinSize(0).ofMaxSize(9)
        ).as((first, rest) -> {
            List<PeerGroupConfig> all = new ArrayList<>();
            all.add(first);
            all.addAll(rest);
            return all;
        }).filter(list -> {
            // Ensure group keys are distinct across the list
            Set<String> keys = list.stream()
                .map(PeerGroupConfig::groupKey)
                .collect(Collectors.toSet());
            return keys.size() == list.size();
        });
    }

    // =========================================================================
    // Supporting types
    // =========================================================================

    record PeerGroupConfig(String groupKey, List<String> memberUserIds) {}
}
