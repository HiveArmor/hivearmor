package com.hivearmor.web.rest.plugin_health;

import com.hivearmor.security.AuthoritiesConstants;
import com.hivearmor.service.PluginHealthService;
import com.hivearmor.service.dto.plugin_health.PluginHealthStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class PluginHealthResource {

    private final PluginHealthService pluginHealthService;

    @GetMapping("/plugin-health")
    @PreAuthorize("hasAuthority('" + AuthoritiesConstants.ADMIN + "')")
    public ResponseEntity<PluginHealthStatus> getPluginHealth() {
        return ResponseEntity.ok(pluginHealthService.getStatus());
    }
}
