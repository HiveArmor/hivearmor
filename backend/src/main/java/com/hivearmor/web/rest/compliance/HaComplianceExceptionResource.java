package com.hivearmor.web.rest.compliance;

import com.hivearmor.compliance.dto.ComplianceControlExceptionDTO;
import com.hivearmor.compliance.service.HaComplianceExceptionService;
import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.web.rest.util.PaginationUtil;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * CMP-011 — authorized control-exception read projection for compliance governance drawer.
 *
 * GET /api/ha-compliance/exceptions?controlId={id} — list exceptions for a catalog control.
 */
@RestController
@RequestMapping("/api/ha-compliance")
@PreAuthorize("hasAnyAuthority('" + AuthoritiesConstants.ADMIN + "','" + AuthoritiesConstants.USER +
              "','" + AuthoritiesConstants.ANALYST + "','" + AuthoritiesConstants.SOC_MANAGER + "')")
public class HaComplianceExceptionResource {

    private final HaComplianceExceptionService exceptionService;

    public HaComplianceExceptionResource(HaComplianceExceptionService exceptionService) {
        this.exceptionService = exceptionService;
    }

    @GetMapping("/exceptions")
    public ResponseEntity<List<ComplianceControlExceptionDTO>> listByControl(
        @RequestParam Long controlId,
        Pageable pageable
    ) {
        Page<ComplianceControlExceptionDTO> page = exceptionService.listByControlId(controlId, pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(page, "/api/ha-compliance/exceptions");
        return ResponseEntity.ok().headers(headers).body(page.getContent());
    }
}
