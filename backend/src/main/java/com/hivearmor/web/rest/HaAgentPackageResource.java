package com.hivearmor.web.rest;

import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.service.AgentPackageService;
import com.hivearmor.service.dto.AgentPackageDTO;
import com.hivearmor.service.dto.AgentPackageSummaryDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

/**
 * Serves allowlisted HiveArmor agent installer binaries.
 *
 * <p>{@code GET /agent-packages/{filename}} is reachable without a JWT so one-click
 * install scripts can download the binary. The filename must match the fixed catalog.
 *
 * <p>{@code GET /api/ha-agent-packages} returns catalog metadata for the Sensors page.
 */
@RestController
public class HaAgentPackageResource {

    private static final Logger log = LoggerFactory.getLogger(HaAgentPackageResource.class);
    private static final String CLASSNAME = "HaAgentPackageResource";

    private static final String CATALOG_AUTH =
        "hasAuthority('" + AuthoritiesConstants.ADMIN + "') or hasAuthority('"
            + AuthoritiesConstants.ANALYST + "') or hasAuthority('"
            + AuthoritiesConstants.SOC_MANAGER + "')";

    private final AgentPackageService agentPackageService;

    public HaAgentPackageResource(AgentPackageService agentPackageService) {
        this.agentPackageService = agentPackageService;
    }

    @GetMapping("/api/ha-agent-packages")
    @PreAuthorize(CATALOG_AUTH)
    public ResponseEntity<List<AgentPackageDTO>> listPackages() {
        return ResponseEntity.ok(agentPackageService.catalog());
    }

    /**
     * Fleet summary: published binary counts + {@code version.json} latest version.
     * Used by Sensors to compare running agent versions against the published package set.
     */
    @GetMapping("/api/ha-agent-packages/summary")
    @PreAuthorize(CATALOG_AUTH)
    public ResponseEntity<AgentPackageSummaryDTO> packageSummary() {
        return ResponseEntity.ok(agentPackageService.summary());
    }

    @GetMapping("/agent-packages/{filename:.+}")
    public ResponseEntity<Resource> downloadPackage(@PathVariable String filename) {
        final String ctx = CLASSNAME + ".downloadPackage";
        if (!agentPackageService.isAllowedFilename(filename)) {
            log.debug("{}: rejected filename", ctx);
            return ResponseEntity.notFound().build();
        }
        Optional<Path> file = agentPackageService.resolveExistingFile(filename);
        if (file.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        FileSystemResource resource = new FileSystemResource(file.get());
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_OCTET_STREAM)
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
            .body(resource);
    }
}
