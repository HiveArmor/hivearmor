package com.hivearmor.web.rest.compliance.config;

import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.service.compliance.config.UtmComplianceControlEvaluationHistoryService;
import com.hivearmor.service.dto.compliance.UtmComplianceControlEvaluationHistoryResponseDto;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/compliance/control-config")
@PreAuthorize("hasAnyAuthority('" + AuthoritiesConstants.ADMIN + "','" + AuthoritiesConstants.USER +
              "','" + AuthoritiesConstants.ANALYST + "','" + AuthoritiesConstants.SOC_MANAGER + "')")
public class UtmComplianceControlEvaluationHistoryResource {

    private final UtmComplianceControlEvaluationHistoryService evaluationHistoryService;

    public UtmComplianceControlEvaluationHistoryResource(UtmComplianceControlEvaluationHistoryService evaluationHistoryService) {
        this.evaluationHistoryService = evaluationHistoryService;
    }

    @GetMapping("/{id}/evaluations")
    public ResponseEntity<UtmComplianceControlEvaluationHistoryResponseDto> getControlEvaluationHistory(@PathVariable Long id) {
        return ResponseEntity.ok(evaluationHistoryService.getEvaluationsWithRange(id));
    }

}

