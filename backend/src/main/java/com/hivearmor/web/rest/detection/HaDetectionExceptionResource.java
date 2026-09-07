package com.hivearmor.web.rest.detection;

import com.hivearmor.security.SecurityUtils;
import com.hivearmor.service.detection.DetectionExceptionService;
import com.hivearmor.service.detection.dto.DetectionExceptionDtos.CreateExceptionRequest;
import com.hivearmor.service.detection.dto.DetectionExceptionDtos.DetectionExceptionDTO;
import jakarta.persistence.EntityNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * DET-FP-001 — persist / list / activate detection rule exceptions.
 *
 * <p>Preview remains on {@code HaExceptionPreviewResource}. This resource owns
 * the mutation path that was previously deferred.
 */
@RestController
@RequestMapping("/api")
public class HaDetectionExceptionResource {

    private static final Logger log = LoggerFactory.getLogger(HaDetectionExceptionResource.class);
    private static final String CLASSNAME = "HaDetectionExceptionResource";

    private static final String ANALYST_AUTH =
        "hasAuthority('ROLE_SOC_ANALYST') or hasAuthority('ROLE_SOC_MANAGER') "
            + "or hasAuthority('ROLE_ANALYST') or hasAuthority('ROLE_ADMIN')";

    private static final String SOC_MANAGER_AUTH =
        "hasAuthority('ROLE_SOC_MANAGER') or hasAuthority('ROLE_ADMIN')";

    private final DetectionExceptionService exceptionService;

    public HaDetectionExceptionResource(DetectionExceptionService exceptionService) {
        this.exceptionService = exceptionService;
    }

    @GetMapping("/ha-detection-rules/{ruleId}/exceptions")
    @PreAuthorize(ANALYST_AUTH)
    public ResponseEntity<List<DetectionExceptionDTO>> list(@PathVariable String ruleId) {
        return ResponseEntity.ok(exceptionService.listByRuleId(ruleId));
    }

    @PostMapping("/ha-detection-rules/{ruleId}/exceptions")
    @PreAuthorize(ANALYST_AUTH)
    public ResponseEntity<?> create(@PathVariable String ruleId,
                                    @RequestBody CreateExceptionRequest request) {
        try {
            String actor = SecurityUtils.getCurrentUserLogin().orElse("unknown");
            DetectionExceptionDTO created = exceptionService.create(ruleId, request, actor);
            return ResponseEntity.status(201).body(created);
        } catch (IllegalArgumentException e) {
            return badRequest("INVALID_EXCEPTION", e.getMessage());
        } catch (Exception e) {
            log.error("{}.create: ruleId={} error={}", CLASSNAME, ruleId, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/ha-detection-rules/{ruleId}/exceptions/{id}/activate")
    @PreAuthorize(SOC_MANAGER_AUTH)
    public ResponseEntity<?> activate(@PathVariable String ruleId, @PathVariable Long id) {
        try {
            String actor = SecurityUtils.getCurrentUserLogin().orElse("unknown");
            return ResponseEntity.ok(exceptionService.activate(ruleId, id, actor));
        } catch (EntityNotFoundException e) {
            return notFound(e.getMessage());
        } catch (Exception e) {
            log.error("{}.activate: ruleId={} id={} error={}", CLASSNAME, ruleId, id, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/ha-detection-rules/{ruleId}/exceptions/{id}/deactivate")
    @PreAuthorize(SOC_MANAGER_AUTH)
    public ResponseEntity<?> deactivate(@PathVariable String ruleId, @PathVariable Long id) {
        try {
            String actor = SecurityUtils.getCurrentUserLogin().orElse("unknown");
            return ResponseEntity.ok(exceptionService.deactivate(ruleId, id, actor));
        } catch (EntityNotFoundException e) {
            return notFound(e.getMessage());
        } catch (Exception e) {
            log.error("{}.deactivate: ruleId={} id={} error={}", CLASSNAME, ruleId, id, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        }
    }

    private ResponseEntity<Map<String, Object>> badRequest(String errorCode, String message) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("errorCode", errorCode);
        error.put("message", message);
        error.put("timestamp", Instant.now().toString());
        return ResponseEntity.badRequest().body(error);
    }

    private ResponseEntity<Map<String, Object>> notFound(String message) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("message", message);
        error.put("timestamp", Instant.now().toString());
        return ResponseEntity.status(404).body(error);
    }
}
