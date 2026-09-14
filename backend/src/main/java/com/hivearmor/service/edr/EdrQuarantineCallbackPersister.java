package com.hivearmor.service.edr;

import com.hivearmor.domain.edr.UtmEdrQuarantine;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.edr.UtmEdrQuarantineRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * SPEC-04 (W1b) FU-4 — persists a {@link UtmEdrQuarantine} row from the ASYNCHRONOUS
 * gRPC command-result callbacks in {@link EdrService#quarantineFile}.
 *
 * <p>Those {@code StreamObserver} callbacks fire on a gRPC client thread AFTER the request
 * method has returned — so there is no surviving request transaction and no
 * {@link TenantContext}. On the RLS-active {@code ha_edr_quarantine} table that means the
 * {@code app.current_tenant} GUC is at its fail-closed default and the callback's
 * {@code save} would be hidden by the RLS {@code USING} clause / rejected by
 * {@code WITH CHECK} — the agent's returned quarantine path or FAILED status would be
 * silently dropped.
 *
 * <p>This is a SEPARATE bean (not a method on EdrService) on purpose: the {@code save}
 * must run under a tenant context that matches the row, AND inside a transaction so
 * {@code TenantGucAspect} issues the GUC. By seeding the context here and then letting
 * this bean's own {@code @Transactional} proxy open the tx, the GUC aspect fires AFTER the
 * context is set (a self-invocation on EdrService would not trigger the proxy at all). The
 * row itself is the tenant authority — its {@code tenant_id} was stamped from
 * {@code requireTenant()} when the quarantine was first created on the request path.
 */
@Component
public class EdrQuarantineCallbackPersister {

    private final UtmEdrQuarantineRepository quarantineRepo;

    public EdrQuarantineCallbackPersister(UtmEdrQuarantineRepository quarantineRepo) {
        this.quarantineRepo = quarantineRepo;
    }

    /**
     * Save {@code row} under its own tenant scope, inside a transaction so the tenant GUC
     * is issued for this connection. Restores the prior {@link TenantContext} afterwards so
     * a pooled gRPC callback thread never bleeds scope to its next use.
     */
    @Transactional
    public void saveInRowTenant(UtmEdrQuarantine row) {
        Long prevClientId = TenantContext.getClientId();
        String prevPrefix = TenantContext.getClientPrefix();
        try {
            Long tenantId = row.getTenantId();
            if (tenantId != null && tenantId > 0L) {
                // MSSP tenant — numeric scope so the GUC resolves to the row's tenant_id.
                TenantContext.set(tenantId, null);
            } else {
                // Single-tenant (tenant_id 0 or null): clear so the GUC resolves to 0.
                TenantContext.clear();
            }
            quarantineRepo.save(row);
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
