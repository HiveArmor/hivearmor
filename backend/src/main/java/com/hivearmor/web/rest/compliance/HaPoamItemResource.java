package com.hivearmor.web.rest.compliance;

import com.hivearmor.compliance.dto.ComplianceControlExceptionDTO;
import com.hivearmor.compliance.dto.CreateComplianceExceptionRequest;
import com.hivearmor.compliance.dto.CreatePoamItemRequest;
import com.hivearmor.compliance.dto.PoamItemDTO;
import com.hivearmor.compliance.dto.UpdatePoamItemRequest;
import com.hivearmor.compliance.service.HaComplianceExceptionService;
import com.hivearmor.compliance.service.HaPoamItemService;
import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.web.rest.util.PaginationUtil;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * CMP-010 read + CMP-013 write — POA&amp;M governance for compliance drawer.
 *
 * <p>Reads: Admin | User | Analyst | SOC Manager. Mutations: Admin | SOC Manager.
 */
@RestController
@RequestMapping("/api/ha-compliance")
public class HaPoamItemResource {

    private static final String READ_AUTH =
        "hasAnyAuthority('" + AuthoritiesConstants.ADMIN + "','" + AuthoritiesConstants.USER +
        "','" + AuthoritiesConstants.ANALYST + "','" + AuthoritiesConstants.SOC_MANAGER + "')";
    private static final String MUTATE_AUTH =
        "hasAnyAuthority('" + AuthoritiesConstants.ADMIN + "','" + AuthoritiesConstants.SOC_MANAGER + "')";

    private final HaPoamItemService poamItemService;

    public HaPoamItemResource(HaPoamItemService poamItemService) {
        this.poamItemService = poamItemService;
    }

    @GetMapping("/poam")
    @PreAuthorize(READ_AUTH)
    public ResponseEntity<List<PoamItemDTO>> listByControl(@RequestParam Long controlId, Pageable pageable) {
        Page<PoamItemDTO> page = poamItemService.listByControlId(controlId, pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(page, "/api/ha-compliance/poam");
        return ResponseEntity.ok().headers(headers).body(page.getContent());
    }

    @PostMapping("/poam")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<PoamItemDTO> create(@Valid @RequestBody CreatePoamItemRequest request) {
        PoamItemDTO created = poamItemService.create(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/poam/{id}")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<PoamItemDTO> update(
        @PathVariable Long id,
        @Valid @RequestBody UpdatePoamItemRequest request
    ) {
        return ResponseEntity.ok(poamItemService.update(id, request));
    }

    @DeleteMapping("/poam/{id}")
    @PreAuthorize(MUTATE_AUTH)
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        poamItemService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
