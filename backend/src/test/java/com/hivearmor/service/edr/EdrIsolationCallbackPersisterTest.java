package com.hivearmor.service.edr;

import com.hivearmor.domain.edr.UtmEdrIsolation;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.edr.UtmEdrIsolationRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * SPEC-04 (W1b) FU-4 — proves the async isolation-callback persister seeds the tenant
 * context from the row so the write matches the RLS GUC, and restores context afterward.
 */
@ExtendWith(MockitoExtension.class)
class EdrIsolationCallbackPersisterTest {

    @Mock
    private UtmEdrIsolationRepository isolationRepo;

    @AfterEach
    void cleanup() {
        TenantContext.clear();
    }

    @Test
    void saveInRowTenantSeedsMsspTenantAndRestoresAfter() {
        EdrIsolationCallbackPersister persister = new EdrIsolationCallbackPersister(isolationRepo);
        UtmEdrIsolation row = new UtmEdrIsolation();
        row.setTenantId(42L);

        final Long[] seen = new Long[1];
        when(isolationRepo.save(any(UtmEdrIsolation.class))).thenAnswer(inv -> {
            seen[0] = TenantContext.getClientId();
            return inv.getArgument(0);
        });

        TenantContext.clear();
        persister.saveInRowTenant(row);

        assertThat(seen[0]).isEqualTo(42L);
        assertThat(TenantContext.getClientId()).isNull();
    }

    @Test
    void saveInRowTenantUsesSingleTenantScopeWhenTenantZero() {
        EdrIsolationCallbackPersister persister = new EdrIsolationCallbackPersister(isolationRepo);
        UtmEdrIsolation row = new UtmEdrIsolation();
        row.setTenantId(0L);

        final Long[] seen = new Long[]{ -99L };
        when(isolationRepo.save(any(UtmEdrIsolation.class))).thenAnswer(inv -> {
            seen[0] = TenantContext.getClientId();
            return inv.getArgument(0);
        });

        TenantContext.clear();
        persister.saveInRowTenant(row);

        assertThat(seen[0]).isNull();
    }

    @Test
    void saveInRowTenantRestoresPriorMsspContext() {
        EdrIsolationCallbackPersister persister = new EdrIsolationCallbackPersister(isolationRepo);
        UtmEdrIsolation row = new UtmEdrIsolation();
        row.setTenantId(42L);
        when(isolationRepo.save(any(UtmEdrIsolation.class))).thenAnswer(inv -> inv.getArgument(0));

        TenantContext.set(7L, "acme");
        persister.saveInRowTenant(row);

        assertThat(TenantContext.getClientId()).isEqualTo(7L);
        assertThat(TenantContext.getClientPrefix()).isEqualTo("acme");
    }
}
