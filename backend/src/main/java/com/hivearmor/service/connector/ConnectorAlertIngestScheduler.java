package com.hivearmor.service.connector;

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
 */
@Component
public class ConnectorAlertIngestScheduler {

    private static final Logger log = LoggerFactory.getLogger(ConnectorAlertIngestScheduler.class);

    private final ConnectorAlertIngestService ingestService;

    public ConnectorAlertIngestScheduler(ConnectorAlertIngestService ingestService) {
        this.ingestService = ingestService;
    }

    @Scheduled(fixedDelay = 5, timeUnit = TimeUnit.MINUTES, initialDelay = 2)
    public void pullEnabledConnectors() {
        List<ConnectorIngestResult> results = ingestService.ingestEnabledPullers();
        if (!results.isEmpty()) {
            int inserted = results.stream().mapToInt(ConnectorIngestResult::getInserted).sum();
            log.debug(
                "Connector scheduled ingest completed batches={} inserted={}",
                results.size(),
                inserted
            );
        }
    }
}
