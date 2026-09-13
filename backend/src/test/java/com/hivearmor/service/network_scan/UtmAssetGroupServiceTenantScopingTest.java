package com.hivearmor.service.network_scan;

import com.hivearmor.domain.network_scan.UtmAssetGroup;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.UtmAssetMetricsRepository;
import com.hivearmor.repository.network_scan.UtmAssetGroupRepository;
import com.hivearmor.repository.network_scan.UtmNetworkScanRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * SPEC-04 (W1b, FU-1) — UtmAssetGroup is tenant-scoped: create stamps the caller's
 * tenant server-side, update verifies+preserves it, and a cross-tenant by-id
 * load/delete reads as not found (no disclosure, no cross-tenant delete).
 */
@ExtendWith(MockitoExtension.class)
class UtmAssetGroupServiceTenantScopingTest {

    private static final long TENANT_A = 101L;

    @Mock private UtmAssetGroupRepository repository;
    @Mock private UtmAssetMetricsRepository metricsRepository;
    @Mock private UtmNetworkScanRepository networkScanRepository;
    @Mock private EntityManager em;

    private UtmAssetGroupService service;

    @BeforeEach
    void setUp() {
        service = new UtmAssetGroupService(repository, metricsRepository, networkScanRepository, em);
    }

    @AfterEach
    void cleanup() {
        TenantContext.clear();
    }

    private UtmAssetGroup group(Long id, Long tenantId) {
        UtmAssetGroup g = new UtmAssetGroup();
        g.setId(id);
        g.setTenantId(tenantId);
        g.setGroupName("grp-" + id);
        return g;
    }

    @Test
    void createStampsCallerTenantIgnoringPayload() {
        TenantContext.set(TENANT_A, "acme");
        UtmAssetGroup incoming = new UtmAssetGroup();
        incoming.setGroupName("new");
        incoming.setTenantId(999L); // spoofed payload tenant — must be overwritten
        when(repository.save(any(UtmAssetGroup.class))).thenAnswer(i -> i.getArgument(0));

        service.save(incoming);

        ArgumentCaptor<UtmAssetGroup> captor = ArgumentCaptor.forClass(UtmAssetGroup.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getTenantId()).isEqualTo(TENANT_A);
    }

    @Test
    void updateVerifiesAndPreservesTenant() {
        TenantContext.set(TENANT_A, "acme");
        when(repository.findByIdAndTenantId(5L, TENANT_A)).thenReturn(Optional.of(group(5L, TENANT_A)));
        when(repository.save(any(UtmAssetGroup.class))).thenAnswer(i -> i.getArgument(0));

        UtmAssetGroup incoming = group(5L, 999L); // spoofed tenant in payload
        service.save(incoming);

        ArgumentCaptor<UtmAssetGroup> captor = ArgumentCaptor.forClass(UtmAssetGroup.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getTenantId()).isEqualTo(TENANT_A);
    }

    @Test
    void updateCrossTenantIdReadsAsNotFound() {
        TenantContext.set(TENANT_A, "acme");
        when(repository.findByIdAndTenantId(5L, TENANT_A)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.save(group(5L, TENANT_A)))
            .isInstanceOf(EntityNotFoundException.class);
        verify(repository, never()).save(any());
    }

    @Test
    void findOneScopesToCallerTenant() {
        TenantContext.set(TENANT_A, "acme");
        when(repository.findByIdAndTenantId(5L, TENANT_A)).thenReturn(Optional.of(group(5L, TENANT_A)));

        assertThat(service.findOne(5L)).isPresent();
        verify(repository).findByIdAndTenantId(eq(5L), eq(TENANT_A));
    }

    @Test
    void deleteCrossTenantIdReadsAsNotFoundAndDoesNotDelete() {
        TenantContext.set(TENANT_A, "acme");
        when(repository.findByIdAndTenantId(5L, TENANT_A)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.delete(5L)).isInstanceOf(EntityNotFoundException.class);
        verify(repository, never()).deleteById(any());
    }
}
