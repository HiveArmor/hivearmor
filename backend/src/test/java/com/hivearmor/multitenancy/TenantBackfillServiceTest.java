package com.hivearmor.multitenancy;

import com.hivearmor.domain.HaClient;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.service.agent_manager.AgentService;
import com.hivearmor.service.dto.agent_manager.AgentDTO;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Collections;
import java.util.List;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/**
 * P0A2-B tenant backfill service tests. Covers the single-tenant SET-0 path, the MSSP
 * per-tenant lambda (agent-linked tables stamped, UBA tables NOT host-matched), and the
 * transient-failure accounting that gates the irreversible NOT-NULL decision.
 */
class TenantBackfillServiceTest {

    private static final List<String> AGENT_TABLES = List.of(
        "hive_edr_event", "hive_edr_quarantine", "ha_edr_quarantine", "hive_alert_response_rule_execution");
    private static final List<String> UBA_TABLES = List.of("hive_uba_anomaly", "hive_uba_entity_risk");

    @Test
    void singleTenant_setsAllSixTablesToZero_withoutConsultingManager() {
        EntityManager em = mock(EntityManager.class);
        TenantScopedBackgroundExecutor executor = mock(TenantScopedBackgroundExecutor.class);
        AgentService agentService = mock(AgentService.class);
        HaClientRepository clients = mock(HaClientRepository.class);
        when(clients.findByMsspManagedTrueAndClientPrefixIsNotNull()).thenReturn(Collections.emptyList());

        Query q = mock(Query.class);
        when(em.createNativeQuery(anyString())).thenReturn(q);
        when(q.executeUpdate()).thenReturn(3);
        when(q.getSingleResult()).thenReturn(0L);

        var results = new TenantBackfillService(em, executor, agentService, clients).backfill();

        // 4 agent-linked + 2 UBA tables all covered on single-tenant.
        assertThat(results).extracting(TenantBackfillService.TableResult::table)
            .containsExactlyInAnyOrderElementsOf(
                java.util.stream.Stream.concat(AGENT_TABLES.stream(), UBA_TABLES.stream()).toList());
        assertThat(results).allSatisfy(r -> {
            assertThat(r.updated()).isEqualTo(3);
            assertThat(r.remainingNull()).isEqualTo(0);
            assertThat(r.failedTenants()).isEqualTo(0);
        });
        verifyNoInteractions(executor);
        verify(agentService, never()).getInstalledAgents();

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(em, atLeast(6)).createNativeQuery(sql.capture());
        assertThat(sql.getAllValues()).anyMatch(s -> s.contains("SET tenant_id = 0 WHERE tenant_id IS NULL"));
    }

    @Test
    void mssp_perTenantLambda_stampsAgentTablesByTenantAgents_andDoesNotHostMatchUba() {
        EntityManager em = mock(EntityManager.class);
        TenantScopedBackgroundExecutor executor = mock(TenantScopedBackgroundExecutor.class);
        AgentService agentService = mock(AgentService.class);
        HaClientRepository clients = mock(HaClientRepository.class);

        HaClient t = new HaClient();
        t.setId(101L);
        when(clients.findByMsspManagedTrueAndClientPrefixIsNotNull()).thenReturn(List.of(t));

        // One agent for tenant 101 (AgentDTO has no no-arg ctor — mock it).
        AgentDTO a = mock(AgentDTO.class);
        when(a.getHostname()).thenReturn("web01");
        when(a.getId()).thenReturn(1001);
        when(agentService.getInstalledAgents()).thenReturn(List.of(a));

        Query q = mock(Query.class);
        when(em.createNativeQuery(anyString())).thenReturn(q);
        when(q.setParameter(anyString(), any())).thenReturn(q);
        when(q.executeUpdate()).thenReturn(2);
        when(q.getSingleResult()).thenReturn(0L);

        // Capture and INVOKE the per-tenant lambda the service hands to the executor.
        ArgumentCaptor<Consumer<HaClient>> lambda = ArgumentCaptor.forClass(Consumer.class);
        doNothing().when(executor).runForEachTenant(anyString(), lambda.capture());

        new TenantBackfillService(em, executor, agentService, clients).backfill();

        // Run the captured lambda for tenant 101 to exercise the real body.
        lambda.getValue().accept(t);

        // Every UPDATE issued in the lambda binds :tid + :keys and targets an AGENT table only.
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(em, atLeastOnce()).createNativeQuery(sql.capture());
        List<String> updates = sql.getAllValues().stream().filter(s -> s.startsWith("UPDATE")).toList();
        assertThat(updates).isNotEmpty();
        assertThat(updates).allMatch(s -> s.contains(":tid") && s.contains("IN (:keys)") && s.contains("tenant_id IS NULL"));
        // No UPDATE targets a UBA table via host-match (C1) — UBA is excluded from the lambda.
        assertThat(updates).noneMatch(s -> s.contains("hive_uba_anomaly") || s.contains("hive_uba_entity_risk"));
        verify(q, atLeastOnce()).setParameter("tid", 101L);
    }

    @Test
    void mssp_agentEnumerationFailure_isSwallowedInLambda_notPropagated() {
        EntityManager em = mock(EntityManager.class);
        TenantScopedBackgroundExecutor executor = mock(TenantScopedBackgroundExecutor.class);
        AgentService agentService = mock(AgentService.class);
        HaClientRepository clients = mock(HaClientRepository.class);

        HaClient t = new HaClient();
        t.setId(202L);
        when(clients.findByMsspManagedTrueAndClientPrefixIsNotNull()).thenReturn(List.of(t));
        when(agentService.getInstalledAgents()).thenThrow(new RuntimeException("manager unreachable"));

        Query q = mock(Query.class);
        when(em.createNativeQuery(anyString())).thenReturn(q);
        when(q.getSingleResult()).thenReturn(5L); // rows remain NULL because the tenant failed

        ArgumentCaptor<Consumer<HaClient>> lambda = ArgumentCaptor.forClass(Consumer.class);
        doNothing().when(executor).runForEachTenant(anyString(), lambda.capture());

        new TenantBackfillService(em, executor, agentService, clients).backfill();

        // Contract: a thrown getInstalledAgents must NOT propagate out of the per-tenant
        // lambda (one tenant's manager blip can't abort the whole run). No UPDATE is issued
        // for the failed tenant.
        org.assertj.core.api.Assertions.assertThatCode(() -> lambda.getValue().accept(t))
            .doesNotThrowAnyException();
        verify(q, never()).executeUpdate();
    }

    // ---- enforceNotNull() ----

    /**
     * A clean table (zero NULLs) is ALTERed to NOT NULL; a table that still has NULLs is
     * SKIPPED (fail-safe, no ALTER). Verifies ALTER runs exactly once per enforced table.
     */
    @Test
    void enforceNotNull_altersCleanTables_skipsNullBearing() {
        EntityManager em = mock(EntityManager.class);
        TenantScopedBackgroundExecutor executor = mock(TenantScopedBackgroundExecutor.class);
        AgentService agentService = mock(AgentService.class);
        HaClientRepository clients = mock(HaClientRepository.class);

        Query nullableQ = mock(Query.class);  // information_schema is_nullable lookup
        Query countQ = mock(Query.class);     // COUNT(*) ... WHERE tenant_id IS NULL
        Query alterQ = mock(Query.class);     // ALTER TABLE ... SET NOT NULL
        when(nullableQ.setParameter(anyString(), any())).thenReturn(nullableQ);

        when(em.createNativeQuery(anyString())).thenAnswer(inv -> {
            String sql = inv.getArgument(0);
            if (sql.startsWith("SELECT is_nullable")) return nullableQ;
            if (sql.startsWith("SELECT COUNT(*)")) return countQ;
            return alterQ;
        });
        // Every table currently nullable ('YES') so the count gate decides.
        when(nullableQ.getResultList()).thenReturn(List.of("YES"));
        // First table clean (0 nulls, enforce); the other five still have 2 nulls (skip).
        when(countQ.getSingleResult()).thenReturn(0L, 2L, 2L, 2L, 2L, 2L);
        when(alterQ.executeUpdate()).thenReturn(0);

        var svc = new TenantBackfillService(em, executor, agentService, clients);
        var results = svc.enforceNotNull();

        assertThat(results).hasSize(6);
        long enforcedCount = results.stream().filter(TenantBackfillService.EnforceResult::enforced).count();
        assertThat(enforcedCount).isEqualTo(1);
        // Skipped (dirty) tables report their remaining NULL count and were NOT altered.
        assertThat(results).filteredOn(r -> !r.enforced())
            .allSatisfy(r -> assertThat(r.remainingNull()).isEqualTo(2));
        // ALTER ran exactly once — only for the clean table, never for a dirty one (fail-safe).
        verify(alterQ, times(1)).executeUpdate();
    }
}
