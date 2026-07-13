package com.hivearmor.web.rest.alert_response_rule;

import com.hivearmor.domain.alert_response_rule.UtmAlertResponseActionTemplate;
import com.hivearmor.domain.alert_response_rule.UtmAlertResponseRule;
import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.service.UtmStackService;
import com.hivearmor.service.alert_response_rule.UtmAlertResponseActionTemplateQueryService;
import com.hivearmor.service.alert_response_rule.UtmAlertResponseRuleQueryService;
import com.hivearmor.service.alert_response_rule.UtmAlertResponseRuleService;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.dto.UtmAlertResponseActionTemplateCriteria;
import com.hivearmor.service.dto.UtmAlertResponseActionTemplateDTO;
import com.hivearmor.service.dto.UtmAlertResponseRuleCriteria;
import com.hivearmor.service.dto.UtmAlertResponseRuleDTO;
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
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class UtmAlertResponseRuleResource {

    private static final String CLASSNAME = "UtmAlertResponseRuleResource";
    private final Logger log = LoggerFactory.getLogger(UtmAlertResponseRuleResource.class);

    private final UtmAlertResponseRuleService alertResponseRuleService;
    private final UtmAlertResponseRuleQueryService alertResponseRuleQueryService;
    private final ApplicationEventService eventService;
    private final UtmStackService utmStackService;

    private final UtmAlertResponseActionTemplateQueryService utmAlertResponseActionTemplateQueryService;



    @PostMapping("/ha-alert-response-rules")
    public ResponseEntity<UtmAlertResponseRuleDTO> createAlertResponseRule(@Valid @RequestBody UtmAlertResponseRuleDTO dto) {
        final String ctx = CLASSNAME + ".createAlertResponseRule";
        try {
            if (dto.getId() != null) {
                String msg = ctx + ": A new rule cannot already have an ID";
                log.error(msg);
                eventService.createEvent(msg, ApplicationEventType.ERROR);
                return ResponseUtil.buildErrorResponse(HttpStatus.BAD_REQUEST, msg);
            }

            if (utmStackService.isInDevelop()) {
                dto.setId(alertResponseRuleService.getSystemSequenceNextValue());
                dto.setSystemOwner(true);
            } else {
                dto.setSystemOwner(false);
            }

            return ResponseEntity.ok(new UtmAlertResponseRuleDTO(alertResponseRuleService.save(new UtmAlertResponseRule(dto), true)));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PutMapping("/ha-alert-response-rules")
    public ResponseEntity<UtmAlertResponseRuleDTO> updateAlertResponseRule(@Valid @RequestBody UtmAlertResponseRuleDTO dto) {
        final String ctx = CLASSNAME + ".updateAlertResponseRule";
        try {
            if (dto.getId() == null) {
                String msg = ctx + ": The rule you are trying to update does not have a valid ID";
                log.error(msg);
                eventService.createEvent(msg, ApplicationEventType.ERROR);
                return ResponseUtil.buildErrorResponse(HttpStatus.BAD_REQUEST, msg);
            }
            return ResponseEntity.ok(new UtmAlertResponseRuleDTO(alertResponseRuleService.save(new UtmAlertResponseRule(dto), false)));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/ha-alert-response-rules")
    public ResponseEntity<List<UtmAlertResponseRuleDTO>> getAllAlertResponseRules(@ParameterObject UtmAlertResponseRuleCriteria criteria,
                                                                                  @ParameterObject Pageable pageable) {
        final String ctx = CLASSNAME + ".getAllAlertResponseRules";
        try {
            Page<UtmAlertResponseRuleDTO> page = alertResponseRuleQueryService.findByCriteria(criteria, pageable);
            HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(page, "/api/ha-alert-Response-rules");
            return ResponseEntity.ok().headers(headers).body(page.getContent());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/ha-alert-response-action-templates")
    public ResponseEntity<List<UtmAlertResponseActionTemplateDTO>> getAllAlertResponseActionTemplate(@ParameterObject UtmAlertResponseActionTemplateCriteria criteria,
                                                                                  @ParameterObject Pageable pageable) {
        final String ctx = CLASSNAME + ".getAllAlertResponseActionTemplate";
        try {
            Page<UtmAlertResponseActionTemplate> page = utmAlertResponseActionTemplateQueryService.findByCriteria(criteria, pageable);
            HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(page, "/api/ha-alert-response-action-templates");
            return ResponseEntity.ok().headers(headers).body(page.getContent().stream().map(UtmAlertResponseActionTemplateDTO::fromEntity)
                    .collect(Collectors.toList()));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/ha-alert-response-rules/{id}")
    public ResponseEntity<UtmAlertResponseRuleDTO> getAlertResponseRule(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".getAlertResponseRule";
        try {
            return ResponseEntity.ok().body(alertResponseRuleQueryService.findById(id));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/ha-alert-response-rules/resolve-filter-values")
    public ResponseEntity<Map<String, List<String>>> resolveFilterValues() {
        final String ctx = CLASSNAME + ".getAlertResponseRule";
        try {
            return ResponseEntity.ok(alertResponseRuleService.resolveFilterValues());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            eventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }
}
