package com.hivearmor.multitenancy;

import com.hivearmor.domain.HaClient;
import com.hivearmor.repository.HaClientRepository;
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

    /**
     * Tables whose linkage column genuinely holds an AGENT identifier (id or hostname), so
     * an MSSP row can be tenant-resolved by matching it against a tenant's agents.
     * table name &rarr; agent-linkage column.
     */
    private static final Map<String, String> AGENT_LINKED_TABLES = new LinkedHashMap<>() {{
        put("hive_edr_event", "agent_id");
        put("hive_edr_quarantine", "agent_id");
        put("ha_edr_quarantine", "agent_id");
        put("hive_alert_response_rule_execution", "agent");
    }};

    /**
     * UBA tables. Their {@code entity_id} is a user/ip/host value, NOT an agent identifier
     * (see UbaSyncService.resolveEntityType → "user"/"host"), so it CANNOT be tenant-resolved
     * by matching agent hostnames — doing so would orphan user/ip entities and could
     * mis-stamp a username that collides with another tenant's hostname (a cross-tenant leak).
     * New UBA rows are already tenant-stamped at insert by UbaSyncService, so only LEGACY
     * NULL rows are affected. On single-tenant they resolve to 0; on MSSP they have no
     * agent-derivable tenant on the row itself and are reported as unresolvable (left NULL)
     * rather than mis-attributed — see the report's msspUnresolvableUba note.
     */
    private static final List<String> UBA_TABLES = List.of("hive_uba_anomaly", "hive_uba_entity_risk");

    private final EntityManager em;
    private final TenantScopedBackgroundExecutor backgroundExecutor;
    private final AgentService agentService;
    private final HaClientRepository clients;

    public TenantBackfillService(EntityManager em,
                                 TenantScopedBackgroundExecutor backgroundExecutor,
                                 AgentService agentService,
                                 HaClientRepository clients) {
        this.em = em;
        this.backgroundExecutor = backgroundExecutor;
        this.agentService = agentService;
        this.clients = clients;
    }

    /** Per-table outcome for the caller's report. */
    public record TableResult(String table, long updated, long remainingNull, int failedTenants) { }

    /**
     * Run the backfill across all tenant_id tables. Idempotent.
     *
     * @return per-table counts of rows updated this run, rows still NULL afterwards, and
     *         (MSSP) the number of tenants whose agent enumeration FAILED this run — a
     *         non-zero {@code failedTenants} means some NULLs may be transient failures, not
     *         true orphans, so the run should be RE-RUN before trusting remainingNull.
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

    /** Single-tenant: every NULL row (agent-linked AND UBA) belongs to the {@code 0} sentinel. */
    private List<TableResult> backfillSingleTenant() {
        List<TableResult> results = new ArrayList<>();
        List<String> allTables = new ArrayList<>(AGENT_LINKED_TABLES.keySet());
        allTables.addAll(UBA_TABLES);
        for (String table : allTables) {
            long updated = em.createNativeQuery(
                    "UPDATE " + table + " SET tenant_id = 0 WHERE tenant_id IS NULL")
                .executeUpdate();
            long remaining = countNull(table);
            results.add(new TableResult(table, updated, remaining, 0));
            log.info("P0A2-B single-tenant {}: set {} rows to tenant 0, {} still NULL", table, updated, remaining);
        }
        return results;
    }

    /**
     * MSSP: resolve per tenant. For each tenant, list its agents and stamp rows whose
     * linkage column matches one of that tenant's agent ids/hostnames.
     */
    private List<TableResult> backfillMssp() {
        // Per-table running totals of rows stamped this run, plus a count of tenants whose
        // agent enumeration failed (so failures aren't silently reported as orphans — C2).
        Map<String, Long> updatedPerTable = new java.util.concurrent.ConcurrentHashMap<>();
        java.util.concurrent.atomic.AtomicInteger failedTenants = new java.util.concurrent.atomic.AtomicInteger();

        backgroundExecutor.runForEachTenant("TenantBackfillService.backfill", (HaClient tenant) -> {
            long tenantId = tenant.getId();
            List<AgentDTO> agents;
            try {
                // Tenant-scoped (runs under this tenant's TenantContext set by the executor).
                agents = agentService.getInstalledAgents();
            } catch (Exception ex) {
                // C2 — a transient manager failure must NOT masquerade as orphaned rows.
                failedTenants.incrementAndGet();
                log.warn("P0A2-B MSSP tenant {}: agent enumeration failed, rows left for re-run: {}",
                        tenantId, ex.getMessage());
                return;
            }
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

            // ONLY agent-linked tables — UBA entity_id is a user/ip/host value, not an agent
            // identifier, so it is deliberately NOT matched here (C1).
            for (Map.Entry<String, String> e : AGENT_LINKED_TABLES.entrySet()) {
                String table = e.getKey();
                String col = e.getValue();
                Set<String> keys = "agent_id".equals(col) ? agentIds : hostnames;
                if (keys.isEmpty()) {
                    continue;
                }
                long updated = updateInBatches(table, col, tenantId, keys);
                if (updated > 0) {
                    updatedPerTable.merge(table, updated, Long::sum);
                    log.info("P0A2-B MSSP {}: stamped {} rows to tenant {}", table, updated, tenantId);
                }
            }
        });

        List<TableResult> results = new ArrayList<>();
        int failed = failedTenants.get();

        // Agent-linked tables: real updated total + remaining NULLs (true orphans only if
        // failed==0; otherwise some NULLs may be from failed tenants — re-run).
        for (String table : AGENT_LINKED_TABLES.keySet()) {
            long remaining = countNull(table);
            results.add(new TableResult(table, updatedPerTable.getOrDefault(table, 0L), remaining, failed));
            if (remaining > 0) {
                log.warn("P0A2-B MSSP {}: {} rows still NULL ({} tenant(s) failed this run) \u2014 "
                        + "re-run then review before NOT-NULL", table, remaining, failed);
            }
        }
        // UBA tables: not resolvable from an agent join on MSSP (see UBA_TABLES doc). New rows
        // are already tenant-stamped at insert; legacy NULL rows are reported as-is (updated=0)
        // and must be resolved by a UBA-specific migration (originating alert's tenant), NOT here.
        for (String table : UBA_TABLES) {
            long remaining = countNull(table);
            results.add(new TableResult(table, 0L, remaining, failed));
            if (remaining > 0) {
                log.warn("P0A2-B MSSP {}: {} legacy NULL rows NOT auto-resolved (entity_id is not an "
                        + "agent identifier) \u2014 needs a UBA-specific backfill before NOT-NULL", table, remaining);
            }
        }
        return results;
    }

    /**
     * H2 — batch the IN (:keys) set so a large tenant cannot exceed PostgreSQL's
     * 65,535 bind-parameter limit. Chunks of 1,000.
     */
    private long updateInBatches(String table, String col, long tenantId, Set<String> keys) {
        final int batch = 1000;
        List<String> all = new ArrayList<>(keys);
        long total = 0;
        for (int i = 0; i < all.size(); i += batch) {
            List<String> chunk = all.subList(i, Math.min(i + batch, all.size()));
            total += em.createNativeQuery(
                    "UPDATE " + table + " SET tenant_id = :tid "
                    + "WHERE tenant_id IS NULL AND " + col + " IN (:keys)")
                .setParameter("tid", tenantId)
                .setParameter("keys", chunk)
                .executeUpdate();
        }
        return total;
    }

    private long countNull(String table) {
        Object c = em.createNativeQuery("SELECT COUNT(*) FROM " + table + " WHERE tenant_id IS NULL")
            .getSingleResult();
        return ((Number) c).longValue();
    }

    // ---------------------------------------------------------------------------------------
    // NOT-NULL enforcement — the FINAL, irreversible step of the isolation programme.
    //
    // This is deliberately application-level, NOT a Liquibase changeset. A Liquibase
    // precondition gated on a TRANSIENT data state (are there NULLs right now?) with
    // onFail="MARK_RAN" fails permanently: once it runs on a still-dirty deploy it is
    // recorded as MARK_RAN and NEVER re-evaluated, so the constraint would never land on
    // exactly the MSSP deployments that need it. Enforcing here — re-checked on every call,
    // applied only when the table is provably clean — makes "enforce once clean" actually
    // work and mirrors the app-level backfill precedent (the authoritative agent→tenant map
    // lives outside this DB).
    // ---------------------------------------------------------------------------------------

    /** Per-table enforcement outcome. */
    public record EnforceResult(String table, boolean enforced, long remainingNull, boolean alreadyNotNull) { }

    /**
     * Enforce {@code tenant_id NOT NULL} on every tenant table that is provably clean (zero
     * NULLs). Idempotent and safe to re-run: a table that still has NULLs is SKIPPED (not
     * altered, never defaulted to a wrong tenant) and reported so the operator can re-run the
     * backfill and call this again. A table already NOT NULL is a no-op. Run this AFTER
     * {@link #backfill()} reports zero remaining nulls (and, for MSSP UBA tables, after a
     * UBA-specific migration resolves their legacy rows).
     *
     * @return per-table outcome (enforced / skipped-with-remainingNull / already-not-null).
     */
    @Transactional
    public List<EnforceResult> enforceNotNull() {
        List<String> allTables = new ArrayList<>(AGENT_LINKED_TABLES.keySet());
        allTables.addAll(UBA_TABLES);

        List<EnforceResult> results = new ArrayList<>();
        for (String table : allTables) {
            if (isTenantIdNotNull(table)) {
                results.add(new EnforceResult(table, false, 0, true));
                continue;
            }
            long remaining = countNull(table);
            if (remaining > 0) {
                // Fail SAFE: do not lock a table that still has unattributed rows.
                results.add(new EnforceResult(table, false, remaining, false));
                log.warn("P0A2 NOT-NULL: {} still has {} NULL tenant_id rows — NOT enforced; "
                        + "re-run backfill then retry", table, remaining);
                continue;
            }
            // table name is a hardcoded constant; no user input reaches this DDL.
            em.createNativeQuery("ALTER TABLE " + table + " ALTER COLUMN tenant_id SET NOT NULL")
                .executeUpdate();
            results.add(new EnforceResult(table, true, 0, false));
            log.info("P0A2 NOT-NULL: enforced tenant_id NOT NULL on {}", table);
        }
        return results;
    }

    /** True if {@code tenant_id} is already NOT NULL on the given table (Postgres catalog). */
    private boolean isTenantIdNotNull(String table) {
        // information_schema.columns.is_nullable = 'NO' once the constraint is set.
        Object nullable = em.createNativeQuery(
                "SELECT is_nullable FROM information_schema.columns "
                + "WHERE table_name = :t AND column_name = 'tenant_id'")
            .setParameter("t", table)
            .getResultList().stream().findFirst().orElse(null);
        return "NO".equals(nullable);
    }
}
