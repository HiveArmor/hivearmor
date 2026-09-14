package com.hivearmor.service.edr;

import com.hivearmor.domain.edr.UtmEdrQuarantine;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.edr.UtmEdrQuarantineRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * SPEC-04 (W1b) FU-4 — proves the async quarantine-callback persister seeds the tenant
 * context from the row so the write matches the RLS GUC, and restores context afterward.
 */
@ExtendWith(MockitoExtension.class)
class EdrQuarantineCallbackPersisterTest {

    @Mock
    private UtmEdrQuarantineRepository quarantineRepo;

    @AfterEach
    void cleanup() {
        TenantContext.clear();
    }

    @Test
    void saveInRowTenantSeedsMsspTenantAndRestoresAfter() {
        EdrQuarantineCallbackPersister persister = new EdrQuarantineCallbackPersister(quarantineRepo);
        UtmEdrQuarantine row = new UtmEdrQuarantine();
        row.setTenantId(42L); // MSSP tenant

        final Long[] seen = new Long[1];
        when(quarantineRepo.save(any(UtmEdrQuarantine.class))).thenAnswer(inv -> {
            seen[0] = TenantContext.getClientId();
            return inv.getArgument(0);
        });

        // No prior context (mimics the gRPC callback thread).
        TenantContext.clear();
        persister.saveInRowTenant(row);

        // The save ran under the row's own tenant → GUC will resolve to 42.
        assertThat(seen[0]).isEqualTo(42L);
        // Context restored (cleared) afterward — no pooled-thread scope bleed.
        assertThat(TenantContext.getClientId()).isNull();
    }

    @Test
    void saveInRowTenantUsesSingleTenantScopeWhenTenantZero() {
        EdrQuarantineCallbackPersister persister = new EdrQuarantineCallbackPersister(quarantineRepo);
        UtmEdrQuarantine row = new UtmEdrQuarantine();
        row.setTenantId(0L); // single-tenant sentinel

        final Long[] seen = new Long[]{ -99L };
        when(quarantineRepo.save(any(UtmEdrQuarantine.class))).thenAnswer(inv -> {
            seen[0] = TenantContext.getClientId();
            return inv.getArgument(0);
        });

        TenantContext.clear();
        persister.saveInRowTenant(row);

        // tenant_id 0 → cleared context → GUC resolves single-tenant 0.
        assertThat(seen[0]).isNull();
    }

    @Test
    void saveInRowTenantRestoresPriorMsspContext() {
        EdrQuarantineCallbackPersister persister = new EdrQuarantineCallbackPersister(quarantineRepo);
        UtmEdrQuarantine row = new UtmEdrQuarantine();
        row.setTenantId(42L);
        when(quarantineRepo.save(any(UtmEdrQuarantine.class))).thenAnswer(inv -> inv.getArgument(0));

        // Prior context belongs to tenant 7 — must be restored, not cleared.
        TenantContext.set(7L, "acme");
        persister.saveInRowTenant(row);

        assertThat(TenantContext.getClientId()).isEqualTo(7L);
        assertThat(TenantContext.getClientPrefix()).isEqualTo("acme");
    }
}
