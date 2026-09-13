package com.hivearmor.service.connector;

import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.connector.HaConnectorInstanceRepository;
import com.hivearmor.security.AesGcmEncryptionService;
import com.hivearmor.service.dto.connector.ConnectorInstanceDTO;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * SPEC-04 (W1b) PR-1b.2b — HaConnectorInstanceService request-path reads/mutations
 * are tenant-scoped. These tests target the tenant contract only (scoped finders),
 * so they avoid the connector-schema config machinery.
 */
@ExtendWith(MockitoExtension.class)
class HaConnectorInstanceServiceTenantScopingTest {

    private static final long TENANT_A = 101L;

    @Mock private HaConnectorRegistry registry;
    @Mock private HaConnectorInstanceRepository repository;
    @Mock private AesGcmEncryptionService encryption;

    private HaConnectorInstanceService service;

    @BeforeEach
    void setUp() {
        service = new HaConnectorInstanceService(registry, repository, encryption);
    }

    @AfterEach
    void cleanup() {
        TenantContext.clear();
    }

    @Test
    void listInstancesScopesToCallerTenant() {
        TenantContext.set(TENANT_A, "acme");
        // Empty result avoids toDto()/registry — the tenant contract is the finder used.
        when(repository.findByTenantIdOrderByNameAsc(TENANT_A)).thenReturn(List.of());

        List<ConnectorInstanceDTO> out = service.listInstances();

        assertThat(out).isEmpty();
        verify(repository).findByTenantIdOrderByNameAsc(TENANT_A);
        verify(repository, never()).findAllByOrderByNameAsc();
    }

    @Test
    void getInstanceCrossTenantIdReadsAsNotFound() {
        TenantContext.set(TENANT_A, "acme");
        // Row belongs to another tenant → scoped finder returns empty → not found
        // before any registry/DTO work.
        when(repository.findByIdAndTenantId(5L, TENANT_A)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getInstance(5L))
            .isInstanceOf(IllegalArgumentException.class);
        verify(repository).findByIdAndTenantId(5L, TENANT_A);
    }

    @Test
    void deleteCrossTenantIdReadsAsNotFoundAndDoesNotDelete() {
        TenantContext.set(TENANT_A, "acme");
        when(repository.findByIdAndTenantId(5L, TENANT_A)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.delete(5L))
            .isInstanceOf(IllegalArgumentException.class);
        verify(repository, never()).delete(any());
    }
}
