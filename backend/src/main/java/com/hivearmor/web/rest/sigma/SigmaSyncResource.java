package com.hivearmor.web.rest.sigma;

import com.hivearmor.domain.correlation.rules.UtmCorrelationRules;
import com.hivearmor.domain.sigma.SigmaSyncConfig;
import com.hivearmor.service.sigma.SigmaSyncService;
import com.hivearmor.service.dto.correlation.UtmCorrelationRulesDTO;
import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.service.dto.correlation.UtmCorrelationRulesMapper;
import jakarta.persistence.EntityNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class SigmaSyncResource {

    private static final Logger log = LoggerFactory.getLogger(SigmaSyncResource.class);

    private final SigmaSyncService sigmaSyncService;
    private final UtmCorrelationRulesMapper mapper;

    public SigmaSyncResource(SigmaSyncService sigmaSyncService, UtmCorrelationRulesMapper mapper) {
        this.sigmaSyncService = sigmaSyncService;
        this.mapper = mapper;
    }

    @GetMapping("/ha-sigma-sync/staged")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<List<UtmCorrelationRulesDTO>> getStagedRules() {
        List<UtmCorrelationRules> staged = sigmaSyncService.getStagedRules();
        return ResponseEntity.ok(mapper.toListDTO(staged));
    }

    @PostMapping("/ha-sigma-sync/{id}/activate")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<Void> activateRule(@PathVariable Long id) {
        try {
            sigmaSyncService.activateStagedRule(id);
            return ResponseEntity.noContent().build();
        } catch (EntityNotFoundException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            log.error("Error activating staged rule {}: {}", id, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @PostMapping("/ha-sigma-sync/{id}/dismiss")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<Void> dismissRule(@PathVariable Long id) {
        try {
            sigmaSyncService.dismissStagedRule(id);
            return ResponseEntity.noContent().build();
        } catch (EntityNotFoundException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            log.error("Error dismissing staged rule {}: {}", id, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @PostMapping("/ha-sigma-sync/trigger")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<Map<String, Object>> triggerSync() {
        SigmaSyncService.SigmaSyncResult result = sigmaSyncService.triggerManualSync();
        return ResponseEntity.ok(Map.of(
            "staged", result.staged(),
            "skipped", result.skipped(),
            "message", result.message()
        ));
    }

    @GetMapping("/ha-sigma-sync/config")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<SigmaSyncConfig> getConfig() {
        return ResponseEntity.ok(sigmaSyncService.getConfig());
    }

    @PutMapping("/ha-sigma-sync/config")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<SigmaSyncConfig> updateConfig(@RequestBody SigmaSyncConfig config) {
        return ResponseEntity.ok(sigmaSyncService.saveConfig(config));
    }
}
