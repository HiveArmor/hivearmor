package com.hivearmor.web.rest.correlation.rules;

import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.domain.alert_response_rule.UtmAlertResponseRule;
import com.hivearmor.security.telemetry.TelemetryAgentIdentityFilter;
import com.hivearmor.service.agent_manager.AgentService;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.alert_response_rule.UtmAlertResponseRuleService;
import com.hivearmor.service.correlation.rules.UtmRulePushService;
import com.hivearmor.service.dto.UtmRulePushLogDTO;
import com.hivearmor.service.dto.agent_manager.AgentDTO;
import com.hivearmor.util.ResponseUtil;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Alert-response rule distribution to agents.
 *
 * <p>Operator push/status: Admin | SOC Manager | Analyst.
 * Agent ACK ({@code POST …/push-status/{ruleId}/ack}): enrolled device headers
 * ({@code X-HiveArmor-Agent-Id} + {@code X-Agent-Key}) or Admin|SOC Manager JWT (BE-POL-02).
 * STAGING CANDIDATE — not PRODUCTION READY.
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class RuleDistributionResource {

    private static final String CLASSNAME = "RuleDistributionResource";
    private static final String OPERATOR_AUTH =
        "hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST')";
    private static final String ACK_AUTH =
        "hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_AGENT_DEVICE')";

    private final Logger log = LoggerFactory.getLogger(RuleDistributionResource.class);

    private final UtmRulePushService pushService;
    private final UtmAlertResponseRuleService alertResponseRuleService;
    private final AgentService agentService;
    private final ApplicationEventService applicationEventService;

    @PostMapping("/alert-response-rules/push")
    @PreAuthorize(OPERATOR_AUTH)
    public ResponseEntity<Void> pushRuleToAgents(@RequestBody Map<String, Object> request) {
        final String ctx = CLASSNAME + ".pushRuleToAgents";
        try {
            Long ruleId = request.containsKey("ruleId")
                ? Long.valueOf(request.get("ruleId").toString()) : null;
            if (ruleId == null) {
                return ResponseUtil.buildErrorResponse(HttpStatus.BAD_REQUEST, ctx + ": ruleId is required");
            }

            Optional<UtmAlertResponseRule> ruleOpt = alertResponseRuleService.findOne(ruleId);
            if (ruleOpt.isEmpty()) {
                return ResponseUtil.buildErrorResponse(HttpStatus.NOT_FOUND, ctx + ": Rule not found");
            }
            UtmAlertResponseRule rule = ruleOpt.get();

            @SuppressWarnings("unchecked")
            List<String> requestedAgentIds = request.containsKey("agentIds")
                ? (List<String>) request.get("agentIds") : List.of();

            List<String> targetAgentIds;
            if (requestedAgentIds == null || requestedAgentIds.isEmpty()) {
                List<AgentDTO> allAgents = agentService.getInstalledAgents();
                targetAgentIds = allAgents.stream()
                    .filter(a -> rule.getAgentPlatform() == null
                        || rule.getAgentPlatform().isBlank()
                        || rule.getAgentPlatform().equalsIgnoreCase(a.getPlatform()))
                    .map(a -> String.valueOf(a.getId()))
                    .collect(Collectors.toList());
            } else {
                targetAgentIds = requestedAgentIds;
            }

            if (targetAgentIds.isEmpty()) {
                return ResponseUtil.buildErrorResponse(HttpStatus.BAD_REQUEST, ctx + ": No matching agents found");
            }

            String pushedBy = SecurityContextHolder.getContext().getAuthentication() != null
                ? SecurityContextHolder.getContext().getAuthentication().getName() : "system";

            pushService.pushRuleToAgents(ruleId, rule.getRuleName(), targetAgentIds, pushedBy);
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/alert-response-rules/push-status/{ruleId}")
    @PreAuthorize(OPERATOR_AUTH)
    public ResponseEntity<List<UtmRulePushLogDTO>> getPushStatus(@PathVariable Long ruleId) {
        final String ctx = CLASSNAME + ".getPushStatus";
        try {
            List<UtmRulePushLogDTO> logs = pushService.getPushStatus(ruleId).stream()
                .map(UtmRulePushLogDTO::new)
                .collect(Collectors.toList());
            return ResponseEntity.ok(logs);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    /**
     * Agent rule-sync ACK (BE-POL-02). Matches agent {@code policy_sync.go}
     * {@code POST /api/alert-response-rules/push-status/{ruleId}/ack?agentId=…}.
     * When device-authenticated, {@code agentId} is bound to the verified connector id
     * (query spoofing ignored). Never logs agent keys.
     */
    @PostMapping("/alert-response-rules/push-status/{ruleId}/ack")
    @PreAuthorize(ACK_AUTH)
    public ResponseEntity<Void> acknowledgePush(@PathVariable Long ruleId,
                                                @RequestParam(required = false) String agentId,
                                                HttpServletRequest request) {
        final String ctx = CLASSNAME + ".acknowledgePush";
        try {
            Object attr = request.getAttribute(TelemetryAgentIdentityFilter.ATTR_AGENT_CONNECTOR_ID);
            String boundAgentId;
            if (attr instanceof Integer connectorId) {
                boundAgentId = String.valueOf(connectorId);
            } else {
                boundAgentId = agentId;
            }
            if (boundAgentId == null || boundAgentId.isBlank()) {
                return ResponseUtil.buildErrorResponse(HttpStatus.BAD_REQUEST, ctx + ": agentId required");
            }
            boolean updated = pushService.acknowledgePush(ruleId, boundAgentId);
            if (!updated) {
                return ResponseUtil.buildErrorResponse(HttpStatus.NOT_FOUND,
                    ctx + ": no push log for ruleId=" + ruleId);
            }
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            String msg = ctx + ": " + e.getMessage();
            log.warn(msg);
            return ResponseUtil.buildErrorResponse(HttpStatus.BAD_REQUEST, msg);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }
}
