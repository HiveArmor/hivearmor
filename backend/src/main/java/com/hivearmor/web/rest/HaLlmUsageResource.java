package com.hivearmor.web.rest;

import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.service.HaLlmUsageService;
import com.hivearmor.service.dto.HaLlmUsageDTO;
import com.hivearmor.service.dto.HaLlmUsageSummaryDTO;
import com.hivearmor.web.rest.util.PaginationUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Admin read API for the durable {@code ha_llm_usage} ledger.
 *
 * <pre>
 *   GET /api/ha-llm-usage          — pageable safe rows (X-Total-Count)
 *   GET /api/ha-llm-usage/summary  — counts by cascade_decision
 * </pre>
 *
 * <p>Requires {@code ROLE_ADMIN} (matches sibling {@code /api/ha-admin/llm} endpoints).
 * Responses never include prompt bodies or secrets.
 *
 * <p>P1 LLMOps — STAGING CANDIDATE.
 */
@RestController
@RequestMapping("/api/ha-llm-usage")
@PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
public class HaLlmUsageResource {

    private static final Logger log = LoggerFactory.getLogger(HaLlmUsageResource.class);

    private final HaLlmUsageService service;

    public HaLlmUsageResource(HaLlmUsageService service) {
        this.service = service;
    }

    /**
     * Pageable ledger rows sorted by {@code createdAt} descending by default.
     */
    @GetMapping
    public ResponseEntity<List<HaLlmUsageDTO>> getAll(
            @ParameterObject
            @PageableDefault(size = 50, sort = "createdAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        log.debug("REST request to list ha_llm_usage page={} size={}", pageable.getPageNumber(), pageable.getPageSize());
        Page<HaLlmUsageDTO> page = service.findAll(pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(page, "/api/ha-llm-usage");
        return ResponseEntity.ok().headers(headers).body(page.getContent());
    }

    /**
     * Aggregate counts by {@code cascade_decision} only.
     */
    @GetMapping("/summary")
    public ResponseEntity<List<HaLlmUsageSummaryDTO>> getSummary() {
        log.debug("REST request to summarize ha_llm_usage by cascade_decision");
        return ResponseEntity.ok(service.summarizeByCascadeDecision());
    }
}
