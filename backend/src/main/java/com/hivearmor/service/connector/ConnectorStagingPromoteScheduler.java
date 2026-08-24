package com.hivearmor.service.connector;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

/**
 * Optional promote of PENDING staging rows (ADR-20260824-connector-staging-bridge).
 *
 * <p>Disabled by default — enable with {@code hivearmor.connector.staging.promote.scheduler-enabled=true}.
 */
@Component
public class ConnectorStagingPromoteScheduler {

    private static final Logger log = LoggerFactory.getLogger(ConnectorStagingPromoteScheduler.class);

    private final ConnectorStagingPromoteService promoteService;
    private final boolean schedulerEnabled;
    private final int batchSize;

    public ConnectorStagingPromoteScheduler(
            ConnectorStagingPromoteService promoteService,
            @Value("${hivearmor.connector.staging.promote.scheduler-enabled:false}") boolean schedulerEnabled,
            @Value("${hivearmor.connector.staging.promote.batch-size:25}") int batchSize) {
        this.promoteService = promoteService;
        this.schedulerEnabled = schedulerEnabled;
        this.batchSize = batchSize;
    }

    @Scheduled(fixedDelay = 10, timeUnit = TimeUnit.MINUTES, initialDelay = 5)
    public void promotePending() {
        if (!schedulerEnabled) {
            return;
        }
        ConnectorPromoteResult result = promoteService.promotePendingBatch(batchSize);
        if (result.getRequested() > 0) {
            log.info(
                "Connector staging promote scheduler batchId={} requested={} promoted={} failed={} skipped={}",
                result.getPromoteBatchId(),
                result.getRequested(),
                result.getPromoted(),
                result.getFailed(),
                result.getSkipped()
            );
        }
    }
}
