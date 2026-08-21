package com.hivearmor.service.ueba;

import com.hivearmor.domain.ueba.GroupSource;
import com.hivearmor.domain.ueba.HaUebaBaseline;
import com.hivearmor.domain.ueba.HaUebaPeerGroup;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.repository.UtmClientRepository;
import com.hivearmor.repository.ueba.HaUebaBaselineRepository;
import com.hivearmor.repository.ueba.HaUebaPeerGroupRepository;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.ueba.metrics.MetricObservationReader;
import com.hivearmor.service.ueba.metrics.UebaMetrics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.stream.DoubleStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link HaUebaBaselineService}.
 *
 * <p>Covers:
 * <ul>
 *   <li>AD-department path (Requirement 2.1)</li>
 *   <li>IPv4 /24 fallback path (Requirement 2.2)</li>
 *   <li>Upsert idempotency (Requirement 2.3)</li>
 *   <li>Mean computation (Requirement 2.5)</li>
 *   <li>Sample stddev computation (Requirement 2.5)</li>
 *   <li>Skip-when-single-member behavior (Requirement 2.5)</li>
 *   <li>subnet24 edge cases</li>
 * </ul>
 *
 * <p><b>Validates: Requirements 2.1, 2.2, 2.3, 2.5</b>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class HaUebaBaselineServiceTest {

    @Mock MsspIndexResolver indexResolver;
    @Mock OpensearchClientBuilder openSearchClient;
    @Mock HaUebaPeerGroupRepository peerGroupRepository;
    @Mock HaUebaBaselineRepository baselineRepository;
    @Mock ActiveUserDirectory activeUsers;
    @Mock MetricObservationReader observationReader;
    @Mock UtmClientRepository clientRepository;

    @Captor ArgumentCaptor<HaUebaPeerGroup> peerGroupCaptor;
    @Captor ArgumentCaptor<HaUebaBaseline> baselineCaptor;

    private HaUebaBaselineService service;

    @BeforeEach
    void setUp() {
        service = new HaUebaBaselineService(
            indexResolver, openSearchClient, peerGroupRepository,
            baselineRepository, activeUsers, observationReader, clientRepository
        );
    }

    // ─── Helper: build an ActiveUser stub ───────────────────────────────────

    private ActiveUser activeUser(String userId, String tenantId, String adDept, String srcIp) {
        ActiveUser user = mock(ActiveUser.class);
        when(user.getUserId()).thenReturn(userId);
        when(user.getTenantId()).thenReturn(tenantId);
        when(user.getAdDepartment()).thenReturn(adDept);
        when(user.getMostRecentSrcIp()).thenReturn(srcIp);
        return user;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 1. AD-department path — Requirement 2.1
    // ═══════════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("AD-department path (Requirement 2.1)")
    class AdDepartmentPath {

        @Test
        @DisplayName("assigns GroupSource.AD_DEPT and groupKey = adDepartment when non-blank")
        void clusterUsers_withAdDept_assignsAdDeptGroupSource() {
            LocalDate today = LocalDate.of(2026, 7, 25);
            ActiveUser user = activeUser("user-1", "tenant-A", "Engineering", "10.0.1.50");
            when(activeUsers.listByTenant("tenant-A")).thenReturn(List.of(user));
            when(peerGroupRepository.findByUserIdAndComputedOn("user-1", today))
                .thenReturn(Optional.empty());
            when(peerGroupRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

            service.clusterUsers("tenant-A", today);

            verify(peerGroupRepository).save(peerGroupCaptor.capture());
            HaUebaPeerGroup saved = peerGroupCaptor.getValue();
            assertThat(saved.getUserId()).isEqualTo("user-1");
            assertThat(saved.getGroupSource()).isEqualTo(GroupSource.AD_DEPT);
            assertThat(saved.getGroupKey()).isEqualTo("Engineering");
            assertThat(saved.getTenantId()).isEqualTo("tenant-A");
            assertThat(saved.getComputedOn()).isEqualTo(today);
        }

        @Test
        @DisplayName("respects whitespace-only department as blank → falls through to subnet")
        void clusterUsers_whitespaceOnlyDept_fallsToSubnet() {
            LocalDate today = LocalDate.of(2026, 7, 25);
            ActiveUser user = activeUser("user-2", "tenant-A", "   ", "192.168.10.44");
            when(activeUsers.listByTenant("tenant-A")).thenReturn(List.of(user));
            when(peerGroupRepository.findByUserIdAndComputedOn("user-2", today))
                .thenReturn(Optional.empty());
            when(peerGroupRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

            service.clusterUsers("tenant-A", today);

            verify(peerGroupRepository).save(peerGroupCaptor.capture());
            HaUebaPeerGroup saved = peerGroupCaptor.getValue();
            assertThat(saved.getGroupSource()).isEqualTo(GroupSource.SUBNET24);
            assertThat(saved.getGroupKey()).isEqualTo("192.168.10.0/24");
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. IPv4 /24 fallback path — Requirement 2.2
    // ═══════════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("IPv4 /24 fallback path (Requirement 2.2)")
    class Ipv4SubnetFallback {

        @Test
        @DisplayName("assigns GroupSource.SUBNET24 and groupKey = subnet /24 when AD dept is null")
        void clusterUsers_nullAdDept_assignsSubnet24() {
            LocalDate today = LocalDate.of(2026, 7, 25);
            ActiveUser user = activeUser("user-3", "tenant-B", null, "172.16.5.100");
            when(activeUsers.listByTenant("tenant-B")).thenReturn(List.of(user));
            when(peerGroupRepository.findByUserIdAndComputedOn("user-3", today))
                .thenReturn(Optional.empty());
            when(peerGroupRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

            service.clusterUsers("tenant-B", today);

            verify(peerGroupRepository).save(peerGroupCaptor.capture());
            HaUebaPeerGroup saved = peerGroupCaptor.getValue();
            assertThat(saved.getGroupSource()).isEqualTo(GroupSource.SUBNET24);
            assertThat(saved.getGroupKey()).isEqualTo("172.16.5.0/24");
        }

        @Test
        @DisplayName("assigns SUBNET24 when AD dept is empty string")
        void clusterUsers_emptyAdDept_assignsSubnet24() {
            LocalDate today = LocalDate.of(2026, 7, 25);
            ActiveUser user = activeUser("user-4", "tenant-B", "", "10.20.30.40");
            when(activeUsers.listByTenant("tenant-B")).thenReturn(List.of(user));
            when(peerGroupRepository.findByUserIdAndComputedOn("user-4", today))
                .thenReturn(Optional.empty());
            when(peerGroupRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

            service.clusterUsers("tenant-B", today);

            verify(peerGroupRepository).save(peerGroupCaptor.capture());
            HaUebaPeerGroup saved = peerGroupCaptor.getValue();
            assertThat(saved.getGroupSource()).isEqualTo(GroupSource.SUBNET24);
            assertThat(saved.getGroupKey()).isEqualTo("10.20.30.0/24");
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. Upsert idempotency — Requirement 2.3
    // ═══════════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Upsert idempotency (Requirement 2.3)")
    class UpsertIdempotency {

        @Test
        @DisplayName("second call for same user/date updates existing row, not duplicates")
        void clusterUsers_calledTwice_updatesExistingRow() {
            LocalDate today = LocalDate.of(2026, 7, 25);
            ActiveUser user = activeUser("user-5", "tenant-C", "Sales", "10.0.0.1");
            when(activeUsers.listByTenant("tenant-C")).thenReturn(List.of(user));

            // First call — no existing row
            when(peerGroupRepository.findByUserIdAndComputedOn("user-5", today))
                .thenReturn(Optional.empty());
            when(peerGroupRepository.save(any())).thenAnswer(inv -> {
                HaUebaPeerGroup pg = inv.getArgument(0);
                pg.setId(42L); // simulate DB assigning an ID
                return pg;
            });

            service.clusterUsers("tenant-C", today);

            verify(peerGroupRepository, times(1)).save(peerGroupCaptor.capture());
            HaUebaPeerGroup firstSave = peerGroupCaptor.getValue();
            assertThat(firstSave.getId()).isEqualTo(42L);

            // Second call — existing row returned by repository
            HaUebaPeerGroup existing = new HaUebaPeerGroup();
            existing.setId(42L);
            existing.setUserId("user-5");
            existing.setGroupKey("Sales");
            existing.setGroupSource(GroupSource.AD_DEPT);
            existing.setTenantId("tenant-C");
            existing.setComputedOn(today);

            reset(peerGroupRepository);
            when(peerGroupRepository.findByUserIdAndComputedOn("user-5", today))
                .thenReturn(Optional.of(existing));
            when(peerGroupRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

            service.clusterUsers("tenant-C", today);

            verify(peerGroupRepository, times(1)).save(peerGroupCaptor.capture());
            HaUebaPeerGroup secondSave = peerGroupCaptor.getValue();
            // Same entity instance (ID preserved) — update, not insert
            assertThat(secondSave.getId()).isEqualTo(42L);
            assertThat(secondSave.getGroupKey()).isEqualTo("Sales");
            assertThat(secondSave.getGroupSource()).isEqualTo(GroupSource.AD_DEPT);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. Mean computation — Requirement 2.5
    // ═══════════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Mean computation (Requirement 2.5)")
    class MeanComputation {

        @Test
        @DisplayName("mean([10, 20, 30]) returns 20.0")
        void mean_simpleValues_returnsCorrectMean() {
            double result = HaUebaBaselineService.mean(new double[]{10, 20, 30});
            assertThat(result).isEqualTo(20.0);
        }

        @Test
        @DisplayName("mean of single value returns that value")
        void mean_singleValue_returnsSameValue() {
            double result = HaUebaBaselineService.mean(new double[]{42.5});
            assertThat(result).isEqualTo(42.5);
        }

        @Test
        @DisplayName("mean of empty array returns 0.0")
        void mean_emptyArray_returnsZero() {
            double result = HaUebaBaselineService.mean(new double[]{});
            assertThat(result).isEqualTo(0.0);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. Sample stddev computation — Requirement 2.5
    // ═══════════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Sample stddev computation (Requirement 2.5)")
    class SampleStddevComputation {

        @Test
        @DisplayName("sampleStddev([2, 4, 4, 4, 5, 5, 7, 9]) ≈ 2.138")
        void sampleStddev_knownValues_returnsExpectedStddev() {
            double[] values = {2, 4, 4, 4, 5, 5, 7, 9};
            double mean = HaUebaBaselineService.mean(values); // = 5.0
            double stddev = HaUebaBaselineService.sampleStddev(values, mean);
            // Expected: sqrt(((2-5)^2 + (4-5)^2*3 + (5-5)^2*2 + (7-5)^2 + (9-5)^2) / 7)
            // = sqrt((9 + 1 + 1 + 1 + 0 + 0 + 4 + 16) / 7) = sqrt(32/7) ≈ 2.13809
            assertThat(stddev).isCloseTo(2.138, within(0.001));
        }

        @Test
        @DisplayName("sampleStddev returns 0.0 for single-element array")
        void sampleStddev_singleElement_returnsZero() {
            double[] values = {7.0};
            double stddev = HaUebaBaselineService.sampleStddev(values, 7.0);
            assertThat(stddev).isEqualTo(0.0);
        }

        @Test
        @DisplayName("sampleStddev of identical values returns 0.0")
        void sampleStddev_identicalValues_returnsZero() {
            double[] values = {5.0, 5.0, 5.0, 5.0};
            double stddev = HaUebaBaselineService.sampleStddev(values, 5.0);
            assertThat(stddev).isEqualTo(0.0);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 6. Skip-when-single-member — Requirement 2.5
    // ═══════════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("Skip-when-single-member (Requirement 2.5)")
    class SkipSingleMember {

        @Test
        @DisplayName("peer group with 1 member → no baseline saved")
        void computeBaselines_singleMember_skipsBaseline() {
            LocalDate today = LocalDate.of(2026, 7, 25);
            when(peerGroupRepository.distinctGroupKeysForDay(today))
                .thenReturn(List.of("lonely-group"));
            when(peerGroupRepository.userIdsForGroupOnDay("lonely-group", today))
                .thenReturn(List.of("solo-user"));

            service.computeBaselines(today);

            // No baseline should be persisted
            verify(baselineRepository, never()).save(any());
        }

        @Test
        @DisplayName("peer group with 2+ members → baselines saved for each metric")
        void computeBaselines_multipleMembers_savesBaselines() {
            LocalDate today = LocalDate.of(2026, 7, 25);
            when(peerGroupRepository.distinctGroupKeysForDay(today))
                .thenReturn(List.of("eng-group"));
            when(peerGroupRepository.userIdsForGroupOnDay("eng-group", today))
                .thenReturn(List.of("user-a", "user-b", "user-c"));

            // Mock finding the first member's peer group to resolve tenantId
            HaUebaPeerGroup pg = new HaUebaPeerGroup();
            pg.setTenantId("tenant-X");
            when(peerGroupRepository.findByUserIdAndComputedOn("user-a", today))
                .thenReturn(Optional.of(pg));

            // All metrics return some observations
            when(observationReader.readDailyObservations(
                any(), eq(List.of("user-a", "user-b", "user-c")), any(), any()))
                .thenAnswer(inv -> DoubleStream.of(10, 20, 30));
            when(baselineRepository.findByGroupKeyAndMetricNameAndComputedOn(any(), any(), any()))
                .thenReturn(Optional.empty());
            when(baselineRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

            service.computeBaselines(today);

            // Should save one baseline per metric (5 metrics)
            verify(baselineRepository, times(UebaMetrics.METRIC_SET.size())).save(baselineCaptor.capture());
            List<HaUebaBaseline> savedBaselines = baselineCaptor.getAllValues();
            for (HaUebaBaseline bl : savedBaselines) {
                assertThat(bl.getGroupKey()).isEqualTo("eng-group");
                assertThat(bl.getComputedOn()).isEqualTo(today);
                assertThat(bl.getBaselineMean()).isEqualTo(20.0);
                assertThat(bl.getSampleSize()).isEqualTo(3);
                assertThat(bl.getTenantId()).isEqualTo("tenant-X");
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 7. subnet24 edge cases
    // ═══════════════════════════════════════════════════════════════════════════

    @Nested
    @DisplayName("subnet24 edge cases")
    class Subnet24EdgeCases {

        @Test
        @DisplayName("null input returns 0.0.0.0/24")
        void subnet24_null_returnsDefault() {
            assertThat(HaUebaBaselineService.subnet24(null)).isEqualTo("0.0.0.0/24");
        }

        @Test
        @DisplayName("empty string returns 0.0.0.0/24")
        void subnet24_empty_returnsDefault() {
            assertThat(HaUebaBaselineService.subnet24("")).isEqualTo("0.0.0.0/24");
        }

        @Test
        @DisplayName("valid IPv4 '10.20.30.40' returns '10.20.30.0/24'")
        void subnet24_validIp_returnsSubnet() {
            assertThat(HaUebaBaselineService.subnet24("10.20.30.40")).isEqualTo("10.20.30.0/24");
        }

        @Test
        @DisplayName("IP ending in .0 returns correct subnet")
        void subnet24_ipEndingInZero_returnsSubnet() {
            assertThat(HaUebaBaselineService.subnet24("192.168.1.0")).isEqualTo("192.168.1.0/24");
        }

        @Test
        @DisplayName("IP ending in .255 returns correct subnet")
        void subnet24_ipEndingIn255_returnsSubnet() {
            assertThat(HaUebaBaselineService.subnet24("192.168.1.255")).isEqualTo("192.168.1.0/24");
        }

        @Test
        @DisplayName("single octet without dots gets .0/24 appended")
        void subnet24_noDot_appendsSuffix() {
            assertThat(HaUebaBaselineService.subnet24("10")).isEqualTo("10.0/24");
        }
    }
}
