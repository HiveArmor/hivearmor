package com.hivearmor.web.rest.ops;

import com.hivearmor.service.dto.ops.PipelineSignalsDTO;
import com.hivearmor.service.ops.PipelineSignalsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Admin-only measured pipeline signals (SIEM-009). No invented SLO thresholds.
 */
@RestController
@RequestMapping("/api")
@Tag(name = "Pipeline Signals", description = "Measured capacity and lag signals")
public class HaPipelineSignalsResource {

    private final PipelineSignalsService pipelineSignalsService;

    public HaPipelineSignalsResource(PipelineSignalsService pipelineSignalsService) {
        this.pipelineSignalsService = pipelineSignalsService;
    }

    @GetMapping("/ha-pipeline-signals")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    @Operation(summary = "Get measured pipeline capacity/lag signals")
    public ResponseEntity<PipelineSignalsDTO> getPipelineSignals() {
        return ResponseEntity.ok(pipelineSignalsService.collect());
    }
}
