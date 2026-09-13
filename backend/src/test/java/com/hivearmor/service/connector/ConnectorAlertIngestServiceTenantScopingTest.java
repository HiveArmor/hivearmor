package com.hivearmor.service.connector;

import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.connector.HaConnectorAlertStagingRepository;
import com.hivearmor.repository.connector.HaConnectorInstanceRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * SPEC-04 (W1b) PR-1b.2c-i — the staged-alert list read is scoped to the caller's
 * tenant (new staging rows inherit tenant_id from the parent connector instance at
 * ingest). The unscoped by-instance finder must not be used on the request-path read.
 */
@ExtendWith(MockitoExtension.class)
class ConnectorAlertIngestServiceTenantScopingTest {

    private static final long TENANT_A = 101L;

    @Mock private HaConnectorRegistry registry;
    @Mock private HaConnectorInstanceRepository instanceRepository;
    @Mock private HaConnectorAlertStagingRepository stagingRepository;
    @Mock private HaConnectorInstanceService instanceService;

    private ConnectorAlertIngestService service;

    @BeforeEach
    void setUp() {
        service = new ConnectorAlertIngestService(registry, instanceRepository, stagingRepository, instanceService);
    }

    @AfterEach
    void cleanup() {
        TenantContext.clear();
    }

    @Test
    void listStagedScopesToCallerTenant() {
        TenantContext.set(TENANT_A, "acme");
        when(stagingRepository.findByTenantIdAndConnectorInstanceIdOrderByIngestedAtDesc(
                eq(TENANT_A), eq(7L), any())).thenReturn(List.of());

        List<?> out = service.listStaged(7L, 50);

        assertThat(out).isEmpty();
        verify(stagingRepository).findByTenantIdAndConnectorInstanceIdOrderByIngestedAtDesc(eq(TENANT_A), eq(7L), any());
    }

    @Test
    void listStagedSingleTenantUsesTenantZero() {
        // No tenant context = single-tenant => requireTenant() returns 0L.
        when(stagingRepository.findByTenantIdAndConnectorInstanceIdOrderByIngestedAtDesc(
                eq(0L), eq(7L), any())).thenReturn(List.of());

        service.listStaged(7L, 50);

        verify(stagingRepository).findByTenantIdAndConnectorInstanceIdOrderByIngestedAtDesc(eq(0L), eq(7L), any());
    }
}
