package com.hivearmor.web.rest.intelligence;

import com.hivearmor.security.SecurityUtils;
import com.hivearmor.service.dto.intelligence.IntelligenceFindingDTO;
import com.hivearmor.service.intelligence.IntelligenceFindingService;
import com.hivearmor.util.UtilPagination;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;

/**
 * HI-04 STAGING CANDIDATE — durable intelligence findings with facts/inference separation.
 */
@RestController
@RequestMapping("/api/ha-intelligence")
public class IntelligenceFindingResource {

    private static final String READ_AUTH =
        "hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST')";

    private final IntelligenceFindingService findingService;

    public IntelligenceFindingResource(IntelligenceFindingService findingService) {
        this.findingService = findingService;
    }

    @GetMapping("/findings")
    @PreAuthorize(READ_AUTH)
    public ResponseEntity<List<IntelligenceFindingDTO>> listFindings(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        Pageable pageable = PageRequest.of(page, Math.min(Math.max(size, 1), 100));
        Page<IntelligenceFindingDTO> results = findingService.listFindings(pageable);
        HttpHeaders headers = UtilPagination.generatePaginationHttpHeaders(
            results.getTotalElements(), page, pageable.getPageSize(), "/api/ha-intelligence/findings");
        return ResponseEntity.ok().headers(headers).body(results.getContent());
    }

    @GetMapping("/findings/{id}")
    @PreAuthorize(READ_AUTH)
    public ResponseEntity<IntelligenceFindingDTO> getFinding(@PathVariable Long id) {
        return findingService.getFinding(id)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/findings")
    @PreAuthorize(READ_AUTH)
    public ResponseEntity<IntelligenceFindingDTO> createFinding(
        @Valid @RequestBody IntelligenceFindingDTO body
    ) throws Exception {
        String user = SecurityUtils.getCurrentUserLogin().orElse("system");
        IntelligenceFindingDTO created = findingService.saveFinding(body, user);
        return ResponseEntity
            .created(new URI("/api/ha-intelligence/findings/" + created.id()))
            .body(created);
    }

    public record FindingFeedbackRequest(
        @NotBlank String rating,
        String comment
    ) {}

    @PostMapping("/findings/{id}/feedback")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> submitFeedback(
        @PathVariable Long id,
        @Valid @RequestBody FindingFeedbackRequest body
    ) {
        String user = SecurityUtils.getCurrentUserLogin().orElse("anonymous");
        findingService.addFeedback(id, user, body.rating(), body.comment());
        return ResponseEntity.noContent().build();
    }
}
