package com.hivearmor.service.collectors;

import com.hivearmor.domain.collector.UtmCollector;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.collector.UtmCollectorRepository;
import agent.CollectorOuterClass;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * SPEC-04 (W1b) PR-1b.2c-ii — collectors carry an authoritative tenant_id set from
 * the agent-manager Collector proto at sync, and the request-path by-id load is
 * tenant-scoped.
 */
@ExtendWith(MockitoExtension.class)
class UtmCollectorServiceTenantScopingTest {

    private static final long TENANT_A = 101L;

    @Mock private UtmCollectorRepository repository;

    private UtmCollectorService service;

    @BeforeEach
    void setUp() {
        service = new UtmCollectorService(repository);
    }

    @AfterEach
    void cleanup() {
        TenantContext.clear();
    }

    @Test
    void saveCollectorStampsTenantFromProto() {
        CollectorOuterClass.Collector proto = CollectorOuterClass.Collector.newBuilder()
            .setId(7)
            .setCollectorKey("k")
            .setIp("10.0.0.1")
            .setHostname("host-a")
            .setVersion("1.0")
            .setLastSeen("2026-09-01 00:00:00")
            .setTenantId(TENANT_A)
            .build();
        when(repository.findById(7L)).thenReturn(Optional.empty());
        when(repository.save(any(UtmCollector.class))).thenAnswer(i -> i.getArgument(0));

        service.saveCollector(proto);

        ArgumentCaptor<UtmCollector> captor = ArgumentCaptor.forClass(UtmCollector.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getTenantId()).isEqualTo(TENANT_A);
    }

    @Test
    void findByIdScopesToCallerTenant() {
        TenantContext.set(TENANT_A, "acme");
        UtmCollector c = new UtmCollector();
        c.setId(7L);
        c.setTenantId(TENANT_A);
        when(repository.findByIdAndTenantId(7L, TENANT_A)).thenReturn(Optional.of(c));

        assertThat(service.findById(7L)).isPresent();
        verify(repository).findByIdAndTenantId(eq(7L), eq(TENANT_A));
    }

    @Test
    void findByIdCrossTenantReadsAsEmpty() {
        TenantContext.set(TENANT_A, "acme");
        // Row belongs to another tenant → scoped finder returns empty.
        when(repository.findByIdAndTenantId(7L, TENANT_A)).thenReturn(Optional.empty());

        assertThat(service.findById(7L)).isEmpty();
        verify(repository).findByIdAndTenantId(eq(7L), eq(TENANT_A));
    }
}
