package com.hivearmor.service.uba;

import com.hivearmor.domain.HaClient;
import com.hivearmor.domain.uba.UtmUbaAnomaly;
import com.hivearmor.domain.uba.UtmUbaEntityRisk;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantScopedBackgroundExecutor;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.repository.uba.UtmUbaAnomalyRepository;
import com.hivearmor.repository.uba.UtmUbaEntityRiskRepository;
import com.hivearmor.service.elasticsearch.ElasticsearchService;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * P0A2 legacy MSSP UBA tenant resolver tests. The resolver attributes a legacy anomaly to
 * the tenant whose alert index owns its originating alert (id in details_json), leaves
 * zero/ambiguous matches NULL, and lets entity-risk rows inherit their entity's unambiguous
 * tenant.
 */
class UbaSyncServiceLegacyResolveTest {

    private static HaClient tenant(long id, String prefix) {
        HaClient c = new HaClient();
        c.setId(id);
        c.setClientPrefix(prefix);
        return c;
    }

    private static UtmUbaAnomaly anomaly(String alertId, String entityId, String entityType) {
        UtmUbaAnomaly a = new UtmUbaAnomaly();
        a.setEntityId(entityId);
        a.setEntityType(entityType);
        a.setDetailsJson("{\"alertId\":\"" + alertId + "\",\"alertName\":\"x\"}");
        return a;
    }

    private UbaSyncService svc(ElasticsearchService es, UtmUbaAnomalyRepository aRepo,
                              UtmUbaEntityRiskRepository eRepo, MsspIndexResolver resolver,
                              HaClientRepository clients) {
        return new UbaSyncService(es, eRepo, aRepo, mock(TenantScopedBackgroundExecutor.class), resolver, clients);
    }

    @Test
    void uniqueAlertMatch_stampsAnomalyTenant() {
        ElasticsearchService es = mock(ElasticsearchService.class);
        UtmUbaAnomalyRepository aRepo = mock(UtmUbaAnomalyRepository.class);
        UtmUbaEntityRiskRepository eRepo = mock(UtmUbaEntityRiskRepository.class);
        MsspIndexResolver resolver = mock(MsspIndexResolver.class);
        HaClientRepository clients = mock(HaClientRepository.class);

        when(clients.findByMsspManagedTrueAndClientPrefixIsNotNull())
            .thenReturn(List.of(tenant(10L, "acme"), tenant(20L, "globex")));
        when(resolver.resolveIndexPatternForPrefix(eq("alert"), eq("acme"))).thenReturn("v3-hive-alert-acme-*");
        when(resolver.resolveIndexPatternForPrefix(eq("alert"), eq("globex"))).thenReturn("v3-hive-alert-globex-*");

        UtmUbaAnomaly a = anomaly("ALERT-1", "web01", "host");
        when(aRepo.findByTenantIdIsNull()).thenReturn(List.of(a));
        when(eRepo.findByTenantIdIsNull()).thenReturn(List.of());

        // Only acme's index contains ALERT-1.
        when(es.exists(anyList(), eq("v3-hive-alert-acme-*"))).thenReturn(true);
        when(es.exists(anyList(), eq("v3-hive-alert-globex-*"))).thenReturn(false);

        var result = svc(es, aRepo, eRepo, resolver, clients).resolveLegacyUbaTenants();

        assertThat(a.getTenantId()).isEqualTo(10L);
        verify(aRepo).save(a);
        assertThat(result.anomaliesResolved()).isEqualTo(1);
        assertThat(result.anomaliesUnresolved()).isZero();
    }

    @Test
    void ambiguousMatch_leavesAnomalyNull() {
        ElasticsearchService es = mock(ElasticsearchService.class);
        UtmUbaAnomalyRepository aRepo = mock(UtmUbaAnomalyRepository.class);
        UtmUbaEntityRiskRepository eRepo = mock(UtmUbaEntityRiskRepository.class);
        MsspIndexResolver resolver = mock(MsspIndexResolver.class);
        HaClientRepository clients = mock(HaClientRepository.class);

        when(clients.findByMsspManagedTrueAndClientPrefixIsNotNull())
            .thenReturn(List.of(tenant(10L, "acme"), tenant(20L, "globex")));
        when(resolver.resolveIndexPatternForPrefix(eq("alert"), anyString()))
            .thenAnswer(i -> "v3-hive-alert-" + i.getArgument(1) + "-*");

        UtmUbaAnomaly a = anomaly("ALERT-1", "web01", "host");
        when(aRepo.findByTenantIdIsNull()).thenReturn(List.of(a));
        when(eRepo.findByTenantIdIsNull()).thenReturn(List.of());

        // BOTH tenant indices claim the alert id → ambiguous → must NOT guess.
        when(es.exists(anyList(), anyString())).thenReturn(true);

        var result = svc(es, aRepo, eRepo, resolver, clients).resolveLegacyUbaTenants();

        assertThat(a.getTenantId()).isNull();
        verify(aRepo, never()).save(any());
        assertThat(result.anomaliesResolved()).isZero();
        assertThat(result.anomaliesUnresolved()).isEqualTo(1);
    }

    @Test
    void entityRisk_inheritsUnambiguousTenantFromAnomalies() {
        ElasticsearchService es = mock(ElasticsearchService.class);
        UtmUbaAnomalyRepository aRepo = mock(UtmUbaAnomalyRepository.class);
        UtmUbaEntityRiskRepository eRepo = mock(UtmUbaEntityRiskRepository.class);
        MsspIndexResolver resolver = mock(MsspIndexResolver.class);
        HaClientRepository clients = mock(HaClientRepository.class);

        when(clients.findByMsspManagedTrueAndClientPrefixIsNotNull())
            .thenReturn(List.of(tenant(10L, "acme")));
        when(aRepo.findByTenantIdIsNull()).thenReturn(List.of());

        UtmUbaEntityRisk risk = new UtmUbaEntityRisk();
        risk.setEntityId("web01");
        risk.setEntityType("host");
        when(eRepo.findByTenantIdIsNull()).thenReturn(List.of(risk));

        // One stamped anomaly for the same entity, tenant 10 → inherit.
        UtmUbaAnomaly stamped = anomaly("ALERT-1", "web01", "host");
        stamped.setTenantId(10L);
        when(aRepo.findByEntityIdAndEntityTypeAndTenantIdIsNotNull("web01", "host"))
            .thenReturn(List.of(stamped));

        var result = svc(es, aRepo, eRepo, resolver, clients).resolveLegacyUbaTenants();

        assertThat(risk.getTenantId()).isEqualTo(10L);
        verify(eRepo).save(risk);
        assertThat(result.entityRisksResolved()).isEqualTo(1);
    }

    @Test
    void entityRisk_spanningTwoTenants_leftNull() {
        ElasticsearchService es = mock(ElasticsearchService.class);
        UtmUbaAnomalyRepository aRepo = mock(UtmUbaAnomalyRepository.class);
        UtmUbaEntityRiskRepository eRepo = mock(UtmUbaEntityRiskRepository.class);
        MsspIndexResolver resolver = mock(MsspIndexResolver.class);
        HaClientRepository clients = mock(HaClientRepository.class);

        when(clients.findByMsspManagedTrueAndClientPrefixIsNotNull())
            .thenReturn(List.of(tenant(10L, "acme")));
        when(aRepo.findByTenantIdIsNull()).thenReturn(List.of());

        UtmUbaEntityRisk risk = new UtmUbaEntityRisk();
        risk.setEntityId("shared-host");
        risk.setEntityType("host");
        when(eRepo.findByTenantIdIsNull()).thenReturn(List.of(risk));

        UtmUbaAnomaly a1 = anomaly("A1", "shared-host", "host"); a1.setTenantId(10L);
        UtmUbaAnomaly a2 = anomaly("A2", "shared-host", "host"); a2.setTenantId(20L);
        when(aRepo.findByEntityIdAndEntityTypeAndTenantIdIsNotNull("shared-host", "host"))
            .thenReturn(List.of(a1, a2));

        var result = svc(es, aRepo, eRepo, resolver, clients).resolveLegacyUbaTenants();

        assertThat(risk.getTenantId()).isNull();
        verify(eRepo, never()).save(any());
        assertThat(result.entityRisksUnresolved()).isEqualTo(1);
    }

    @Test
    void noMsspTenants_isNoOp() {
        ElasticsearchService es = mock(ElasticsearchService.class);
        UtmUbaAnomalyRepository aRepo = mock(UtmUbaAnomalyRepository.class);
        UtmUbaEntityRiskRepository eRepo = mock(UtmUbaEntityRiskRepository.class);
        MsspIndexResolver resolver = mock(MsspIndexResolver.class);
        HaClientRepository clients = mock(HaClientRepository.class);
        when(clients.findByMsspManagedTrueAndClientPrefixIsNotNull()).thenReturn(List.of());

        var result = svc(es, aRepo, eRepo, resolver, clients).resolveLegacyUbaTenants();

        assertThat(result.anomaliesResolved()).isZero();
        verify(aRepo, never()).findByTenantIdIsNull();
    }

    @Test
    void probeException_abstains_leavesAnomalyNull() {
        // Core safety guarantee: an erroring tenant-index probe is "unknown", NOT "absent" —
        // the resolver must NOT stamp on partial evidence.
        ElasticsearchService es = mock(ElasticsearchService.class);
        UtmUbaAnomalyRepository aRepo = mock(UtmUbaAnomalyRepository.class);
        UtmUbaEntityRiskRepository eRepo = mock(UtmUbaEntityRiskRepository.class);
        MsspIndexResolver resolver = mock(MsspIndexResolver.class);
        HaClientRepository clients = mock(HaClientRepository.class);

        when(clients.findByMsspManagedTrueAndClientPrefixIsNotNull())
            .thenReturn(List.of(tenant(10L, "acme"), tenant(20L, "globex")));
        when(resolver.resolveIndexPatternForPrefix(eq("alert"), anyString()))
            .thenAnswer(i -> "v3-hive-alert-" + i.getArgument(1) + "-*");

        UtmUbaAnomaly a = anomaly("ALERT-1", "web01", "host");
        when(aRepo.findByTenantIdIsNull()).thenReturn(List.of(a));
        when(eRepo.findByTenantIdIsNull()).thenReturn(List.of());

        // The first tenant's probe throws → abstain for the whole anomaly.
        when(es.exists(anyList(), anyString())).thenThrow(new RuntimeException("OpenSearch unreachable"));

        var result = svc(es, aRepo, eRepo, resolver, clients).resolveLegacyUbaTenants();

        assertThat(a.getTenantId()).isNull();
        verify(aRepo, never()).save(any());
        assertThat(result.anomaliesResolved()).isZero();
        assertThat(result.anomaliesUnresolved()).isEqualTo(1);
    }
}
