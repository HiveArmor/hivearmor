package com.hivearmor.service.hunt.crosstab;

import com.hivearmor.domain.ueba.HaUebaDeviation;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.ueba.HaUebaDeviationRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link CrosstabDeviationResolver} (P2 Strand B). Pure logic over a mocked repository —
 * runs under the JUnit console launcher like the other crosstab tests.
 */
class CrosstabDeviationResolverTest {

    private final HaUebaDeviationRepository repo = mock(HaUebaDeviationRepository.class);
    private final CrosstabDeviationResolver resolver = new CrosstabDeviationResolver(repo);

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    private HaUebaDeviation dev(String user, String metric, double z, Instant runTs) {
        HaUebaDeviation d = new HaUebaDeviation();
        d.setUserId(user);
        d.setMetricName(metric);
        d.setZScore(z);
        d.setRunTs(runTs);
        return d;
    }

    @Test
    @DisplayName("only a user.name row axis is eligible")
    void appliesOnlyToUserAxis() {
        assertThat(resolver.applies("user.name")).isTrue();
        assertThat(resolver.applies("host.name")).isFalse();
        assertThat(resolver.resolve("host.name", List.of("a", "b"))).isNull();
    }

    @Test
    @DisplayName("picks the max-|z| metric from the user's most recent run; null for users with no deviation")
    void picksMostAnomalousLatest() {
        TenantContext.set("t1");
        Instant older = Instant.parse("2026-09-07T00:00:00Z");
        Instant latest = Instant.parse("2026-09-08T00:00:00Z");
        // alice: latest run has two metrics; the -3.5 (|3.5|) beats +2.0.
        when(repo.findAllByTenantIdAndUserIdOrderByRunTsAsc(eq("t1"), eq("alice"))).thenReturn(List.of(
            dev("alice", "logon_count_per_day", 9.9, older),          // older run — ignored
            dev("alice", "unique_src_ips", 2.0, latest),
            dev("alice", "failed_logon_ratio", -3.5, latest)
        ));
        when(repo.findAllByTenantIdAndUserIdOrderByRunTsAsc(eq("t1"), eq("bob"))).thenReturn(List.of());

        var out = resolver.resolve("user.name", List.of("alice", "bob"));
        assertThat(out).hasSize(2);
        assertThat(out.get(0)).isNotNull();
        assertThat(out.get(0).getMetric()).isEqualTo("failed_logon_ratio");
        assertThat(out.get(0).getZScore()).isEqualTo(-3.5);
        assertThat(out.get(1)).isNull(); // bob has no deviation → no fabricated score
    }
}
