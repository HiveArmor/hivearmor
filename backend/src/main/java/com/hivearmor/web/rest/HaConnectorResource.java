package com.hivearmor.web.rest;

import com.hivearmor.service.connector.ConnectionTestResult;
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
 * <p>Secrets are never returned. {@code fetch-alerts} is a dry-run that does not
 * write OpenSearch (ADR required before ingest bypass of event-processor).
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

    private final HaConnectorInstanceService service;

    public HaConnectorResource(HaConnectorInstanceService service) {
        this.service = service;
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
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant since) {
        try {
            List<Map<String, Object>> alerts = service.fetchAlerts(id, since);
            return ResponseEntity.ok(Map.of(
                "alerts", alerts,
                "count", alerts.size(),
                "persisted", false,
                "note", "Dry-run only — does not write OpenSearch (ADR required for ingest)"
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }
}
