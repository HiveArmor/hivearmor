package com.hivearmor.multitenancy;

import com.hivearmor.domain.HaClient;
import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.repository.HaClientRepository;
import com.hivearmor.service.application_events.ApplicationEventService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.function.Consumer;

/**
 * P0A1-T14 — the ONLY sanctioned way for a scheduled/background job to run work
 * that touches tenant-sensitive data (agents, assets, rules, policies, health,
 * response). It enumerates eligible tenants and runs the supplied work ONCE PER
 * TENANT under that tenant's {@link TenantContext}, so associations can never
 * cross tenants.
 *
 * <p>Hard rules enforced here (see T14 spec):
 * <ul>
 *   <li>System context may ENUMERATE tenants only; it never fetches a merged
 *       all-tenant list for synchronization.</li>
 *   <li>Each tenant is processed one at a time: set scope → run → audit → clear.</li>
 *   <li>A failure in one tenant is recorded and does NOT stop the others.</li>
 *   <li>There is no "TenantContext missing → all tenants" fallback anywhere.</li>
 * </ul>
 *
 * <p>Request-facing tenant-sensitive methods stay fail-closed on
 * {@link TenantScope#requireTenant()}; this executor is what supplies that scope
 * for background flows.
 */
@Component
public class TenantScopedBackgroundExecutor {

    private static final Logger log = LoggerFactory.getLogger(TenantScopedBackgroundExecutor.class);

    private final HaClientRepository clients;
    private final ApplicationEventService eventService;

    public TenantScopedBackgroundExecutor(HaClientRepository clients,
                                          ApplicationEventService eventService) {
        this.clients = clients;
        this.eventService = eventService;
    }

    /**
     * Runs {@code perTenantWork} once for every eligible tenant, each under that
     * tenant's scope. In a single-tenant (non-MSSP) deployment — no MSSP-managed
     * clients with a prefix — the work runs exactly once in single-tenant mode
     * (client id 0, no prefix), which is NOT a cross-tenant span.
     *
     * @param jobName human-readable job name for audit/log lines
     * @param perTenantWork the tenant-scoped work; runs with TenantContext already set
     */
    public void runForEachTenant(String jobName, Runnable perTenantWork) {
        List<HaClient> tenants = clients.findByMsspManagedTrueAndClientPrefixIsNotNull();

        if (tenants.isEmpty()) {
            // Single-tenant deployment: exactly one pass, no cross-tenant span.
            runOne(jobName, null, null, perTenantWork);
            return;
        }

        int ok = 0;
        int failed = 0;
        for (HaClient tenant : tenants) {
            boolean success = runOne(jobName, tenant.getId(), tenant.getClientPrefix(), perTenantWork);
            if (success) {
                ok++;
            } else {
                failed++;
                // Rule 6: one tenant's failure must not stop the others — continue.
            }
        }
        log.info("{}: per-tenant run complete tenants={} ok={} failed={}",
                jobName, tenants.size(), ok, failed);
    }

    /**
     * Convenience overload that hands the resolved {@link HaClient} to the work
     * (for jobs that need the tenant's id/prefix directly).
     */
    public void runForEachTenant(String jobName, Consumer<HaClient> perTenantWork) {
        List<HaClient> tenants = clients.findByMsspManagedTrueAndClientPrefixIsNotNull();
        if (tenants.isEmpty()) {
            runOne(jobName, null, null, () -> perTenantWork.accept(null));
            return;
        }
        for (HaClient tenant : tenants) {
            runOne(jobName, tenant.getId(), tenant.getClientPrefix(), () -> perTenantWork.accept(tenant));
        }
    }

    private boolean runOne(String jobName, Long clientId, String prefix, Runnable work) {
        try {
            if (clientId != null && prefix != null) {
                TenantContext.set(clientId, prefix);
            } else {
                // Single-tenant: no prefix (isMssp()==false) so requireTenant() returns 0.
                TenantContext.clear();
            }
            work.run();
            return true;
        } catch (Exception e) {
            // Rule 6: record and continue. No secrets/payload in the audit line.
            String msg = jobName + ": tenant scope failed clientId=" + clientId + " reason=" + e.getMessage();
            log.warn(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return false;
        } finally {
            TenantContext.clear();
        }
    }
}
