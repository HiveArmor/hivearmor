package com.hivearmor.multitenancy;

import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.service.agent_manager.AgentService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/**
 * P0A2-B — verifies the single-tenant backfill path: no MSSP clients present means every
 * NULL row is set to the tenant-0 sentinel via a constant, injection-free UPDATE per table,
 * and the manager is never consulted (no per-tenant agent enumeration on single-tenant).
 */
class TenantBackfillServiceTest {

    @Test
    void singleTenant_setsAllNullRowsToZero_perTable_withoutConsultingManager() {
        EntityManager em = mock(EntityManager.class);
        TenantScopedBackgroundExecutor executor = mock(TenantScopedBackgroundExecutor.class);
        AgentService agentService = mock(AgentService.class);
        HaClientRepository clients = mock(HaClientRepository.class);

        // Single-tenant: no MSSP-managed clients with a prefix.
        when(clients.findByMsspManagedTrueAndClientPrefixIsNotNull()).thenReturn(Collections.emptyList());

        Query q = mock(Query.class);
        when(em.createNativeQuery(anyString())).thenReturn(q);
        when(q.executeUpdate()).thenReturn(3);          // pretend 3 rows updated per table
        when(q.getSingleResult()).thenReturn(0L);       // no NULLs remain

        TenantBackfillService svc = new TenantBackfillService(em, executor, agentService, clients);
        List<TenantBackfillService.TableResult> results = svc.backfill();

        // One backfill + one count per agent-linked table (6 tables).
        assertThat(results).hasSize(6);
        assertThat(results).allSatisfy(r -> {
            assertThat(r.updated()).isEqualTo(3);
            assertThat(r.remainingNull()).isEqualTo(0);
        });

        // The manager/executor are NOT used on the single-tenant path.
        verifyNoInteractions(executor);
        verify(agentService, never()).getInstalledAgents();

        // Every UPDATE is the constant tenant-0 form with no injected/dynamic value.
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(em, atLeast(6)).createNativeQuery(sql.capture());
        assertThat(sql.getAllValues())
            .anyMatch(s -> s.contains("SET tenant_id = 0 WHERE tenant_id IS NULL"));
        assertThat(sql.getAllValues())
            .noneMatch(s -> s.contains("--") || s.contains(";") || s.toLowerCase().contains("drop"));
    }

    @Test
    void msspDeployment_routesThroughPerTenantExecutor() {
        EntityManager em = mock(EntityManager.class);
        TenantScopedBackgroundExecutor executor = mock(TenantScopedBackgroundExecutor.class);
        AgentService agentService = mock(AgentService.class);
        HaClientRepository clients = mock(HaClientRepository.class);

        // MSSP: at least one managed client with a prefix.
        com.hivearmor.domain.HaClient t = new com.hivearmor.domain.HaClient();
        when(clients.findByMsspManagedTrueAndClientPrefixIsNotNull()).thenReturn(List.of(t));

        Query q = mock(Query.class);
        when(em.createNativeQuery(anyString())).thenReturn(q);
        when(q.getSingleResult()).thenReturn(0L);

        TenantBackfillService svc = new TenantBackfillService(em, executor, agentService, clients);
        svc.backfill();

        // MSSP path delegates per-tenant resolution to the executor.
        verify(executor).runForEachTenant(anyString(), org.mockito.ArgumentMatchers.<java.util.function.Consumer<com.hivearmor.domain.HaClient>>any());
    }
}
