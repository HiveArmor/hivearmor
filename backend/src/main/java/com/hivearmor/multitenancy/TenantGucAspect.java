package com.hivearmor.multitenancy;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;

/**
 * P0A2-6 (RLS phase P1) — sets the transaction-local PostgreSQL GUC {@code app.current_tenant}
 * at the start of every database transaction, so a future Row-Level-Security policy
 * ({@code USING (tenant_id = current_setting('app.current_tenant')::bigint)}) can enforce
 * tenant isolation as a defense-in-depth backstop beneath the app-level scoping.
 *
 * <p><b>This ships INERT.</b> No table has an RLS policy yet, so issuing the GUC has no
 * observable effect until the pilot policies are added (a separate, deliberate go/no-go PR
 * gated on the P0A1-T18 cross-tenant matrix). Its only job today is to prove the wiring is
 * correct and safe.
 *
 * <h3>Why transaction-local ({@code set_config(..., true)})</h3>
 * The {@code true} third argument scopes the setting to the CURRENT TRANSACTION — it
 * auto-resets at commit/rollback. This is the pool-bleed-safe form: a pooled HikariCP
 * connection returned to the pool carries NO leftover tenant GUC to the next borrower.
 * A session-scoped {@code SET} would require perfect reset-on-return discipline and would
 * be unsafe under a transaction pooler; we deliberately avoid it. Prod runs Hikari with
 * {@code auto-commit=false}, so real work already runs inside a transaction — the natural
 * home for a transaction-local setting.
 *
 * <h3>Fail-closed value mapping (from {@link TenantContext})</h3>
 * <ul>
 *   <li>{@code getClientId()} non-null → that tenant id (the normal MSSP + service-layer case).</li>
 *   <li>null and {@code !isMssp()} → {@code "0"} — the single-tenant sentinel
 *       ({@link TenantScope#requireTenant()} returns {@code 0L} single-tenant, and all
 *       single-tenant rows carry {@code tenant_id = 0}). A future policy of
 *       {@code tenant_id = 0} then matches everything: RLS is a correct no-op single-tenant.</li>
 *   <li>null and {@code isMssp()} → {@code "-1"} — an impossible tenant id. If MSSP scope is
 *       expected but no client id was resolved, we FAIL CLOSED: a future policy returns zero
 *       rows rather than leaking. Never a wildcard, never the prior borrower's value.</li>
 * </ul>
 *
 * <h3>Why {@code @Order(LOWEST_PRECEDENCE)} — the aspect must run INNERMOST</h3>
 * Spring's transaction interceptor advises {@code @Transactional} methods at
 * {@link Ordered#LOWEST_PRECEDENCE} (there is no {@code @EnableTransactionManagement(order=)}
 * override in this app). In Spring AOP a LOWER order value = HIGHER precedence = OUTERMOST
 * advice, and an outermost advice's body BEFORE {@code proceed()} runs BEFORE any inner advice —
 * including before the tx interceptor opens the transaction. If this aspect were outermost, its
 * {@code isActualTransactionActive()} check would run before the tx exists and the GUC would be
 * silently skipped on the primary path (the outermost {@code @Transactional} entry point).
 *
 * <p>So this aspect is ordered {@link Ordered#LOWEST_PRECEDENCE} — the maximum order value, i.e.
 * the LOWEST precedence, i.e. the INNERMOST advice, closest to the target method — so it runs
 * strictly INSIDE the transaction the interceptor opened. (There is no representable value MORE
 * inner: {@code LOWEST_PRECEDENCE} is {@code Integer.MAX_VALUE}. Ordering it any lower — e.g.
 * {@code LOWEST_PRECEDENCE - 1} — makes it run OUTSIDE the tx, which was verified to break the
 * mechanism.) The tx interceptor is ALSO at {@code LOWEST_PRECEDENCE}; the tie is resolved in
 * favor of this aspect running inside the tx, and {@code TenantGucAspectIntegrationTest} is the
 * empirical guard that asserts that outcome against the real Spring wiring on every build. As a
 * result
 * so its {@code proceed()} executes strictly INSIDE the transaction the interceptor opened:
 * {@link TransactionSynchronizationManager#isActualTransactionActive()} is true and
 * {@link DataSourceUtils#getConnection} returns the SAME connection the transaction (and thus the
 * RLS-policied queries) will use. This single choke point covers BOTH:
 * <ul>
 *   <li><b>request threads</b> — a {@code @Transactional} service method invoked from a controller
 *       under a {@link TenantContextFilter}-set {@link TenantContext}; and</li>
 *   <li><b>background threads</b> — {@link TenantScopedBackgroundExecutor}'s per-tenant work, which
 *       runs {@code @Transactional} under {@code TenantContext.set(...)}. Both go through
 *       {@code @Transactional}, so both get the GUC from one place with no duplicated wiring.</li>
 * </ul>
 * A method with no active transaction (e.g. {@code @Transactional(propagation = NOT_SUPPORTED)},
 * or a non-transactional read) is skipped — there is no connection to bind the local setting to,
 * and a future policy on such a path would simply fail closed against the DB-level default GUC.
 */
@Aspect
@Component
@Order(Ordered.LOWEST_PRECEDENCE)
public class TenantGucAspect {

    private static final Logger log = LoggerFactory.getLogger(TenantGucAspect.class);

    /** Impossible tenant id used when MSSP scope is expected but unresolved — fails closed. */
    private static final String FAIL_CLOSED_TENANT = "-1";
    /** Single-tenant sentinel (matches TenantScope.requireTenant() == 0L). */
    private static final String SINGLE_TENANT = "0";

    private final DataSource dataSource;

    public TenantGucAspect(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Around("@annotation(org.springframework.transaction.annotation.Transactional) "
            + "|| @within(org.springframework.transaction.annotation.Transactional)")
    public Object applyTenantGuc(ProceedingJoinPoint pjp) throws Throwable {
        // Only meaningful inside a real transaction — the setting is transaction-local.
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            setTenantGuc(resolveTenantValue());
        }
        return pjp.proceed();
    }

    /** Fail-closed mapping from the thread's TenantContext to the GUC value. Package-visible for tests. */
    String resolveTenantValue() {
        Long clientId = TenantContext.getClientId();
        if (clientId != null) {
            return String.valueOf(clientId);
        }
        // No numeric client id in scope.
        return TenantContext.isMssp() ? FAIL_CLOSED_TENANT : SINGLE_TENANT;
    }

    /**
     * Issues {@code SELECT set_config('app.current_tenant', ?, true)} on the transaction-bound
     * connection. The value is a BOUND parameter (no string concatenation → no injection).
     * The connection belongs to the transaction and must NOT be closed here.
     */
    private void setTenantGuc(String tenantValue) {
        Connection conn = DataSourceUtils.getConnection(dataSource);
        issueSetConfig(conn, tenantValue);
        // Do NOT close conn — it is owned by the active transaction.
    }

    /** The actual set_config call on a given connection. Package-visible for tests. */
    void issueSetConfig(Connection conn, String tenantValue) {
        try (PreparedStatement ps =
                     conn.prepareStatement("SELECT set_config('app.current_tenant', ?, true)")) {
            ps.setString(1, tenantValue);
            ps.execute();
        } catch (Exception e) {
            // INERT phase: no policy depends on this yet, so a failure here must not break the
            // transaction. Log and continue; once policies exist, a failure would fail closed
            // (queries evaluate against the DB-level default GUC, not a wrong tenant).
            log.warn("P0A2-6: could not set app.current_tenant GUC (inert phase, ignoring): {}",
                    e.getMessage());
        }
    }
}
