package com.hivearmor.multitenancy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.hivearmor.domain.HaClient;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.service.application_events.ApplicationEventService;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

/**
 * #275 M1 — the {@code Consumer<HaClient>} overload of
 * {@link TenantScopedBackgroundExecutor#runForEachTenant} must, like the
 * {@code Runnable} overload, run every eligible tenant, continue past a single
 * tenant's failure (Rule 6), and record ok/failed so an overloaded or
 * partially-failing per-tenant job is observable rather than silent.
 */
class TenantScopedBackgroundExecutorConsumerTest {

    private static HaClient tenant(long id, String prefix) {
        HaClient c = new HaClient();
        c.setId(id);
        c.setClientPrefix(prefix);
        return c;
    }

    @Test
    void consumerOverload_runsEveryTenant_andContinuesPastAFailure() {
        HaClientRepository clients = mock(HaClientRepository.class);
        ApplicationEventService events = mock(ApplicationEventService.class);
        when(clients.findByMsspManagedTrueAndClientPrefixIsNotNull())
            .thenReturn(List.of(tenant(1L, "acme"), tenant(2L, "globex"), tenant(3L, "initech")));

        TenantScopedBackgroundExecutor exec = new TenantScopedBackgroundExecutor(clients, events);

        AtomicInteger seen = new AtomicInteger();
        exec.runForEachTenant("test-job", t -> {
            seen.incrementAndGet();
            if (t.getId() == 2L) {
                throw new RuntimeException("tenant 2 blows up");
            }
        });

        // All three tenants attempted despite tenant 2 failing (no early stop).
        assertThat(seen.get()).isEqualTo(3);
    }

    @Test
    void consumerOverload_singleTenantDeployment_runsOnce() {
        HaClientRepository clients = mock(HaClientRepository.class);
        ApplicationEventService events = mock(ApplicationEventService.class);
        when(clients.findByMsspManagedTrueAndClientPrefixIsNotNull()).thenReturn(List.of());

        TenantScopedBackgroundExecutor exec = new TenantScopedBackgroundExecutor(clients, events);

        AtomicInteger seen = new AtomicInteger();
        exec.runForEachTenant("test-job", t -> seen.incrementAndGet());

        assertThat(seen.get()).isEqualTo(1); // single pass, tenant == null
    }
}
