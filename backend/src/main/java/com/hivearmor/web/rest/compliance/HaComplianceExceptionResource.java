package com.hivearmor.web.rest.compliance;

import com.hivearmor.compliance.dto.ComplianceControlExceptionDTO;
import com.hivearmor.compliance.dto.CreateComplianceExceptionRequest;
import com.hivearmor.compliance.service.HaComplianceExceptionService;
import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.web.rest.util.PaginationUtil;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * CMP-011 read + CMP-013 write — control-exception governance for compliance drawer.
 *
 * <p>Reads: Admin | User | Analyst | SOC Manager. Mutations: Admin | SOC Manager.
 */
@RestController
@RequestMapping("/api/ha-compliance")
public class HaComplianceExceptionResource {

    private static final String READ_AUTH =
        "hasAnyAuthority('" + AuthoritiesConstants.ADMIN + "','" + AuthoritiesConstants.USER +
        "','" + AuthoritiesConstants.ANALYST + "','" + AuthoritiesConstants.SOC_MANAGER + "')";
    private static final String MUTATE_AUTH =
        "hasAnyAuthority('" + AuthoritiesConstants.ADMIN + "','" + AuthoritiesConstants.SOC_MANAGER + "')";

    private final HaComplianceExceptionService exceptionService;

    public HaComplianceExceptionResource(HaComplianceExceptionService exceptionService) {
        this.exceptionService = exceptionService;
    }

    @GetMapping("/exceptions")
    @PreAuthorize(READ_AUTH)
    public ResponseEntity<List<ComplianceControlExceptionDTO>> listByControl(
        @RequestParam Long controlId,
        Pageable pageable
    ) {
        Page<ComplianceControlExceptionDTO> page = exceptionService.listByControlId(controlId, pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(page, "/api/ha-compliance/exceptions");
        return ResponseEntity.ok().headers(headers).body(page.getContent());
    }

    @PostMapping("/exceptions")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<ComplianceControlExceptionDTO> create(
        @Valid @RequestBody CreateComplianceExceptionRequest request
    ) {
        ComplianceControlExceptionDTO created = exceptionService.create(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PatchMapping("/exceptions/{id}/approve")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<ComplianceControlExceptionDTO> approve(@PathVariable Long id) {
        return ResponseEntity.ok(exceptionService.approve(id, currentUser()));
    }

    @PatchMapping("/exceptions/{id}/reject")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<ComplianceControlExceptionDTO> reject(@PathVariable Long id) {
        return ResponseEntity.ok(exceptionService.reject(id, currentUser()));
    }

    @PatchMapping("/exceptions/{id}/revoke")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<ComplianceControlExceptionDTO> revoke(@PathVariable Long id) {
        return ResponseEntity.ok(exceptionService.revoke(id, currentUser()));
    }

    @DeleteMapping("/exceptions/{id}")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        exceptionService.delete(id);
        return ResponseEntity.noContent().build();
    }

    private static String currentUser() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }
}
