package com.hivearmor.web.rest;

import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.service.HaRuleTestService;
import com.hivearmor.service.dto.RuleTestRequestDTO;
import com.hivearmor.service.dto.RuleTestResultDTO;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * REST controller for the rule testing sandbox.
 *
 * POST /api/ha-rules/test
 *
 * Accepts a Sigma rule YAML and a sample JSON event, evaluates the rule's
 * detection block against the event using the full Sigma boolean condition
 * grammar, and returns whether the rule matched along with matched-field
 * detail and a human-readable explanation.
 *
 * Accessible to ANALYST and ADMIN roles.
 */
@RestController
@RequestMapping("/api")
public class HaRuleTestResource {

    private static final Logger log = LoggerFactory.getLogger(HaRuleTestResource.class);

    private final HaRuleTestService haRuleTestService;

    public HaRuleTestResource(HaRuleTestService haRuleTestService) {
        this.haRuleTestService = haRuleTestService;
    }

    /**
     * POST /api/ha-rules/test : Evaluate a Sigma rule against a sample event.
     *
     * @param req the request body carrying {@code ruleYaml} and {@code eventJson}
     * @return 200 OK with a {@link RuleTestResultDTO} describing the match result
     */
    @PostMapping("/ha-rules/test")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ANALYST + "') or hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<RuleTestResultDTO> testRule(@Valid @RequestBody RuleTestRequestDTO req) {
        log.debug("REST request to test Sigma rule against event");
        RuleTestResultDTO result = haRuleTestService.testRule(req.getRuleYaml(), req.getEventJson());
        return ResponseEntity.ok(result);
    }
}
