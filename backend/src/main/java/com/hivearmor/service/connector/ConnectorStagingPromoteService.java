package com.hivearmor.service.connector;

import com.hivearmor.domain.connector.ConnectorStagingStatus;
import com.hivearmor.domain.connector.HaConnectorAlertStaging;
import com.hivearmor.repository.connector.HaConnectorAlertStagingRepository;
import com.hivearmor.service.elasticsearch.ElasticsearchService;
import com.hivearmor.service.inputs.HaIndexNames;
import org.opensearch.client.opensearch.core.IndexResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Promotes staged connector alerts into {@code v3-hive-connector-promoted-*} via the
 * authenticated backend OpenSearch write path (ADR-20260824-connector-staging-bridge).
 *
 * <p>Never writes {@code v3-hive-alert-*}. Never calls event-processor {@code /v1/inject}.
 */
@Service
public class ConnectorStagingPromoteService {

    private static final Logger log = LoggerFactory.getLogger(ConnectorStagingPromoteService.class);
    private static final int MAX_BATCH = 100;
    private static final int MAX_ERROR = 2000;

    private final HaConnectorAlertStagingRepository stagingRepository;
    private final ElasticsearchService elasticsearchService;

    public ConnectorStagingPromoteService(
            HaConnectorAlertStagingRepository stagingRepository,
            ElasticsearchService elasticsearchService) {
        this.stagingRepository = stagingRepository;
        this.elasticsearchService = elasticsearchService;
    }

    @Transactional
    public ConnectorPromoteResult promoteOne(Long stagingId) {
        if (stagingId == null) {
            throw new IllegalArgumentException("staging id is required");
        }
        return promoteByIds(List.of(stagingId));
    }

    @Transactional
    public ConnectorPromoteResult promoteByIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            throw new IllegalArgumentException("ids must not be empty");
        }
        if (ids.size() > MAX_BATCH) {
            throw new IllegalArgumentException("ids batch max is " + MAX_BATCH);
        }
        String promoteBatchId = UUID.randomUUID().toString();
        String destinationIndex = HaIndexNames.buildCurrentDayIndex(ConnectorPromoteResult.INDEX_TYPE);
        assertSafeDestination(destinationIndex);

        List<HaConnectorAlertStaging> rows = stagingRepository.findByIdIn(ids);
        Map<Long, HaConnectorAlertStaging> byId = new LinkedHashMap<>();
        for (HaConnectorAlertStaging row : rows) {
            byId.put(row.getId(), row);
        }

        int promoted = 0;
        int failed = 0;
        int skipped = 0;
        List<Map<String, Object>> results = new ArrayList<>();

        for (Long id : ids) {
            HaConnectorAlertStaging row = byId.get(id);
            if (row == null) {
                skipped++;
                results.add(resultEntry(id, "SKIPPED", "not found", null, null));
                continue;
            }
            String status = row.getStatus() != null ? row.getStatus() : ConnectorStagingStatus.PENDING;
            if (ConnectorStagingStatus.PROMOTED.equals(status)) {
                skipped++;
                results.add(resultEntry(
                    id,
                    "SKIPPED",
                    "already PROMOTED",
                    row.getPromotedIndex(),
                    row.getPromotedDocId()
                ));
                continue;
            }
            try {
                Map<String, Object> document = buildPromotedDocument(row, promoteBatchId, destinationIndex);
                IndexResponse response = elasticsearchService.index(destinationIndex, document);
                String docId = response != null ? response.id() : null;
                Instant now = Instant.now();
                row.setStatus(ConnectorStagingStatus.PROMOTED);
                row.setPromoteBatchId(promoteBatchId);
                row.setPromotedAt(now);
                row.setPromotedIndex(destinationIndex);
                row.setPromotedDocId(docId);
                row.setPromoteError(null);
                stagingRepository.save(row);
                promoted++;
                results.add(resultEntry(id, ConnectorStagingStatus.PROMOTED, null, destinationIndex, docId));
            } catch (Exception e) {
                String err = truncate(e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName(), MAX_ERROR);
                row.setStatus(ConnectorStagingStatus.FAILED);
                row.setPromoteBatchId(promoteBatchId);
                row.setPromotedAt(Instant.now());
                row.setPromotedIndex(null);
                row.setPromotedDocId(null);
                row.setPromoteError(err);
                stagingRepository.save(row);
                failed++;
                results.add(resultEntry(id, ConnectorStagingStatus.FAILED, err, null, null));
                log.warn(
                    "Connector staging promote failed stagingId={} batchId={}: {}",
                    id,
                    promoteBatchId,
                    err
                );
            }
        }

        log.info(
            "Connector staging promote batchId={} index={} requested={} promoted={} failed={} skipped={}",
            promoteBatchId,
            destinationIndex,
            ids.size(),
            promoted,
            failed,
            skipped
        );

        return new ConnectorPromoteResult(
            promoteBatchId,
            destinationIndex,
            ids.size(),
            promoted,
            failed,
            skipped,
            results
        );
    }

    /**
     * Optional scheduler path: promote up to {@code limit} PENDING rows.
     */
    @Transactional
    public ConnectorPromoteResult promotePendingBatch(int limit) {
        int size = Math.min(Math.max(limit, 1), MAX_BATCH);
        List<HaConnectorAlertStaging> pending = stagingRepository.findByStatusOrderByIdAsc(
            ConnectorStagingStatus.PENDING,
            PageRequest.of(0, size)
        );
        if (pending.isEmpty()) {
            return new ConnectorPromoteResult(
                null,
                HaIndexNames.buildCurrentDayIndex(ConnectorPromoteResult.INDEX_TYPE),
                0,
                0,
                0,
                0,
                List.of()
            );
        }
        List<Long> ids = pending.stream().map(HaConnectorAlertStaging::getId).toList();
        return promoteByIds(ids);
    }

    static void assertSafeDestination(String index) {
        if (index == null || index.isBlank()) {
            throw new IllegalStateException("promote destination index is blank");
        }
        if (index.contains("alert")) {
            throw new IllegalStateException(
                "Refusing promote to alert index '" + index + "' — ADR forbids v3-hive-alert-*"
            );
        }
        if (!index.startsWith("v3-hive-connector-promoted-")) {
            throw new IllegalStateException(
                "Refusing promote to unexpected index '" + index + "' — expected v3-hive-connector-promoted-*"
            );
        }
    }

    static Map<String, Object> buildPromotedDocument(
            HaConnectorAlertStaging row,
            String promoteBatchId,
            String destinationIndex) {
        Map<String, Object> doc = new LinkedHashMap<>();
        Instant now = Instant.now();
        doc.put("@timestamp", now.toString());
        doc.put("ha.document.kind", ConnectorPromoteResult.DOCUMENT_KIND);
        doc.put("ha.correlation.status", ConnectorPromoteResult.CORRELATION_STATUS);
        doc.put("ha.provenance", ConnectorPromoteResult.PROVENANCE);
        doc.put("ha.staging.id", row.getId());
        doc.put("ha.staging.ingest_batch_id", row.getIngestBatchId());
        doc.put("ha.staging.promote_batch_id", promoteBatchId);
        doc.put("ha.staging.destination_index", destinationIndex);
        doc.put("ha.connector.id", row.getConnectorId());
        doc.put("ha.connector.instance_id", row.getConnectorInstanceId());
        doc.put("ha.external.id", row.getExternalId());
        doc.put("title", row.getTitle());
        doc.put("description", row.getDescription());
        doc.put("severity", row.getSeverity());
        doc.put("hostname", row.getHostname());
        doc.put("src_ip", row.getSrcIp());
        doc.put("mitre_techniques", row.getMitreTechniques());
        if (row.getAlertCreatedAt() != null) {
            doc.put("alert_created_at", row.getAlertCreatedAt().toString());
        }
        if (row.getIngestedAt() != null) {
            doc.put("ingested_at", row.getIngestedAt().toString());
        }
        // Explicit non-claims for SIEM honesty
        doc.put("ha.siem.correlated_alert", false);
        doc.put("ha.siem.inject_used", false);
        return doc;
    }

    private static Map<String, Object> resultEntry(
            Long id,
            String status,
            String error,
            String index,
            String docId) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("status", status);
        if (error != null) {
            m.put("error", error);
        }
        if (index != null) {
            m.put("promotedIndex", index);
        }
        if (docId != null) {
            m.put("promotedDocId", docId);
        }
        return m;
    }

    private static String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        if (value.length() <= max) {
            return value;
        }
        return value.substring(0, max);
    }
}
