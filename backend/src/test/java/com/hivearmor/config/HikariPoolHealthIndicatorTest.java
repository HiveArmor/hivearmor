package com.hivearmor.config;

import com.zaxxer.hikari.HikariDataSource;
import com.zaxxer.hikari.HikariPoolMXBean;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.Status;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class HikariPoolHealthIndicatorTest {

    @Mock HikariDataSource dataSource;
    @Mock HikariPoolMXBean pool;

    private HikariPoolHealthIndicator indicator;

    @BeforeEach
    void setUp() {
        when(dataSource.getHikariPoolMXBean()).thenReturn(pool);
        // lenient: not called in healthIsUnknownWhenMXBeanUnavailable (early-return path)
        lenient().when(dataSource.getPoolName()).thenReturn("test-pool");
        lenient().when(dataSource.getMaximumPoolSize()).thenReturn(20);
        indicator = new HikariPoolHealthIndicator(dataSource);
    }

    @Test
    void healthIsUpWhenPoolHasCapacity() {
        when(pool.getActiveConnections()).thenReturn(5);
        when(pool.getIdleConnections()).thenReturn(15);
        when(pool.getThreadsAwaitingConnection()).thenReturn(0);
        when(pool.getTotalConnections()).thenReturn(20);

        Health health = indicator.health();
        assertThat(health.getStatus()).isEqualTo(Status.UP);
        assertThat(health.getDetails()).containsEntry("active", 5);
        assertThat(health.getDetails()).containsEntry("maximum", 20);
    }

    @Test
    void healthIsDownWhenThreadsAreWaiting() {
        when(pool.getActiveConnections()).thenReturn(20);
        when(pool.getIdleConnections()).thenReturn(0);
        when(pool.getThreadsAwaitingConnection()).thenReturn(3);
        when(pool.getTotalConnections()).thenReturn(20);

        Health health = indicator.health();
        assertThat(health.getStatus()).isEqualTo(Status.DOWN);
        assertThat(health.getDetails()).containsKey("pending");
        assertThat(health.getDetails().get("pending")).isEqualTo(3);
    }

    @Test
    void healthIsDownWhenPoolFullyExhausted() {
        when(pool.getActiveConnections()).thenReturn(20);
        when(pool.getIdleConnections()).thenReturn(0);
        when(pool.getThreadsAwaitingConnection()).thenReturn(0);
        when(pool.getTotalConnections()).thenReturn(20);

        Health health = indicator.health();
        assertThat(health.getStatus()).isEqualTo(Status.DOWN);
    }

    @Test
    void healthIsUnknownWhenMXBeanUnavailable() {
        when(dataSource.getHikariPoolMXBean()).thenReturn(null);
        indicator = new HikariPoolHealthIndicator(dataSource);

        Health health = indicator.health();
        assertThat(health.getStatus()).isEqualTo(Status.UNKNOWN);
        assertThat(health.getDetails()).containsKey("reason");
    }
}
