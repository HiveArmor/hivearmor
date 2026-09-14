package com.hivearmor.service.connector;

import com.hivearmor.multitenancy.TenantScopedBackgroundExecutor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Periodic pull of connector alerts into the ADR-20260824 staging queue.
 *
 * <p>Does not write OpenSearch alert indices.
 *
 * <p>SPEC-04 (W1b) FU-4 — runs the pull ONCE PER TENANT via
 * {@link TenantScopedBackgroundExecutor}, so each pass executes under that tenant's
 * {@link com.hivearmor.multitenancy.TenantContext}. This makes the staging INSERTs
 * (whose tenant_id is inherited from the parent instance) match the app.current_tenant
 * GUC the TenantGucAspect sets, so they survive an RLS WITH CHECK once RLS is enabled on
 * the connector tables. On single-tenant it is exactly one pass under tenant 0.
 */
@Component
public class ConnectorAlertIngestScheduler {

    private static final Logger log = LoggerFactory.getLogger(ConnectorAlertIngestScheduler.class);

    private final ConnectorAlertIngestService ingestService;
    private final TenantScopedBackgroundExecutor tenantExecutor;

    public ConnectorAlertIngestScheduler(ConnectorAlertIngestService ingestService,
                                         TenantScopedBackgroundExecutor tenantExecutor) {
        this.ingestService = ingestService;
        this.tenantExecutor = tenantExecutor;
    }

    @Scheduled(fixedDelay = 5, timeUnit = TimeUnit.MINUTES, initialDelay = 2)
    public void pullEnabledConnectors() {
        tenantExecutor.runForEachTenant("connector-alert-ingest", () -> {
            List<ConnectorIngestResult> results = ingestService.ingestEnabledPullers();
            if (!results.isEmpty()) {
                int inserted = results.stream().mapToInt(ConnectorIngestResult::getInserted).sum();
                log.debug(
                    "Connector scheduled ingest completed batches={} inserted={}",
                    results.size(),
                    inserted
                );
            }
        });
    }
}
