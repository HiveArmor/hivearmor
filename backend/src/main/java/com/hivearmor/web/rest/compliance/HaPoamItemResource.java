package com.hivearmor.web.rest.compliance;

import com.hivearmor.compliance.dto.PoamItemDTO;
import com.hivearmor.compliance.service.HaPoamItemService;
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
 * CMP-010 — authorized POA&amp;M read projection for compliance governance drawer.
 *
 * GET /api/ha-compliance/poam?controlId={id} — list improvement actions for a catalog control.
 */
@RestController
@RequestMapping("/api/ha-compliance")
@PreAuthorize("hasAnyAuthority('" + AuthoritiesConstants.ADMIN + "','" + AuthoritiesConstants.USER +
              "','" + AuthoritiesConstants.ANALYST + "','" + AuthoritiesConstants.SOC_MANAGER + "')")
public class HaPoamItemResource {

    private final HaPoamItemService poamItemService;

    public HaPoamItemResource(HaPoamItemService poamItemService) {
        this.poamItemService = poamItemService;
    }

    @GetMapping("/poam")
    public ResponseEntity<List<PoamItemDTO>> listByControl(@RequestParam Long controlId, Pageable pageable) {
        Page<PoamItemDTO> page = poamItemService.listByControlId(controlId, pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(page, "/api/ha-compliance/poam");
        return ResponseEntity.ok().headers(headers).body(page.getContent());
    }
}
