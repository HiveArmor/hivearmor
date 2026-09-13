package com.hivearmor.multitenancy;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

/**
 * P0A2-6 (RLS P1) GUC aspect tests — verify the fail-closed value mapping and that the
 * transaction-local set_config is issued with a BOUND parameter. Exercises the logic
 * directly (no static mocking of TransactionSynchronizationManager/DataSourceUtils, which
 * this build's mock maker does not support).
 */
class TenantGucAspectTest {

    private final TenantGucAspect aspect = new TenantGucAspect(mock(DataSource.class));

    @AfterEach
    void clearContext() {
        TenantContext.clear();
    }

    @Test
    void mssp_withClientId_usesThatTenant() {
        TenantContext.set(101L, "acme");
        assertThat(aspect.resolveTenantValue()).isEqualTo("101");
    }

    @Test
    void singleTenant_noContext_usesZeroSentinel() {
        // No context set → not MSSP → single-tenant sentinel 0.
        assertThat(aspect.resolveTenantValue()).isEqualTo("0");
    }

    @Test
    void mssp_prefixButNoClientId_failsClosedMinusOne() {
        // Prefix set (isMssp() true) but no numeric client id → fail closed with -1.
        TenantContext.set("acme");
        assertThat(aspect.resolveTenantValue()).isEqualTo("-1");
    }

    @Test
    void issueSetConfig_bindsValueAsParameter_notConcatenated() throws Exception {
        Connection conn = mock(Connection.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        // The SQL text is a fixed prepared statement with a bind placeholder — never the value.
        when(conn.prepareStatement("SELECT set_config('app.current_tenant', ?, true)")).thenReturn(ps);

        aspect.issueSetConfig(conn, "101");

        verify(conn).prepareStatement("SELECT set_config('app.current_tenant', ?, true)");
        verify(ps).setString(1, "101");
        verify(ps).execute();
        // Connection is owned by the transaction — the aspect must NOT close it.
        verify(conn, never()).close();
    }

    @Test
    void issueSetConfig_swallowsFailure_inertPhase() throws Exception {
        Connection conn = mock(Connection.class);
        when(conn.prepareStatement(anyString())).thenThrow(new RuntimeException("db down"));
        // INERT phase: must not propagate — a GUC failure cannot break the transaction.
        aspect.issueSetConfig(conn, "101");
    }
}
