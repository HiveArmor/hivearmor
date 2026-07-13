package com.hivearmor.web.rest.soc_ai;

import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.domain.shared_types.alert.UtmAlert;
import com.hivearmor.domain.soc_ai.UtmAiTriage;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.soc_ai.SocAIService;
import com.hivearmor.service.soc_ai.UtmAiTriageService;
import com.hivearmor.web.rest.AccountResource;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/soc-ai")
@RequiredArgsConstructor
public class UtmSocAiResource {

    private final Logger log = LoggerFactory.getLogger(AccountResource.class);
    private static final String CLASSNAME = "UtmSocAiResource";

    private final ApplicationEventService applicationEventService;
    private final SocAIService socAIService;
    private final UtmAiTriageService triageService;

    /**
     * POST /api/soc-ai/analyze — submit alert for analysis and return cached/fresh result
     */
    @PostMapping("/analyze")
    public ResponseEntity<Object> analyzeAlert(@RequestBody UtmAlert alert) {
        final String ctx = CLASSNAME + ".analyzeAlert";
        try {
            if (alert == null || alert.getId() == null) {
                return ResponseEntity.badRequest().body(Map.of("status", "error", "message", "Alert ID is required"));
            }

            // Record pending entry before calling the AI service
            String alertId = String.valueOf(alert.getId());
            triageService.savePending(alertId);

            socAIService.analyzeAlert(alert);

            return ResponseEntity.accepted().body(Map.of(
                "status", "queued",
                "alertId", alert.getId(),
                "message", "Alert queued for SOC-AI analysis"
            ));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
                "status", "error",
                "message", msg
            ));
        }
    }

    /** GET /api/soc-ai/result/{alertId} — latest cached triage result */
    @GetMapping("/result/{alertId}")
    public ResponseEntity<UtmAiTriage> getResult(@PathVariable String alertId) {
        return triageService.getLatest(alertId)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.noContent().build());
    }

    /** GET /api/soc-ai/history/{alertId} — full triage history for an alert */
    @GetMapping("/history/{alertId}")
    public ResponseEntity<List<UtmAiTriage>> getHistory(@PathVariable String alertId) {
        return ResponseEntity.ok(triageService.getHistory(alertId));
    }

    /** POST /api/soc-ai/result/{alertId} — store a result sent back by the AI plugin */
    @PostMapping("/result/{alertId}")
    public ResponseEntity<UtmAiTriage> storeResult(
            @PathVariable String alertId,
            @RequestBody String rawJson) {
        UtmAiTriage saved = triageService.saveResult(alertId, rawJson);
        return ResponseEntity.ok(saved);
    }
}
