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
import org.springframework.security.access.AccessDeniedException;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class HaEdrIsolationServiceTest {

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

    @Test
    void listIsolatedHostsMapsEntityAndFiltersByStatus() {
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

        when(isolationRepository.findByStatus(eq("ACTIVE"), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(entity)));

        Page<IsolatedHostDTO> page = service.listIsolatedHosts("ACTIVE", 0, 25);

        assertThat(page.getContent()).hasSize(1);
        IsolatedHostDTO dto = page.getContent().get(0);
        assertThat(dto.getId()).isEqualTo(42L);
        assertThat(dto.getAgentId()).isEqualTo("agent-1");
        assertThat(dto.getHostname()).isEqualTo("host-a");
        assertThat(dto.getStatus()).isEqualTo("ACTIVE");
        assertThat(dto.getReason()).isEqualTo("ransomware containment");
        assertThat(dto.getActionedBy()).isEqualTo("soc.manager");

        ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(isolationRepository).findByStatus(eq("ACTIVE"), pageableCaptor.capture());
        assertThat(pageableCaptor.getValue().getPageNumber()).isZero();
        assertThat(pageableCaptor.getValue().getPageSize()).isEqualTo(25);
        assertThat(pageableCaptor.getValue().getSort().getOrderFor("isolatedAt")).isNotNull();
    }

    @Test
    void listIsolatedHostsWithoutStatusUsesFindAll() {
        when(isolationRepository.findAll(any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of()));

        Page<IsolatedHostDTO> page = service.listIsolatedHosts(null, 1, 10);

        assertThat(page.getContent()).isEmpty();
        verify(isolationRepository).findAll(any(Pageable.class));
    }

    // -------------------------------------------------------------------------
    // SPEC-04 (W1b) — MSSP fail-closed: no tenant_id column yet, so an MSSP list
    // read must be denied rather than return every tenant's isolated hosts.
    // -------------------------------------------------------------------------

    @Test
    void listIsolatedHostsDeniedForMsspTenantContext() {
        TenantContext.set(7L, "acme");

        assertThatThrownBy(() -> service.listIsolatedHosts("ACTIVE", 0, 25))
            .isInstanceOf(AccessDeniedException.class);

        // The repository must never be queried for an MSSP request on this list.
        org.mockito.Mockito.verifyNoInteractions(isolationRepository);
    }

    @Test
    void listIsolatedHostsDeniedForMsspEvenWithoutStatus() {
        TenantContext.set(7L, "acme");

        assertThatThrownBy(() -> service.listIsolatedHosts(null, 0, 25))
            .isInstanceOf(AccessDeniedException.class);
        org.mockito.Mockito.verifyNoInteractions(isolationRepository);
    }
}
