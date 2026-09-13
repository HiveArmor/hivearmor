package com.hivearmor.service;

import com.hivearmor.domain.edr.UtmEdrIsolation;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.edr.UtmEdrIsolationRepository;
import com.hivearmor.service.dto.IsolatedHostDTO;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * SPEC-04 (W1b) PR-1b.2a — proves the isolated-host list is tenant-scoped now that
 * hive_edr_isolation carries an authoritative tenant_id. Single-tenant reads use
 * tenant 0; MSSP reads scope to the caller's tenant (no longer fail-closed); the
 * unscoped findAll()/findByStatus() paths must never be used.
 */
@ExtendWith(MockitoExtension.class)
class HaEdrIsolationServiceTest {

    private static final long TENANT_A = 101L;

    @Mock
    private UtmEdrIsolationRepository isolationRepository;

    private HaEdrIsolationService service;

    @BeforeEach
    void setUp() {
        service = new HaEdrIsolationService(isolationRepository);
    }

    @AfterEach
    void cleanup() {
        TenantContext.clear();
    }

    private UtmEdrIsolation sampleRow() {
        UtmEdrIsolation entity = new UtmEdrIsolation();
        entity.setId(42L);
        entity.setAgentId("agent-1");
        entity.setHostname("host-a");
        entity.setIsolationType("FULL");
        entity.setStatus("ACTIVE");
        entity.setReason("ransomware containment");
        entity.setAllowedIps("10.0.0.1");
        entity.setIsolatedAt(Instant.parse("2026-08-25T03:00:00Z"));
        entity.setActionedBy("soc.manager");
        entity.setEdrEventId(99L);
        return entity;
    }

    @Test
    void singleTenantListScopesToTenantZeroAndMapsEntity() {
        // Single-tenant: no tenant context => requireTenant() returns 0L.
        when(isolationRepository.findByTenantIdAndStatus(eq(0L), eq("ACTIVE"), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(sampleRow())));

        Page<IsolatedHostDTO> page = service.listIsolatedHosts("ACTIVE", 0, 25);

        assertThat(page.getContent()).hasSize(1);
        IsolatedHostDTO dto = page.getContent().get(0);
        assertThat(dto.getId()).isEqualTo(42L);
        assertThat(dto.getAgentId()).isEqualTo("agent-1");
        assertThat(dto.getStatus()).isEqualTo("ACTIVE");

        ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(isolationRepository).findByTenantIdAndStatus(eq(0L), eq("ACTIVE"), pageableCaptor.capture());
        assertThat(pageableCaptor.getValue().getSort().getOrderFor("isolatedAt")).isNotNull();
        // Unscoped reads must never be used.
        verify(isolationRepository, never()).findByStatus(any(), any());
        verify(isolationRepository, never()).findAll(any(Pageable.class));
    }

    @Test
    void singleTenantListWithoutStatusScopesToTenantZero() {
        when(isolationRepository.findByTenantId(eq(0L), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of()));

        Page<IsolatedHostDTO> page = service.listIsolatedHosts(null, 1, 10);

        assertThat(page.getContent()).isEmpty();
        verify(isolationRepository).findByTenantId(eq(0L), any(Pageable.class));
        verify(isolationRepository, never()).findAll(any(Pageable.class));
    }

    @Test
    void msspListScopesToCallerTenantNotAllTenants() {
        TenantContext.set(TENANT_A, "acme");
        when(isolationRepository.findByTenantIdAndStatus(eq(TENANT_A), eq("ACTIVE"), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(sampleRow())));

        Page<IsolatedHostDTO> page = service.listIsolatedHosts("ACTIVE", 0, 25);

        assertThat(page.getContent()).hasSize(1);
        // Scoped to the caller's tenant; the unscoped finders are never called.
        verify(isolationRepository).findByTenantIdAndStatus(eq(TENANT_A), eq("ACTIVE"), any(Pageable.class));
        verify(isolationRepository, never()).findByStatus(any(), any());
        verify(isolationRepository, never()).findAll(any(Pageable.class));
    }

    @Test
    void msspListWithoutStatusScopesToCallerTenant() {
        TenantContext.set(TENANT_A, "acme");
        when(isolationRepository.findByTenantId(eq(TENANT_A), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(sampleRow())));

        Page<IsolatedHostDTO> page = service.listIsolatedHosts(null, 0, 25);

        assertThat(page.getContent()).hasSize(1);
        verify(isolationRepository).findByTenantId(eq(TENANT_A), any(Pageable.class));
        verify(isolationRepository, never()).findAll(any(Pageable.class));
    }
}
