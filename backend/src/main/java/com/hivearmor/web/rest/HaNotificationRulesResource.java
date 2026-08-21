package com.hivearmor.web.rest;

import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.service.HiveNotificationRuleService;
import com.hivearmor.service.dto.HiveNotificationRuleDTO;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST controller for the Notification Rules admin page (ADM-03).
 *
 * GET    /api/ha-notification-rules
 * POST   /api/ha-notification-rules
 * PUT    /api/ha-notification-rules/{id}
 * DELETE /api/ha-notification-rules/{id}
 * POST   /api/ha-notification-rules/test
 */
@RestController
@RequestMapping("/api")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class HaNotificationRulesResource {

    private static final Logger log = LoggerFactory.getLogger(HaNotificationRulesResource.class);

    private final HiveNotificationRuleService service;

    public HaNotificationRulesResource(HiveNotificationRuleService service) {
        this.service = service;
    }

    @GetMapping("/ha-notification-rules")
    public ResponseEntity<List<HiveNotificationRuleDTO>> getAll() {
        log.debug("REST request to get all notification rules");
        return ResponseEntity.ok(service.findAll());
    }

    @PostMapping("/ha-notification-rules")
    public ResponseEntity<HiveNotificationRuleDTO> create(@Valid @RequestBody HiveNotificationRuleDTO dto) {
        log.debug("REST request to create notification rule: {}", dto.getName());
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(dto));
    }

    @PutMapping("/ha-notification-rules/{id}")
    public ResponseEntity<HiveNotificationRuleDTO> update(@PathVariable Long id,
                                                          @Valid @RequestBody HiveNotificationRuleDTO dto) {
        log.debug("REST request to update notification rule: {}", id);
        return service.update(id, dto)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/ha-notification-rules/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        log.debug("REST request to delete notification rule: {}", id);
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * POST /api/ha-notification-rules/test
     * Fire a test notification to the given destination config.
     * Currently returns a mock success — wire to real dispatch when a notification engine is available.
     */
    @PostMapping("/ha-notification-rules/test")
    public ResponseEntity<Map<String, Object>> test(@RequestBody Map<String, Object> request) {
        log.debug("REST request to test notification channel: {}", request.get("destinationType"));
        // TODO: wire to real notification dispatch service when available (F-NOTIFY)
        return ResponseEntity.ok(Map.of(
            "success", true,
            "message", "Test notification queued (no dispatch engine connected yet)"
        ));
    }
}
