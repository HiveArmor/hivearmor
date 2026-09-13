package com.hivearmor.service;

import com.hivearmor.domain.HaEdrQuarantine;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.HaEdrQuarantineRepository;
import com.hivearmor.service.dto.QuarantineActionRequest;
import com.hivearmor.service.dto.QuarantineBulkRequest;
import com.hivearmor.service.dto.QuarantinedFileDTO;
import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * SPEC-04 (W1b) — proves the by-id quarantine mutations are tenant-scoped:
 * a cross-tenant (or pre-backfill null-tenant) id can neither be disclosed nor
 * mutated. Plain Mockito unit tests; TenantContext is thread-local so it is set
 * per-test and cleared in {@code @AfterEach}.
 */
@ExtendWith(MockitoExtension.class)
class HaEdrQuarantineServiceTest {

    private static final long TENANT_A = 101L;
    private static final long TENANT_B = 202L;

    @Mock
    private HaEdrQuarantineRepository quarantineRepository;

    private HaEdrQuarantineService service;

    @BeforeEach
    void setUp() {
        service = new HaEdrQuarantineService(quarantineRepository);
    }

    @AfterEach
    void cleanup() {
        TenantContext.clear();
    }

    private HaEdrQuarantine row(Long id, Long tenantId) {
        HaEdrQuarantine e = new HaEdrQuarantine();
        e.setId(id);
        e.setTenantId(tenantId);
        e.setAgentId("agent-1");
        e.setFilename("evil.exe");
        e.setFilePath("/tmp/evil.exe");
        e.setQuarantineTime(Instant.parse("2026-09-01T00:00:00Z"));
        e.setStatus("quarantined");
        return e;
    }

    private QuarantineActionRequest action(String a) {
        QuarantineActionRequest r = new QuarantineActionRequest();
        r.setAction(a);
        return r;
    }

    // ---- applyAction ----

    @Test
    void applyActionSucceedsForOwnTenantRow() {
        TenantContext.set(TENANT_A, "acme");
        HaEdrQuarantine e = row(5L, TENANT_A);
        when(quarantineRepository.findById(5L)).thenReturn(Optional.of(e));
        when(quarantineRepository.save(any(HaEdrQuarantine.class))).thenAnswer(i -> i.getArgument(0));

        QuarantinedFileDTO dto = service.applyAction(5L, action("delete"));

        assertThat(dto.getStatus()).isEqualTo("deleted");
        verify(quarantineRepository).save(any(HaEdrQuarantine.class));
    }

    @Test
    void applyActionDeniesCrossTenantRowWithNotFound() {
        TenantContext.set(TENANT_A, "acme");
        // Row belongs to tenant B — must be treated as not found, and NOT mutated.
        HaEdrQuarantine e = row(5L, TENANT_B);
        when(quarantineRepository.findById(5L)).thenReturn(Optional.of(e));

        assertThatThrownBy(() -> service.applyAction(5L, action("delete")))
            .isInstanceOf(EntityNotFoundException.class);

        verify(quarantineRepository, never()).save(any(HaEdrQuarantine.class));
    }

    @Test
    void applyActionDeniesNullTenantRowWithNotFound() {
        TenantContext.set(TENANT_A, "acme");
        HaEdrQuarantine e = row(5L, null); // pre-backfill row
        when(quarantineRepository.findById(5L)).thenReturn(Optional.of(e));

        assertThatThrownBy(() -> service.applyAction(5L, action("restore")))
            .isInstanceOf(EntityNotFoundException.class);

        verify(quarantineRepository, never()).save(any(HaEdrQuarantine.class));
    }

    // ---- applyBulkAction ----

    @Test
    void applyBulkActionOnlyLoadsOwnTenantRows() {
        TenantContext.set(TENANT_A, "acme");
        // The repository only returns tenant-A rows for the requested ids; a
        // cross-tenant id (7) is simply not returned, so it can never be mutated.
        when(quarantineRepository.findAllByTenantIdAndIdIn(eq(TENANT_A), any()))
            .thenReturn(List.of(row(5L, TENANT_A)));
        when(quarantineRepository.saveAll(any())).thenAnswer(i -> i.getArgument(0));

        QuarantineBulkRequest req = new QuarantineBulkRequest();
        req.setIds(List.of(5L, 7L));
        req.setAction("delete");

        List<QuarantinedFileDTO> result = service.applyBulkAction(req);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getId()).isEqualTo(5L);
        // The un-scoped bulk finder must never be used.
        verify(quarantineRepository, never()).findAllByIdIn(any());
        verify(quarantineRepository).findAllByTenantIdAndIdIn(eq(TENANT_A), any());
    }
}
