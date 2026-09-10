package com.hivearmor.multitenancy;

import com.hivearmor.domain.HaClient;
import com.hivearmor.service.agent_manager.AgentService;
import com.hivearmor.service.dto.agent_manager.AgentDTO;
import jakarta.persistence.EntityManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * P0A2-B — one-shot, idempotent backfill for the nullable {@code tenant_id} columns added
 * across the P0-A tenant-security program. It is the prerequisite for NOT-NULL enforcement
 * and the Postgres RLS pilot: neither is safe while any row still has a NULL tenant.
 *
 * <p>Why this is an application-level job and not a pure-SQL changeset: the authoritative
 * agent&rarr;tenant mapping lives in the agent-manager's SEPARATE Postgres (reachable only
 * over gRPC), so there is no in-database join. Two deployment shapes:
 * <ul>
 *   <li><b>Single-tenant</b> (no MSSP-managed client with a prefix): every legacy row's
 *       tenant is the sentinel {@code 0}. A blanket {@code UPDATE ... SET tenant_id = 0
 *       WHERE tenant_id IS NULL} is correct and complete.</li>
 *   <li><b>MSSP</b>: resolved PER TENANT via {@link TenantScopedBackgroundExecutor} &mdash;
 *       for each tenant we list that tenant's agents (from the manager, tenant-scoped) and
 *       set {@code tenant_id} on rows whose agent-linkage column matches one of that
 *       tenant's agents. Rows whose owning agent cannot be resolved in any tenant are left
 *       NULL (orphans) and reported &mdash; NEVER defaulted to a wrong tenant.</li>
 * </ul>
 *
 * <p>Idempotent and re-runnable: only rows with {@code tenant_id IS NULL} are ever touched.
 * NOT-NULL enforcement should only run once {@link #backfill()} reports zero remaining nulls.
 */
@Service
public class TenantBackfillService {

    private static final Logger log = LoggerFactory.getLogger(TenantBackfillService.class);

    /** table name &rarr; agent-linkage column (the value matched against an agent id/hostname). */
    private static final Map<String, String> AGENT_LINKED_TABLES = new LinkedHashMap<>() {{
        put("hive_edr_event", "agent_id");
        put("hive_edr_quarantine", "agent_id");
        put("ha_edr_quarantine", "agent_id");
        put("hive_alert_response_rule_execution", "agent");
        put("hive_uba_anomaly", "entity_id");
        put("hive_uba_entity_risk", "entity_id");
    }};

    private final EntityManager em;
    private final TenantScopedBackgroundExecutor backgroundExecutor;
    private final AgentService agentService;
    private final com.hivearmor.repository.HaClientRepository clients;

    public TenantBackfillService(EntityManager em,
                                 TenantScopedBackgroundExecutor backgroundExecutor,
                                 AgentService agentService,
                                 com.hivearmor.repository.HaClientRepository clients) {
        this.em = em;
        this.backgroundExecutor = backgroundExecutor;
        this.agentService = agentService;
        this.clients = clients;
    }

    /** Per-table outcome for the caller's report. */
    public record TableResult(String table, long updated, long remainingNull) { }

    /**
     * Run the backfill across all agent-linked tenant_id tables. Idempotent.
     *
     * @return per-table counts of rows updated this run and rows still NULL afterwards
     *         (a non-zero {@code remainingNull} on MSSP = orphaned rows needing manual review).
     */
    @Transactional
    public List<TableResult> backfill() {
        boolean mssp = !clients.findByMsspManagedTrueAndClientPrefixIsNotNull().isEmpty();
        log.info("P0A2-B tenant backfill starting (deployment={})", mssp ? "MSSP" : "single-tenant");

        if (!mssp) {
            return backfillSingleTenant();
        }
        return backfillMssp();
    }

    /** Single-tenant: every NULL row belongs to the {@code 0} sentinel. */
    private List<TableResult> backfillSingleTenant() {
        List<TableResult> results = new ArrayList<>();
        for (String table : AGENT_LINKED_TABLES.keySet()) {
            long updated = em.createNativeQuery(
                    "UPDATE " + table + " SET tenant_id = 0 WHERE tenant_id IS NULL")
                .executeUpdate();
            long remaining = countNull(table);
            results.add(new TableResult(table, updated, remaining));
            log.info("P0A2-B single-tenant {}: set {} rows to tenant 0, {} still NULL", table, updated, remaining);
        }
        return results;
    }

    /**
     * MSSP: resolve per tenant. For each tenant, list its agents and stamp rows whose
     * linkage column matches one of that tenant's agent ids/hostnames.
     */
    private List<TableResult> backfillMssp() {
        // Per-tenant pass fills matching rows; then a final NULL count per table.
        backgroundExecutor.runForEachTenant("TenantBackfillService.backfill", (HaClient tenant) -> {
            if (tenant == null) {
                return; // defensive: MSSP path always has a resolved tenant here
            }
            long tenantId = tenant.getId();
            // getInstalledAgents() is tenant-scoped (runs under this tenant's TenantContext).
            List<AgentDTO> agents = agentService.getInstalledAgents();
            if (agents.isEmpty()) {
                return;
            }
            Set<String> hostnames = agents.stream()
                .map(AgentDTO::getHostname)
                .filter(h -> h != null && !h.isBlank())
                .collect(Collectors.toSet());
            Set<String> agentIds = agents.stream()
                .map(a -> String.valueOf(a.getId()))
                .collect(Collectors.toSet());

            for (Map.Entry<String, String> e : AGENT_LINKED_TABLES.entrySet()) {
                String table = e.getKey();
                String col = e.getValue();
                // EDR/quarantine link by agent_id; rule-exec + UBA link by hostname.
                Set<String> keys = "agent_id".equals(col) ? agentIds : hostnames;
                if (keys.isEmpty()) {
                    continue;
                }
                long updated = em.createNativeQuery(
                        "UPDATE " + table + " SET tenant_id = :tid "
                        + "WHERE tenant_id IS NULL AND " + col + " IN (:keys)")
                    .setParameter("tid", tenantId)
                    .setParameter("keys", keys)
                    .executeUpdate();
                if (updated > 0) {
                    log.info("P0A2-B MSSP {}: stamped {} rows to tenant {}", table, updated, tenantId);
                }
            }
        });

        // Report remaining NULLs (orphans) per table after all tenants processed.
        List<TableResult> results = new ArrayList<>();
        for (String table : AGENT_LINKED_TABLES.keySet()) {
            long remaining = countNull(table);
            results.add(new TableResult(table, -1, remaining)); // updated counted per-tenant in logs
            if (remaining > 0) {
                log.warn("P0A2-B MSSP {}: {} rows still NULL (orphaned agents) \u2014 manual review before NOT-NULL", table, remaining);
            }
        }
        return results;
    }

    private long countNull(String table) {
        Object c = em.createNativeQuery("SELECT COUNT(*) FROM " + table + " WHERE tenant_id IS NULL")
            .getSingleResult();
        return ((Number) c).longValue();
    }
}
