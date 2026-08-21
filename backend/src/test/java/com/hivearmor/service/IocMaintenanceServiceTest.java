package com.hivearmor.service;

import com.hivearmor.domain.HiveThreatIoc;
import com.hivearmor.repository.HiveThreatIocRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.*;

/**
 * HiveArmor unit tests for IocMaintenanceService.
 */
@ExtendWith(MockitoExtension.class)
class IocMaintenanceServiceTest {

    @Mock
    private HiveThreatIocRepository iocRepository;

    private IocMaintenanceService service;

    @BeforeEach
    void setUp() {
        service = new IocMaintenanceService(iocRepository);
    }

    @Test
    void deduplicateIocs_marksPrimaryForHighestConfidence() {
        HiveThreatIoc high = new HiveThreatIoc();
        high.setId(1L);
        high.setIocType("ip");
        high.setIocValue("1.2.3.4");
        high.setConfidence(80);
        high.setActive(true);

        HiveThreatIoc low = new HiveThreatIoc();
        low.setId(2L);
        low.setIocType("ip");
        low.setIocValue("1.2.3.4");
        low.setConfidence(40);
        low.setActive(true);

        when(iocRepository.findAll()).thenReturn(Arrays.asList(high, low));

        service.deduplicateIocs();

        verify(iocRepository).saveAll(anyList());
        assertThat(high.getPrimaryIoc()).isTrue();
        assertThat(low.getPrimaryIoc()).isFalse();
    }

    @Test
    void applyConfidenceDecay_reducesConfidenceByFactor() {
        HiveThreatIoc staleIoc = new HiveThreatIoc();
        staleIoc.setId(1L);
        staleIoc.setConfidence(100);
        staleIoc.setActive(true);
        staleIoc.setLastSeen(Instant.now().minus(40, ChronoUnit.DAYS));

        when(iocRepository.findActiveOlderThan(any(Instant.class)))
            .thenReturn(Collections.singletonList(staleIoc));

        service.applyConfidenceDecay();

        assertThat(staleIoc.getConfidence()).isEqualTo(90); // floor(100 * 0.9)
    }

    @Test
    void applyConfidenceDecay_doesNotGoBelowMinConfidence() {
        HiveThreatIoc almostExpired = new HiveThreatIoc();
        almostExpired.setId(1L);
        almostExpired.setConfidence(10);
        almostExpired.setActive(true);

        when(iocRepository.findActiveOlderThan(any(Instant.class)))
            .thenReturn(Collections.singletonList(almostExpired));

        service.applyConfidenceDecay();

        assertThat(almostExpired.getConfidence()).isEqualTo(10); // clamped at MIN_CONFIDENCE
    }

    @Test
    void expireStaleIocs_deactivatesExpiredByTimestamp() {
        HiveThreatIoc expired = new HiveThreatIoc();
        expired.setId(1L);
        expired.setActive(true);
        expired.setExpiresAt(Instant.now().minus(1, ChronoUnit.HOURS));

        when(iocRepository.findAll()).thenReturn(Collections.singletonList(expired));

        service.expireStaleIocs();

        assertThat(expired.getActive()).isFalse();
        verify(iocRepository).saveAll(anyList());
    }

    @Test
    void expireStaleIocs_skipsActiveNonExpiredIocs() {
        HiveThreatIoc fresh = new HiveThreatIoc();
        fresh.setId(1L);
        fresh.setActive(true);
        fresh.setConfidence(70);
        fresh.setLastSeen(Instant.now());

        when(iocRepository.findAll()).thenReturn(Collections.singletonList(fresh));

        service.expireStaleIocs();

        assertThat(fresh.getActive()).isTrue();
        verify(iocRepository, never()).saveAll(anyList());
    }
}
