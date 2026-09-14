package com.hivearmor.service.connector;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.connector.ConnectorStagingStatus;
import com.hivearmor.domain.connector.HaConnectorAlertStaging;
import com.hivearmor.domain.connector.HaConnectorInstance;
import com.hivearmor.repository.connector.HaConnectorAlertStagingRepository;
import com.hivearmor.multitenancy.TenantScope;
import com.hivearmor.repository.connector.HaConnectorInstanceRepository;
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
import java.util.stream.Collectors;

/**
 * Persists connector-normalized alerts into the ADR-20260824 PostgreSQL staging
 * queue ({@code ha_connector_alert_staging}).
 *
 * <p>Does <strong>not</strong> write OpenSearch alert indices and does not call
 * event-processor inject. A follow-up ADR is required for an EP bridge.
 */
@Service
public class ConnectorAlertIngestService {

    private static final Logger log = LoggerFactory.getLogger(ConnectorAlertIngestService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int MAX_TITLE = 512;
    private static final int MAX_HOST = 256;
    private static final int MAX_IP = 64;
    private static final int MAX_MITRE = 512;
    private static final int MAX_EXT = 256;

    private final HaConnectorRegistry registry;
    private final HaConnectorInstanceRepository instanceRepository;
    private final HaConnectorAlertStagingRepository stagingRepository;
    private final HaConnectorInstanceService instanceService;

    public ConnectorAlertIngestService(
            HaConnectorRegistry registry,
            HaConnectorInstanceRepository instanceRepository,
            HaConnectorAlertStagingRepository stagingRepository,
            HaConnectorInstanceService instanceService) {
        this.registry = registry;
        this.instanceRepository = instanceRepository;
        this.stagingRepository = stagingRepository;
        this.instanceService = instanceService;
    }

    /**
     * Fetch from vendor + stage. Safe for on-demand REST and playbook pull_alerts.
     */
    @Transactional
    public ConnectorIngestResult ingest(Long instanceId, Instant since) {
        HaConnectorInstance row = instanceRepository.findById(instanceId)
            .orElseThrow(() -> new IllegalArgumentException("Connector instance not found: " + instanceId));
        HaConnector connector = registry.require(row.getConnectorId());
        if (!connector.capabilities().contains(ConnectorCapability.PULL_ALERTS)
            && !connector.capabilities().contains(ConnectorCapability.PULL_AUDIT)) {
            throw new IllegalStateException(
                "Connector " + row.getConnectorId() + " does not declare PULL_ALERTS/PULL_AUDIT");
        }
        Instant from = since != null ? since : Instant.now().minusSeconds(3600);
        List<NormalizedAlert> alerts = instanceService.fetchAlertsNormalized(instanceId, from);
        return stage(row, connector.connectorId(), alerts);
    }

    /**
     * Stage already-normalized alerts (unit tests / stubs — no live vendor).
     */
    @Transactional
    public ConnectorIngestResult stageNormalized(
            Long instanceId,
            String connectorId,
            List<NormalizedAlert> alerts) {
        HaConnectorInstance row = instanceRepository.findById(instanceId)
            .orElseThrow(() -> new IllegalArgumentException("Connector instance not found: " + instanceId));
        String cid = connectorId != null && !connectorId.isBlank() ? connectorId : row.getConnectorId();
        return stage(row, cid, alerts != null ? alerts : List.of());
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listStaged(Long instanceId, int limit) {
        int size = Math.min(Math.max(limit, 1), 200);
        // SPEC-04 (W1b) — scope the staged-alert list to the caller's tenant so it
        // cannot read another tenant's staged rows for an instance id it does not own.
        long tenant = TenantScope.requireTenant();
        return stagingRepository
            .findByTenantIdAndConnectorInstanceIdOrderByIngestedAtDesc(tenant, instanceId, PageRequest.of(0, size))
            .stream()
            .map(this::toAuditMap)
            .collect(Collectors.toList());
    }

    /**
     * Scheduled pull for the CURRENT TENANT's enabled instances that declare PULL_ALERTS.
     *
     * <p>SPEC-04 (W1b) FU-4 — scoped to {@code TenantScope.requireTenant()} (the scheduler
     * wraps this in {@link com.hivearmor.multitenancy.TenantScopedBackgroundExecutor} which
     * sets the per-tenant context). Using the tenant-scoped finder keeps this correct both
     * before RLS (no cross-tenant duplicate processing) and after (matches RLS visibility).
     */
    @Transactional
    public List<ConnectorIngestResult> ingestEnabledPullers() {
        List<ConnectorIngestResult> out = new ArrayList<>();
        for (HaConnectorInstance row : instanceRepository.findByTenantIdOrderByNameAsc(TenantScope.requireTenant())) {
            if (!row.isEnabled()) {
                continue;
            }
            HaConnector connector;
            try {
                connector = registry.require(row.getConnectorId());
            } catch (IllegalArgumentException e) {
                continue;
            }
            if (!connector.capabilities().contains(ConnectorCapability.PULL_ALERTS)
                && !connector.capabilities().contains(ConnectorCapability.PULL_AUDIT)) {
                continue;
            }
            Instant since = row.getLastIngestAt() != null
                ? row.getLastIngestAt()
                : Instant.now().minusSeconds(3600);
            try {
                out.add(ingest(row.getId(), since));
            } catch (Exception e) {
                log.warn(
                    "Connector scheduled ingest failed instanceId={} connectorId={}: {}",
                    row.getId(),
                    row.getConnectorId(),
                    e.getMessage()
                );
            }
        }
        return out;
    }

    private ConnectorIngestResult stage(
            HaConnectorInstance row,
            String connectorId,
            List<NormalizedAlert> alerts) {
        String batchId = UUID.randomUUID().toString();
        Instant now = Instant.now();
        int inserted = 0;
        int skipped = 0;
        List<Map<String, Object>> alertMaps = new ArrayList<>();

        for (NormalizedAlert alert : alerts) {
            if (alert == null) {
                continue;
            }
            String externalId = truncate(alert.getExternalId(), MAX_EXT);
            if (externalId == null || externalId.isBlank()) {
                skipped++;
                continue;
            }
            alertMaps.add(alert.toMap());
            if (stagingRepository.existsByConnectorInstanceIdAndExternalId(row.getId(), externalId)) {
                skipped++;
                continue;
            }
            HaConnectorAlertStaging staging = new HaConnectorAlertStaging();
            staging.setConnectorInstanceId(row.getId());
            // SPEC-04 (W1b) — inherit the authoritative tenant from the parent
            // connector instance (out-of-band ingest has no request tenant).
            staging.setTenantId(row.getTenantId());
            staging.setConnectorId(connectorId);
            staging.setExternalId(externalId);
            staging.setTitle(truncate(alert.getTitle(), MAX_TITLE));
            staging.setDescription(alert.getDescription());
            staging.setSeverity(truncate(alert.getSeverity(), 64));
            staging.setHostname(truncate(alert.getHostname(), MAX_HOST));
            staging.setSrcIp(truncate(alert.getSrcIp(), MAX_IP));
            staging.setMitreTechniques(truncate(joinMitre(alert.getMitreTechniques()), MAX_MITRE));
            staging.setAlertCreatedAt(alert.getCreatedAt());
            staging.setRawJson(toJson(alert.getRawEvent()));
            staging.setIngestBatchId(batchId);
            staging.setIngestedAt(now);
            staging.setStatus(ConnectorStagingStatus.PENDING);
            stagingRepository.save(staging);
            inserted++;
        }

        row.setLastIngestAt(now);
        row.setLastIngestCount(inserted);
        row.setLastIngestBatchId(batchId);
        row.setUpdatedAt(now);
        instanceRepository.save(row);

        log.info(
            "Connector staging ingest batchId={} instanceId={} connectorId={} fetched={} inserted={} skipped={}",
            batchId,
            row.getId(),
            connectorId,
            alerts.size(),
            inserted,
            skipped
        );

        return new ConnectorIngestResult(
            batchId,
            row.getId(),
            connectorId,
            alerts.size(),
            inserted,
            skipped,
            alertMaps
        );
    }

    private Map<String, Object> toAuditMap(HaConnectorAlertStaging row) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", row.getId());
        m.put("connectorInstanceId", row.getConnectorInstanceId());
        m.put("connectorId", row.getConnectorId());
        m.put("externalId", row.getExternalId());
        m.put("title", row.getTitle());
        m.put("severity", row.getSeverity());
        m.put("hostname", row.getHostname());
        m.put("srcIp", row.getSrcIp());
        m.put("alertCreatedAt", row.getAlertCreatedAt() != null ? row.getAlertCreatedAt().toString() : null);
        m.put("ingestBatchId", row.getIngestBatchId());
        m.put("ingestedAt", row.getIngestedAt() != null ? row.getIngestedAt().toString() : null);
        m.put("status", row.getStatus() != null ? row.getStatus() : ConnectorStagingStatus.PENDING);
        m.put("destination", ConnectorIngestResult.DESTINATION);
        return m;
    }

    private static String joinMitre(List<String> techniques) {
        if (techniques == null || techniques.isEmpty()) {
            return null;
        }
        return String.join(",", techniques);
    }

    private static String toJson(Map<String, Object> raw) {
        if (raw == null || raw.isEmpty()) {
            return null;
        }
        try {
            return MAPPER.writeValueAsString(raw);
        } catch (Exception e) {
            return null;
        }
    }

    private static String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        String t = value.trim();
        if (t.length() <= max) {
            return t;
        }
        return t.substring(0, max);
    }
}
