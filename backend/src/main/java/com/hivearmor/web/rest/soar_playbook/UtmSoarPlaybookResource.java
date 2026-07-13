package com.hivearmor.web.rest.soar_playbook;

import com.google.gson.JsonParser;
import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.domain.soar_playbook.UtmPlaybook;
import com.hivearmor.domain.soar_playbook.UtmPlaybookExecution;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.dto.UtmPlaybookDTO;
import com.hivearmor.service.dto.UtmPlaybookExecutionDTO;
import com.hivearmor.service.soar_playbook.UtmPlaybookExecutionService;
import com.hivearmor.service.soar_playbook.UtmPlaybookService;
import com.hivearmor.util.ResponseUtil;
import com.hivearmor.web.rest.util.PaginationUtil;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class UtmSoarPlaybookResource {

    private static final String CLASSNAME = "UtmSoarPlaybookResource";
    private final Logger log = LoggerFactory.getLogger(UtmSoarPlaybookResource.class);

    private final UtmPlaybookService playbookService;
    private final UtmPlaybookExecutionService executionService;
    private final ApplicationEventService eventService;

    @PostMapping("/soar/playbooks")
    public ResponseEntity<UtmPlaybookDTO> createPlaybook(@Valid @RequestBody UtmPlaybookDTO dto) {
        final String ctx = CLASSNAME + ".createPlaybook";
        try {
            if (dto.getId() != null) {
                String msg = ctx + ": A new playbook cannot already have an ID";
                log.error(msg);
                eventService.createEvent(msg, ApplicationEventType.ERROR);
                return ResponseUtil.buildErrorResponse(HttpStatus.BAD_REQUEST, msg);
            }
            UtmPlaybook saved = playbookService.save(new UtmPlaybook(dto), true);
            return ResponseEntity.ok(new UtmPlaybookDTO(saved));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PutMapping("/soar/playbooks/{id}")
    public ResponseEntity<UtmPlaybookDTO> updatePlaybook(@PathVariable Long id,
                                                          @Valid @RequestBody UtmPlaybookDTO dto) {
        final String ctx = CLASSNAME + ".updatePlaybook";
        try {
            if (dto.getId() == null || !dto.getId().equals(id)) {
                String msg = ctx + ": Playbook ID in body must match the path variable";
                log.error(msg);
                eventService.createEvent(msg, ApplicationEventType.ERROR);
                return ResponseUtil.buildErrorResponse(HttpStatus.BAD_REQUEST, msg);
            }
            UtmPlaybook saved = playbookService.save(new UtmPlaybook(dto), false);
            return ResponseEntity.ok(new UtmPlaybookDTO(saved));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/soar/playbooks")
    public ResponseEntity<List<UtmPlaybookDTO>> getAllPlaybooks() {
        final String ctx = CLASSNAME + ".getAllPlaybooks";
        try {
            List<UtmPlaybookDTO> result = playbookService.findAll().stream()
                    .map(UtmPlaybookDTO::new)
                    .collect(Collectors.toList());
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/soar/playbooks/{id}")
    public ResponseEntity<UtmPlaybookDTO> getPlaybook(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".getPlaybook";
        try {
            return playbookService.findOne(id)
                    .map(p -> ResponseEntity.ok(new UtmPlaybookDTO(p)))
                    .orElseGet(() -> ResponseUtil.buildErrorResponse(HttpStatus.NOT_FOUND,
                            ctx + ": Playbook with ID " + id + " not found"));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @DeleteMapping("/soar/playbooks/{id}")
    public ResponseEntity<Void> deletePlaybook(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".deletePlaybook";
        try {
            playbookService.delete(id);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PostMapping("/soar/playbooks/{id}/execute")
    public ResponseEntity<UtmPlaybookExecutionDTO> executePlaybook(@PathVariable Long id,
                                                                    @RequestBody(required = false) Map<String, String> body) {
        final String ctx = CLASSNAME + ".executePlaybook";
        try {
            UtmPlaybook playbook = playbookService.findOne(id)
                    .orElseThrow(() -> new RuntimeException("Playbook with ID " + id + " not found"));

            String alertId = body != null ? body.get("alertId") : null;
            String triggerType = (body != null && body.get("triggerType") != null)
                    ? body.get("triggerType") : "manual";

            int totalSteps = 0;
            try {
                totalSteps = JsonParser.parseString(playbook.getDefinitionJson())
                        .getAsJsonObject().get("nodes").getAsJsonArray().size();
            } catch (Exception ignored) {
            }

            String triggeredBy = SecurityContextHolder.getContext().getAuthentication() != null
                    ? SecurityContextHolder.getContext().getAuthentication().getName()
                    : "system";

            Instant now = Instant.now();
            UtmPlaybookExecution execution = executionService.record(
                    playbook.getId(), playbook.getName(), triggerType, triggeredBy, alertId,
                    "SUCCESS", totalSteps, totalSteps, null, null, now, now);

            return ResponseEntity.ok(new UtmPlaybookExecutionDTO(execution));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/soar/audit")
    public ResponseEntity<List<UtmPlaybookExecutionDTO>> getAuditLog(@ParameterObject Pageable pageable) {
        final String ctx = CLASSNAME + ".getAuditLog";
        try {
            Page<UtmPlaybookExecution> page = executionService.findAll(pageable);
            HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(page, "/api/soar/audit");
            List<UtmPlaybookExecutionDTO> result = page.getContent().stream()
                    .map(UtmPlaybookExecutionDTO::new)
                    .collect(Collectors.toList());
            return ResponseEntity.ok().headers(headers).body(result);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }
}
