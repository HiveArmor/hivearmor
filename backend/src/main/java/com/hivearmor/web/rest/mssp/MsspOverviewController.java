package com.hivearmor.web.rest.mssp;

import com.hivearmor.service.mssp.MsspOverviewService;
import com.hivearmor.service.mssp.dto.MsspOverviewDTO;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ha-mssp")
@PreAuthorize("hasAuthority('MSSP_ADMIN')")
public class MsspOverviewController {

    private final MsspOverviewService overviewService;

    public MsspOverviewController(MsspOverviewService overviewService) {
        this.overviewService = overviewService;
    }

    @GetMapping("/overview")
    public MsspOverviewDTO getOverview() {
        return overviewService.compute();
    }
}
