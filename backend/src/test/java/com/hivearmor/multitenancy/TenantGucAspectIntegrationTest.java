package com.hivearmor.multitenancy;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.EnableAspectJAutoProxy;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.stereotype.Component;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * P0A2-6 (RLS P1) — regression guard for review finding C1. Proves the TenantGucAspect actually
 * fires INSIDE the transaction on the primary outermost-@Transactional path (not skipped because
 * the advice ran before the tx opened). Uses a mock DataSource/Connection so it runs without a
 * live database — the DataSourceTransactionManager drives the mock connection's tx lifecycle, and
 * we assert the aspect issued set_config on that same connection while the tx was active.
 */
@SpringJUnitConfig
@ContextConfiguration(classes = TenantGucAspectIntegrationTest.Cfg.class)
class TenantGucAspectIntegrationTest {

    @AfterEach
    void clearContext() {
        TenantContext.clear();
    }

    @Configuration
    @EnableAspectJAutoProxy
    @EnableTransactionManagement
    static class Cfg {
        /** The set_config prepared statement mock — the connection returns this instance. */
        @Bean
        PreparedStatement recordingStatement() {
            return mock(PreparedStatement.class);
        }

        /** A mock DataSource whose connection records the set_config call and satisfies the tx manager. */
        @Bean
        Connection recordingConnection(PreparedStatement recordingStatement) throws Exception {
            Connection conn = mock(Connection.class);
            when(conn.prepareStatement(anyString())).thenReturn(recordingStatement);
            return conn;
        }

        @Bean
        DataSource dataSource(Connection recordingConnection) throws Exception {
            DataSource ds = mock(DataSource.class);
            when(ds.getConnection()).thenReturn(recordingConnection);
            return ds;
        }

        @Bean
        DataSourceTransactionManager txManager(DataSource dataSource) {
            return new DataSourceTransactionManager(dataSource);
        }

        @Bean
        TenantGucAspect tenantGucAspect(DataSource dataSource) {
            return new TenantGucAspect(dataSource);
        }

        @Bean
        TxBean txBean() {
            return new TxBean();
        }
    }

    @Component
    static class TxBean {
        @Transactional
        public void doWork() {
            // A normal transactional entry point (outermost tx boundary) — the path C1 was
            // silently skipping. The aspect must have fired INSIDE this transaction.
        }
    }

    @Autowired
    TxBean txBean;
    @Autowired
    Connection recordingConnection;
    @Autowired
    PreparedStatement recordingStatement;

    @Test
    void aspectFiresInsideTransaction_issuesSetConfigOnTxConnection() throws Exception {
        TenantContext.set(101L, "acme");

        txBean.doWork();

        // If the aspect were ordered outermost (the C1 bug), isActualTransactionActive() would be
        // false and set_config would NEVER be prepared. Asserting the prepared statement + bound
        // value proves it fired INSIDE the tx on the primary path.
        verify(recordingConnection).prepareStatement("SELECT set_config('app.current_tenant', ?, true)");
        verify(recordingStatement).setString(1, "101");
        verify(recordingStatement).execute();
    }
}
