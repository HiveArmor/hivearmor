package com.hivearmor.web.rest;

import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.service.HiveParserRuleService;
import com.hivearmor.service.dto.HiveParserRuleDTO;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST controller for the Data Parsing admin page.
 *
 * GET    /api/ha-parsers
 * POST   /api/ha-parsers
 * PUT    /api/ha-parsers/{id}
 * DELETE /api/ha-parsers/{id}
 */
@RestController
@RequestMapping("/api")
@PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
public class HaParsersResource {

    private static final Logger log = LoggerFactory.getLogger(HaParsersResource.class);

    private final HiveParserRuleService service;

    public HaParsersResource(HiveParserRuleService service) {
        this.service = service;
    }

    @GetMapping("/ha-parsers")
    public ResponseEntity<List<HiveParserRuleDTO>> getAll() {
        log.debug("REST request to get all parser rules");
        return ResponseEntity.ok(service.findAll());
    }

    @GetMapping("/ha-parsers/{id}")
    public ResponseEntity<HiveParserRuleDTO> getOne(@PathVariable Long id) {
        log.debug("REST request to get parser rule: {}", id);
        return service.findById(id)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/ha-parsers")
    public ResponseEntity<HiveParserRuleDTO> create(@Valid @RequestBody HiveParserRuleDTO dto) {
        log.debug("REST request to create parser rule: {}", dto.getName());
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(dto));
    }

    @PutMapping("/ha-parsers/{id}")
    public ResponseEntity<HiveParserRuleDTO> update(@PathVariable Long id,
                                                    @Valid @RequestBody HiveParserRuleDTO dto) {
        log.debug("REST request to update parser rule: {}", id);
        return service.update(id, dto)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/ha-parsers/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        log.debug("REST request to delete parser rule: {}", id);
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
