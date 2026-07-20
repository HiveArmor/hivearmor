package com.hivearmor.web.rest.compliance.config;

import com.hivearmor.service.compliance.config.UtmComplianceControlMappingService;
import com.hivearmor.service.dto.compliance.UtmComplianceControlMappingDto;
import com.hivearmor.web.rest.util.PaginationUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import java.util.List;

@RestController
@RequestMapping("/api/ha-compliance-control-mapping")
public class UtmComplianceControlMappingResource {

    private final Logger log = LoggerFactory.getLogger(UtmComplianceControlMappingResource.class);

    private final UtmComplianceControlMappingService service;

    public UtmComplianceControlMappingResource(UtmComplianceControlMappingService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<List<UtmComplianceControlMappingDto>> getAll(
            @RequestParam(required = false) Long standardId,
            @RequestParam(required = false) String mappingType,
            Pageable pageable
    ) {
        Page<UtmComplianceControlMappingDto> page = service.findByFilters(standardId, mappingType, pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(page, "/api/ha-compliance-control-mapping");
        return ResponseEntity.ok().headers(headers).body(page.getContent());
    }

    @GetMapping("/{id}")
    public ResponseEntity<UtmComplianceControlMappingDto> getById(@PathVariable Long id) {
        return service.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<UtmComplianceControlMappingDto> create(
            @Valid @RequestBody UtmComplianceControlMappingDto dto
    ) {
        UtmComplianceControlMappingDto created = service.create(dto);
        log.info("Created compliance control mapping id={} for control={}", created.getId(), created.getControlId());
        return ResponseEntity.ok(created);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<UtmComplianceControlMappingDto> update(
            @PathVariable Long id,
            @Valid @RequestBody UtmComplianceControlMappingDto dto
    ) {
        return ResponseEntity.ok(service.update(id, dto));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
