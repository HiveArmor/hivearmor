package com.hivearmor.web.rest.compliance.internal;

import com.hivearmor.domain.compliance.UtmComplianceControlMapping;
import com.hivearmor.repository.compliance.UtmComplianceControlMappingRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Internal endpoint consumed only by the event-processor via Utm-Internal-Key header.
 * Returns all compliance control mappings as a flat list — no pagination required
 * because the event-processor needs the full set to compile CEL programs at startup.
 */
@RestController
@RequestMapping("/api/internal/compliance")
@PreAuthorize("hasRole('ADMIN')")
public class InternalComplianceMappingResource {

    private final UtmComplianceControlMappingRepository repository;

    public InternalComplianceMappingResource(UtmComplianceControlMappingRepository repository) {
        this.repository = repository;
    }

    @GetMapping("/mappings")
    public ResponseEntity<List<Map<String, Object>>> getAllMappings() {
        List<UtmComplianceControlMapping> mappings = repository.findAll();
        List<Map<String, Object>> body = mappings.stream()
                .map(this::toMap)
                .collect(Collectors.toList());
        return ResponseEntity.ok(body);
    }

    private Map<String, Object> toMap(UtmComplianceControlMapping m) {
        double weight = m.getWeight() != null ? m.getWeight().doubleValue() : BigDecimal.ONE.doubleValue();
        int retention = m.getEvidenceRetentionDays() != null ? m.getEvidenceRetentionDays() : 90;
        return Map.of(
                "id", m.getId(),
                "controlId", m.getControlId(),
                "mappingType", m.getMappingType() != null ? m.getMappingType() : "",
                "dataTypes", m.getDataTypes() != null ? m.getDataTypes() : "",
                "celCondition", m.getCelCondition() != null ? m.getCelCondition() : "",
                "weight", weight,
                "evidenceRetentionDays", retention
        );
    }
}
