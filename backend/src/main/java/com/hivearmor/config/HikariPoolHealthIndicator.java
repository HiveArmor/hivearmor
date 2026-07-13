package com.hivearmor.config;

import com.zaxxer.hikari.HikariDataSource;
import com.zaxxer.hikari.HikariPoolMXBean;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;

@Component
public class HikariPoolHealthIndicator implements HealthIndicator {

    private final HikariDataSource dataSource;

    public HikariPoolHealthIndicator(DataSource dataSource) {
        this.dataSource = (HikariDataSource) dataSource;
    }

    @Override
    public Health health() {
        HikariPoolMXBean pool = dataSource.getHikariPoolMXBean();
        if (pool == null) {
            return Health.unknown().withDetail("reason", "pool MXBean not available").build();
        }
        int active  = pool.getActiveConnections();
        int idle    = pool.getIdleConnections();
        int pending = pool.getThreadsAwaitingConnection();
        int total   = pool.getTotalConnections();
        int max     = dataSource.getMaximumPoolSize();

        Health.Builder builder = (pending > 0 || active >= max)
            ? Health.down()
            : Health.up();

        return builder
            .withDetail("pool",    dataSource.getPoolName())
            .withDetail("active",  active)
            .withDetail("idle",    idle)
            .withDetail("pending", pending)
            .withDetail("total",   total)
            .withDetail("maximum", max)
            .build();
    }
}
