package com.hivearmor.service.edr;

import com.hivearmor.domain.edr.UtmEdrIsolation;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.edr.UtmEdrIsolationRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * SPEC-04 (W1b) FU-4 — persists a {@link UtmEdrIsolation} row from the ASYNCHRONOUS gRPC
 * command-result callback in {@link EdrService#isolateAgent} (the {@code onError} handler
 * that flips the row to {@code FAILED}).
 *
 * <p>Mirrors {@link EdrQuarantineCallbackPersister}: the callback fires on a gRPC client
 * thread after the request method returns, with no surviving transaction and no
 * {@link TenantContext}. Once RLS is enabled on {@code hive_edr_isolation}, a plain
 * {@code save} there would run against the fail-closed default GUC and be hidden/rejected,
 * silently dropping the FAILED status. Seeding the row's tenant here and letting this
 * bean's own {@code @Transactional} proxy open the tx makes {@code TenantGucAspect} issue
 * the GUC = the row's tenant. The prior context is restored so a pooled callback thread
 * never bleeds scope.
 */
@Component
public class EdrIsolationCallbackPersister {

    private final UtmEdrIsolationRepository isolationRepo;

    public EdrIsolationCallbackPersister(UtmEdrIsolationRepository isolationRepo) {
        this.isolationRepo = isolationRepo;
    }

    @Transactional
    public void saveInRowTenant(UtmEdrIsolation row) {
        Long prevClientId = TenantContext.getClientId();
        String prevPrefix = TenantContext.getClientPrefix();
        try {
            Long tenantId = row.getTenantId();
            if (tenantId != null && tenantId > 0L) {
                TenantContext.set(tenantId, null);
            } else {
                TenantContext.clear();
            }
            isolationRepo.save(row);
        } finally {
            if (prevClientId != null) {
                TenantContext.set(prevClientId, prevPrefix);
            } else if (prevPrefix != null) {
                TenantContext.set(prevPrefix);
            } else {
                TenantContext.clear();
            }
        }
    }
}
