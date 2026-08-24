package com.hivearmor.web.rest;

import com.hivearmor.service.connector.ConnectionTestResult;
import com.hivearmor.service.connector.ConnectorAlertIngestService;
import com.hivearmor.service.connector.ConnectorIngestResult;
import com.hivearmor.service.connector.ConnectorPromoteResult;
import com.hivearmor.service.connector.ConnectorStagingPromoteService;
import com.hivearmor.service.connector.HaConnectorInstanceService;
import com.hivearmor.service.dto.connector.ConnectorInstanceDTO;
import com.hivearmor.service.dto.connector.ConnectorInstanceWriteDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Typed Connector SDK REST surface ({@code /api/ha-connectors/*}).
 *
 * <p>Secrets are never returned. {@code fetch-alerts} remains a dry-run preview.
 * {@code ingest-alerts} persists to the ADR-20260824 PostgreSQL staging queue
 * ({@code ha_connector_alert_staging}) — never to OpenSearch alert indices.
 * Promote (ADR-20260824-connector-staging-bridge) writes labeled
 * {@code v3-hive-connector-promoted-*} docs only — never {@code /v1/inject}.
 */
@RestController
@RequestMapping("/api")
public class HaConnectorResource {

    private static final Logger log = LoggerFactory.getLogger(HaConnectorResource.class);
    private static final String CLASSNAME = "HaConnectorResource";
    private static final String MUTATE =
        "hasAnyAuthority('ROLE_ADMIN', 'ROLE_SOC_MANAGER')";
    private static final String READ =
        "hasAnyAuthority('ROLE_ADMIN', 'ROLE_SOC_MANAGER')";
    private static final String PROMOTE =
        "hasAuthority('ROLE_ADMIN')";

    private final HaConnectorInstanceService service;
    private final ConnectorAlertIngestService ingestService;
    private final ConnectorStagingPromoteService promoteService;

    public HaConnectorResource(
            HaConnectorInstanceService service,
            ConnectorAlertIngestService ingestService,
            ConnectorStagingPromoteService promoteService) {
        this.service = service;
        this.ingestService = ingestService;
        this.promoteService = promoteService;
    }

    @GetMapping("/ha-connectors/catalog")
    @PreAuthorize(READ)
    public ResponseEntity<List<Map<String, Object>>> catalog() {
        return ResponseEntity.ok(service.catalog());
    }

    @GetMapping("/ha-connectors/instances")
    @PreAuthorize(READ)
    public ResponseEntity<List<ConnectorInstanceDTO>> listInstances() {
        return ResponseEntity.ok(service.listInstances());
    }

    @GetMapping("/ha-connectors/instances/{id}")
    @PreAuthorize(READ)
    public ResponseEntity<ConnectorInstanceDTO> getInstance(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(service.getInstance(id));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/ha-connectors/instances")
    @PreAuthorize(MUTATE)
    public ResponseEntity<?> create(@RequestBody ConnectorInstanceWriteDTO body) {
        final String ctx = CLASSNAME + ".create";
        try {
            ConnectorInstanceDTO created = service.create(body);
            return ResponseEntity
                .created(URI.create("/api/ha-connectors/instances/" + created.getId()))
                .body(created);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("detail", e.getMessage()));
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @PutMapping("/ha-connectors/instances/{id}")
    @PreAuthorize(MUTATE)
    public ResponseEntity<?> update(@PathVariable Long id, @RequestBody ConnectorInstanceWriteDTO body) {
        final String ctx = CLASSNAME + ".update";
        try {
            return ResponseEntity.ok(service.update(id, body));
        } catch (IllegalArgumentException e) {
            if (e.getMessage() != null && e.getMessage().contains("not found")) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.badRequest().body(Map.of("detail", e.getMessage()));
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @DeleteMapping("/ha-connectors/instances/{id}")
    @PreAuthorize(MUTATE)
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        try {
            service.delete(id);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/ha-connectors/instances/{id}/test")
    @PreAuthorize(MUTATE)
    public ResponseEntity<?> test(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".test";
        try {
            ConnectionTestResult result = service.test(id);
            return ResponseEntity.ok(result.toMap());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("ok", false, "message", "Test failed"));
        }
    }

    @PostMapping("/ha-connectors/instances/{id}/fetch-alerts")
    @PreAuthorize(MUTATE)
    public ResponseEntity<?> fetchAlerts(
            @PathVariable Long id,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant since,
            @RequestParam(required = false, defaultValue = "false") boolean persist) {
        try {
            if (persist) {
                ConnectorIngestResult result = ingestService.ingest(id, since);
                return ResponseEntity.ok(result.toMap());
            }
            List<Map<String, Object>> alerts = service.fetchAlerts(id, since);
            return ResponseEntity.ok(Map.of(
                "alerts", alerts,
                "count", alerts.size(),
                "persisted", false,
                "note", "Dry-run only — use POST .../ingest-alerts or persist=true for ADR-20260824 staging queue"
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("detail", e.getMessage()));
        }
    }

    /**
     * Pull vendor alerts and persist to {@code ha_connector_alert_staging}
     * (ADR-20260824). Does not write OpenSearch alert indices.
     */
    @PostMapping("/ha-connectors/instances/{id}/ingest-alerts")
    @PreAuthorize(MUTATE)
    public ResponseEntity<?> ingestAlerts(
            @PathVariable Long id,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant since) {
        final String ctx = CLASSNAME + ".ingestAlerts";
        try {
            ConnectorIngestResult result = ingestService.ingest(id, since);
            return ResponseEntity.ok(result.toMap());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("detail", e.getMessage()));
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("detail", "Ingest failed"));
        }
    }

    @GetMapping("/ha-connectors/instances/{id}/staged-alerts")
    @PreAuthorize(READ)
    public ResponseEntity<?> stagedAlerts(
            @PathVariable Long id,
            @RequestParam(required = false, defaultValue = "50") int limit) {
        try {
            // Ensure instance exists
            service.getInstance(id);
            List<Map<String, Object>> rows = ingestService.listStaged(id, limit);
            return ResponseEntity.ok(Map.of(
                "alerts", rows,
                "count", rows.size(),
                "destination", ConnectorIngestResult.DESTINATION,
                "persisted", true,
                "note", "ADR-20260824 staging queue — not customer OpenSearch alert index"
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * Promote one staged row to {@code v3-hive-connector-promoted-*}
     * (ADR-20260824-connector-staging-bridge). Admin only. Never {@code /v1/inject}.
     */
    @PostMapping("/ha-connectors/staged-alerts/{id}/promote")
    @PreAuthorize(PROMOTE)
    public ResponseEntity<?> promoteOne(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".promoteOne";
        try {
            ConnectorPromoteResult result = promoteService.promoteOne(id);
            return ResponseEntity.ok(result.toMap());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("detail", e.getMessage()));
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("detail", "Promote failed"));
        }
    }

    /**
     * Promote a batch of staged rows by id. Admin only.
     * Body: {@code { "ids": [1, 2, ...] }} (max 100).
     */
    @PostMapping("/ha-connectors/staged-alerts/promote")
    @PreAuthorize(PROMOTE)
    public ResponseEntity<?> promoteBatch(@RequestBody Map<String, Object> body) {
        final String ctx = CLASSNAME + ".promoteBatch";
        try {
            List<Long> ids = extractIds(body);
            ConnectorPromoteResult result = promoteService.promoteByIds(ids);
            return ResponseEntity.ok(result.toMap());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("detail", e.getMessage()));
        } catch (Exception e) {
            log.error("{}: {}", ctx, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("detail", "Promote failed"));
        }
    }

    private static List<Long> extractIds(Map<String, Object> body) {
        if (body == null || !body.containsKey("ids")) {
            throw new IllegalArgumentException("body.ids is required");
        }
        Object raw = body.get("ids");
        if (!(raw instanceof List<?> list) || list.isEmpty()) {
            throw new IllegalArgumentException("body.ids must be a non-empty array");
        }
        List<Long> ids = new java.util.ArrayList<>();
        for (Object item : list) {
            if (item instanceof Number n) {
                ids.add(n.longValue());
            } else if (item instanceof String s) {
                try {
                    ids.add(Long.parseLong(s.trim()));
                } catch (NumberFormatException e) {
                    throw new IllegalArgumentException("invalid staging id: " + item);
                }
            } else {
                throw new IllegalArgumentException("invalid staging id: " + item);
            }
        }
        return ids;
    }
}
