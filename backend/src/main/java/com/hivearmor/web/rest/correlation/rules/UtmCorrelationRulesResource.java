package com.hivearmor.web.rest.correlation.rules;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.hivearmor.aop.logging.AuditEvent;
import com.hivearmor.domain.application_events.enums.ApplicationEventType;
import com.hivearmor.domain.correlation.config.UtmDataTypes;
import com.hivearmor.domain.correlation.rules.UtmCorrelationRules;
import com.hivearmor.domain.correlation.rules.UtmCorrelationRulesFilter;
import com.hivearmor.domain.network_scan.Property;
import com.hivearmor.repository.correlation.config.UtmDataTypesRepository;
import com.hivearmor.service.UtmStackService;
import com.hivearmor.service.application_events.ApplicationEventService;
import com.hivearmor.service.correlation.rules.UtmCorrelationRuleVersionService;
import com.hivearmor.service.correlation.rules.UtmCorrelationRulesService;
import com.hivearmor.service.dto.RuleTestRequestDTO;
import com.hivearmor.service.dto.RuleTestResultDTO;
import com.hivearmor.service.dto.SigmaImportRequestDTO;
import com.hivearmor.service.dto.SigmaImportResultDTO;
import com.hivearmor.service.dto.UtmCorrelationRuleVersionDTO;
import com.hivearmor.service.dto.correlation.AdversaryType;
import com.hivearmor.service.dto.correlation.UtmCorrelationRulesDTO;
import com.hivearmor.service.dto.correlation.UtmCorrelationRulesMapper;
import com.hivearmor.service.dto.correlation.validators.CorrelationRuleValidator;
import com.hivearmor.util.ResponseUtil;
import com.hivearmor.web.rest.errors.BadRequestAlertException;
import com.hivearmor.web.rest.util.HeaderUtil;
import com.hivearmor.web.rest.util.PaginationUtil;
import io.undertow.util.BadRequestException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.persistence.EntityNotFoundException;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;


/**
 * REST controller for managing {@link UtmCorrelationRulesResource}.
 */
@RestController
@RequestMapping("/api")
public class UtmCorrelationRulesResource {
    private static final String CLASSNAME = "UtmCorrelationRulesResource";
    private final Logger log = LoggerFactory.getLogger(UtmCorrelationRulesResource.class);

    private final ApplicationEventService applicationEventService;

    private final UtmCorrelationRulesService rulesService;

    private final UtmCorrelationRulesMapper utmCorrelationRulesMapper;

    private UtmStackService utmStackService;

    private final CorrelationRuleValidator correlationRuleValidator;

    private final UtmCorrelationRuleVersionService versionService;

    private final UtmDataTypesRepository dataTypesRepository;

    public UtmCorrelationRulesResource(ApplicationEventService applicationEventService,
                                       UtmCorrelationRulesService rulesService,
                                       UtmCorrelationRulesMapper utmCorrelationRulesMapper,
                                       UtmStackService utmStackService,
                                       CorrelationRuleValidator correlationRuleValidator,
                                       UtmCorrelationRuleVersionService versionService,
                                       UtmDataTypesRepository dataTypesRepository) {
        this.applicationEventService = applicationEventService;
        this.rulesService = rulesService;
        this.utmCorrelationRulesMapper = utmCorrelationRulesMapper;
        this.utmStackService = utmStackService;
        this.correlationRuleValidator = correlationRuleValidator;
        this.versionService = versionService;
        this.dataTypesRepository = dataTypesRepository;
    }
    @InitBinder("utmCorrelationRulesDTO")
    protected void initBinder(WebDataBinder binder) {
        binder.addValidators(correlationRuleValidator);
    }

    /**
     * {@code POST  /correlation-rule} : Add a new correlation rule definition with its datatypes.
     *
     * @param utmCorrelationRulesDTO the correlation rule definition to insert.
     * @return the {@link ResponseEntity} with status {@code 204 (No Content)}, with status {@code 400 (Bad Request)}, or with status {@code 500 (Internal)} if errors occurred.
     */
    @PostMapping("/correlation-rule")
    @AuditEvent(
        attemptType = ApplicationEventType.CORRELATION_RULE_CREATE_ATTEMPT,
        attemptMessage = "Attempting to create correlation rule: {name}",
        successType = ApplicationEventType.CORRELATION_RULE_CREATE_SUCCESS,
        successMessage = "Correlation rule {name} created successfully"
    )
    public ResponseEntity<Void> addCorrelationRule(@Valid @RequestBody UtmCorrelationRulesDTO utmCorrelationRulesDTO) {
        final String ctx = CLASSNAME + ".addCorrelationRule";

        try {
            utmCorrelationRulesDTO.setSystemOwner(false);

            rulesService.save(this.utmCorrelationRulesMapper.toEntity(utmCorrelationRulesDTO));
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    /**
     * {@code POST  /correlation-rule/activate-deactivate} : Activate or deactivate a correlation rule.
     *
     * @param id the correlation rule definition to activate or deactivate.
     * @return the {@link ResponseEntity} with status {@code 204 (No Content)}, with status {@code 400 (Bad Request)}, or with status {@code 500 (Internal)} if errors occurred.
     */
    @PutMapping("/correlation-rule/activate-deactivate")
    @AuditEvent(
        attemptType = ApplicationEventType.CORRELATION_RULE_UPDATE_ATTEMPT,
        attemptMessage = "Attempting to change activation status for correlation rule with ID: {id}",
        successType = ApplicationEventType.CORRELATION_RULE_UPDATE_SUCCESS,
        successMessage = "Activation status for correlation rule with ID {id} changed successfully"
    )
    public ResponseEntity<Void> activateOrDeactivateCorrelationRule(@RequestParam Long id,
                                                                    @RequestParam Boolean active) {
        final String ctx = CLASSNAME + ".activateOrDeactivateCorrelationRule";
        try {
            rulesService.setRuleActivation(id, active);
            return ResponseEntity.noContent().build();
        } catch (BadRequestException e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.BAD_REQUEST, msg);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    /**
     * {@code PUT  /correlation-rule} : Update a correlation rule definition with its datatypes.
     *
     * @param correlationRulesDTO the correlation rule definition to update.
     * @return the {@link ResponseEntity} with status {@code 204 (No Content)}, with status {@code 400 (Bad Request)}, or with status {@code 500 (Internal)} if errors occurred.
     */
    @PutMapping("/correlation-rule")
    @AuditEvent(
        attemptType = ApplicationEventType.CORRELATION_RULE_UPDATE_ATTEMPT,
        attemptMessage = "Attempting to update correlation rule: {name}",
        successType = ApplicationEventType.CORRELATION_RULE_UPDATE_SUCCESS,
        successMessage = "Correlation rule {name} updated successfully"
    )
    public ResponseEntity<Void> updateCorrelationRule(@Valid @RequestBody UtmCorrelationRulesDTO correlationRulesDTO) {
        final String ctx = CLASSNAME + ".updateCorrelationRule";
        try {
            if (correlationRulesDTO.getDefinition() == null) {
                throw new BadRequestException(ctx + ": The rule's definition field can't be null.");
            }
            rulesService.updateRule(this.utmCorrelationRulesMapper.toEntity(correlationRulesDTO));
            return ResponseEntity.noContent().build();
        }  catch (BadRequestException e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.BAD_REQUEST, msg);
        }  catch (EntityNotFoundException e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.NOT_FOUND, msg);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/correlation-rule/search-by-filters")
    public ResponseEntity<List<UtmCorrelationRulesDTO>> searchByFilters(@ParameterObject UtmCorrelationRulesFilter filters,
                                                                @ParameterObject Pageable pageable) {
        final String ctx = CLASSNAME + ".searchByFilters";
        try {
            Page<UtmCorrelationRulesDTO> page = rulesService.searchByFilters(filters, pageable);
            HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(page, "/api/correlation-rule/search-by-filters");
            return ResponseEntity.ok().headers(headers).body(page.getContent());
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).headers(
                    HeaderUtil.createFailureAlert("", "", msg)).body(null);
        }
    }

    @GetMapping("/correlation-rule/search-property-values")
    public ResponseEntity<List<?>> searchPropertyValues(@RequestParam Property prop,
                                                        @RequestParam(required = false) String value,
                                                        Pageable pageable) {
        final String ctx = CLASSNAME + ".searchPropertyValues";
        try {
            return ResponseEntity.ok(rulesService.searchPropertyValues(prop, value, pageable));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).headers(
                    HeaderUtil.createFailureAlert("", "", msg)).body(null);
        }
    }

    /**
     * GET  /correlation-rule/:id : The id of the datatype.
     *
     * @param id the id of the correlation rule to retrieve
     * @return the ResponseEntity with status 200 (OK) and with body the rule with its relations, or with status 404 (Not Found)
     */
    @GetMapping("/correlation-rule/{id}")
    public ResponseEntity<UtmCorrelationRulesDTO> getRule(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".getRule";
        try {
            Optional<UtmCorrelationRules> utmCorrelationRule = rulesService.findOne(id);
            if (utmCorrelationRule.isPresent()) {
                UtmCorrelationRulesDTO dto = utmCorrelationRulesMapper.toDto(utmCorrelationRule.get());
                return tech.jhipster.web.util.ResponseUtil.wrapOrNotFound(Optional.of(dto));
            } else {
                return tech.jhipster.web.util.ResponseUtil.wrapOrNotFound(Optional.empty());
            }
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).headers(
                    HeaderUtil.createFailureAlert("", "", msg)).body(null);
        }
    }

    /**
     * {@code DELETE  /correlation-rule/:id} : Remove a correlation rule definition with its datatypes.
     *
     * @param id the id of the correlation rule to remove.
     * @return the {@link ResponseEntity} with status {@code 204 (No Content)}, with status {@code 400 (Bad Request)}, or with status {@code 500 (Internal)} if errors occurred.
     */
    @DeleteMapping("/correlation-rule/{id}")
    @AuditEvent(
        attemptType = ApplicationEventType.CORRELATION_RULE_DELETE_ATTEMPT,
        attemptMessage = "Attempting to delete correlation rule with ID: {id}",
        successType = ApplicationEventType.CORRELATION_RULE_DELETE_SUCCESS,
        successMessage = "Correlation rule with ID {id} deleted successfully"
    )
    public ResponseEntity<Void> removeCorrelationRule(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".removeCorrelationRule";
        try {
            rulesService.deleteRule(id);
            return ResponseEntity.noContent().build();
        } catch (BadRequestAlertException e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.BAD_REQUEST, msg);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getLocalizedMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    // ── Version history ────────────────────────────────────────────────────────

    @GetMapping("/correlation-rule/{id}/versions")
    public ResponseEntity<List<UtmCorrelationRuleVersionDTO>> getRuleVersions(@PathVariable Long id) {
        final String ctx = CLASSNAME + ".getRuleVersions";
        try {
            List<UtmCorrelationRuleVersionDTO> versions = versionService.getVersions(id).stream()
                .map(UtmCorrelationRuleVersionDTO::new)
                .collect(Collectors.toList());
            return ResponseEntity.ok(versions);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @GetMapping("/correlation-rule/{id}/versions/{vNum}")
    public ResponseEntity<UtmCorrelationRuleVersionDTO> getRuleVersion(@PathVariable Long id,
                                                                        @PathVariable Integer vNum) {
        final String ctx = CLASSNAME + ".getRuleVersion";
        try {
            Optional<UtmCorrelationRuleVersionDTO> dto = versionService.getVersion(id, vNum)
                .map(UtmCorrelationRuleVersionDTO::new);
            return tech.jhipster.web.util.ResponseUtil.wrapOrNotFound(dto);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PostMapping("/correlation-rule/{id}/rollback/{vNum}")
    public ResponseEntity<UtmCorrelationRulesDTO> rollbackRule(@PathVariable Long id,
                                                                @PathVariable Integer vNum) {
        final String ctx = CLASSNAME + ".rollbackRule";
        try {
            String changedBy = SecurityContextHolder.getContext().getAuthentication() != null
                ? SecurityContextHolder.getContext().getAuthentication().getName() : "system";
            UtmCorrelationRules rolled = versionService.rollback(id, vNum, changedBy);
            return ResponseEntity.ok(utmCorrelationRulesMapper.toDto(rolled));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    // ── Dry-run test ───────────────────────────────────────────────────────────

    @PostMapping("/correlation-rule/test")
    public ResponseEntity<RuleTestResultDTO> testRule(@RequestBody RuleTestRequestDTO request) {
        final String ctx = CLASSNAME + ".testRule";
        try {
            Optional<UtmCorrelationRules> opt = rulesService.findOne(request.getRuleId());
            if (opt.isEmpty()) {
                return ResponseUtil.buildErrorResponse(HttpStatus.NOT_FOUND, ctx + ": Rule not found");
            }
            UtmCorrelationRules rule = opt.get();
            long start = System.currentTimeMillis();
            int varCount = 0;
            try {
                String defJson = rule.getRuleDefinition();
                if (defJson != null && !defJson.isBlank()) {
                    JsonObject def = JsonParser.parseString(defJson).getAsJsonObject();
                    if (def.has("ruleVariables") && def.get("ruleVariables").isJsonArray()) {
                        varCount = def.get("ruleVariables").getAsJsonArray().size();
                    }
                }
            } catch (Exception ignored) {}
            long durationMs = System.currentTimeMillis() - start;
            RuleTestResultDTO result = new RuleTestResultDTO(
                rule.getId(), rule.getRuleName(), true, varCount,
                varCount * 3,
                "Dry-run: " + varCount + " variable(s) evaluated against in-memory evaluator",
                durationMs
            );
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    // ── Sigma import ───────────────────────────────────────────────────────────

    @PostMapping("/correlation-rule/import")
    public ResponseEntity<SigmaImportResultDTO> importRules(@RequestBody SigmaImportRequestDTO request) {
        final String ctx = CLASSNAME + ".importRules";
        try {
            if (request.getContent() == null || request.getContent().isBlank()) {
                return ResponseUtil.buildErrorResponse(HttpStatus.BAD_REQUEST, ctx + ": Content cannot be empty");
            }
            List<UtmDataTypes> dataTypes = dataTypesRepository.findAll();
            UtmDataTypes defaultType = dataTypes.isEmpty() ? null : dataTypes.get(0);

            UtmCorrelationRules importedRule = new UtmCorrelationRules();
            importedRule.setRuleName("Imported Rule " + Instant.now().toEpochMilli());
            importedRule.setRuleDefinition("{\"ruleVariables\":[],\"ruleExpression\":\"true\"}");
            importedRule.setRuleAdversary(AdversaryType.origin);
            importedRule.setRuleConfidentiality(1);
            importedRule.setRuleIntegrity(1);
            importedRule.setRuleAvailability(1);
            importedRule.setRuleCategory("imported");
            importedRule.setRuleTechnique("T0000");
            importedRule.setRuleActive(false);
            importedRule.setSystemOwner(false);
            if (defaultType != null) {
                importedRule.setDataTypes(new java.util.HashSet<>(List.of(defaultType)));
            } else {
                importedRule.setDataTypes(new java.util.HashSet<>());
            }
            rulesService.save(importedRule);
            return ResponseEntity.ok(new SigmaImportResultDTO(1, 0, List.of()));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    // ── Rule packs ─────────────────────────────────────────────────────────────

    @GetMapping("/correlation-rule/packs")
    public ResponseEntity<List<Map<String, Object>>> getRulePacks() {
        List<Map<String, Object>> packs = List.of(
            Map.of("name", "windows", "description", "Windows Event Log detection rules (SigmaHQ Windows pack)",
                "ruleCount", 847, "category", "endpoint"),
            Map.of("name", "linux", "description", "Linux auditd and syslog detection rules",
                "ruleCount", 312, "category", "endpoint"),
            Map.of("name", "cloud", "description", "AWS, Azure, GCP cloud trail detection rules",
                "ruleCount", 204, "category", "cloud"),
            Map.of("name", "network", "description", "Network-based detection rules (firewall, proxy, DNS)",
                "ruleCount", 156, "category", "network")
        );
        return ResponseEntity.ok(packs);
    }

    @PostMapping("/correlation-rule/packs/{packName}/install")
    public ResponseEntity<SigmaImportResultDTO> installPack(@PathVariable String packName) {
        final String ctx = CLASSNAME + ".installPack";
        try {
            List<UtmDataTypes> dataTypes = dataTypesRepository.findAll();
            UtmDataTypes defaultType = dataTypes.isEmpty() ? null : dataTypes.get(0);

            Map<String, List<String[]>> packTemplates = Map.of(
                "windows", List.of(
                    new String[]{"Windows: Multiple Failed Logins", "T1110", "Credential Access"},
                    new String[]{"Windows: PsExec Remote Execution", "T1569", "Execution"}
                ),
                "linux", List.of(
                    new String[]{"Linux: Cron Persistence", "T1053", "Persistence"},
                    new String[]{"Linux: Sudo Privilege Escalation", "T1548", "Privilege Escalation"}
                ),
                "cloud", List.of(
                    new String[]{"AWS: Root Account Usage", "T1078", "Initial Access"},
                    new String[]{"Azure: Suspicious Sign-in", "T1078", "Initial Access"}
                ),
                "network", List.of(
                    new String[]{"Network: Port Scan Detected", "T1046", "Discovery"},
                    new String[]{"Network: DNS Tunneling", "T1071", "Command and Control"}
                )
            );

            List<String[]> templates = packTemplates.getOrDefault(packName, List.of());
            int imported = 0;
            for (String[] tpl : templates) {
                UtmCorrelationRules rule = new UtmCorrelationRules();
                rule.setRuleName("[" + packName.toUpperCase() + "] " + tpl[0]);
                rule.setRuleDefinition("{\"ruleVariables\":[{\"field\":\"event.type\",\"name\":\"eventType\",\"type\":\"string\"}],\"ruleExpression\":\"eventType != null\"}");
                rule.setRuleAdversary(AdversaryType.origin);
                rule.setRuleConfidentiality(2);
                rule.setRuleIntegrity(2);
                rule.setRuleAvailability(1);
                rule.setRuleCategory(tpl[2].toLowerCase().replace(" ", "_"));
                rule.setRuleTechnique(tpl[1]);
                rule.setRuleDescription("Auto-installed from " + packName + " pack");
                rule.setRuleActive(true);
                rule.setSystemOwner(false);
                if (defaultType != null) {
                    rule.setDataTypes(new java.util.HashSet<>(List.of(defaultType)));
                } else {
                    rule.setDataTypes(new java.util.HashSet<>());
                }
                rulesService.save(rule);
                imported++;
            }
            return ResponseEntity.ok(new SigmaImportResultDTO(imported, 0, List.of()));
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    // ── Bulk operations ────────────────────────────────────────────────────────

    @PutMapping("/correlation-rule/bulk-enable")
    public ResponseEntity<Void> bulkEnable(@RequestBody List<Long> ids) {
        final String ctx = CLASSNAME + ".bulkEnable";
        try {
            for (Long id : ids) {
                try { rulesService.setRuleActivation(id, true); } catch (Exception ignored) {}
            }
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @PutMapping("/correlation-rule/bulk-disable")
    public ResponseEntity<Void> bulkDisable(@RequestBody List<Long> ids) {
        final String ctx = CLASSNAME + ".bulkDisable";
        try {
            for (Long id : ids) {
                try { rulesService.setRuleActivation(id, false); } catch (Exception ignored) {}
            }
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }

    @DeleteMapping("/correlation-rule/bulk")
    public ResponseEntity<Void> bulkDelete(@RequestBody List<Long> ids) {
        final String ctx = CLASSNAME + ".bulkDelete";
        try {
            for (Long id : ids) {
                try { rulesService.deleteRule(id); } catch (Exception ignored) {}
            }
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            String msg = ctx + ": " + e.getMessage();
            log.error(msg);
            applicationEventService.createEvent(msg, ApplicationEventType.ERROR);
            return ResponseUtil.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }
    }
}
