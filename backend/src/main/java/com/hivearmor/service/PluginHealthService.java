package com.hivearmor.service;

import com.hivearmor.service.dto.plugin_health.PluginHealthStatus;
import com.hivearmor.service.dto.plugin_health.PluginStatus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class PluginHealthService {

    @Value("${app.eventprocessor.health-url:http://eventprocessor:8000/health}")
    private String eventProcessorHealthUrl;

    private final RestTemplate restTemplate;

    public PluginHealthStatus getStatus() {
        try {
            ResponseEntity<Map> response = restTemplate.getForEntity(eventProcessorHealthUrl, Map.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return PluginHealthStatus.builder()
                    .reachable(true)
                    .plugins(parsePlugins(response.getBody()))
                    .lastChecked(Instant.now())
                    .build();
            }
        } catch (Exception e) {
            log.warn("Event processor health check failed: {}", e.getMessage());
        }
        return PluginHealthStatus.builder()
            .reachable(false)
            .plugins(Collections.emptyList())
            .lastChecked(Instant.now())
            .build();
    }

    @SuppressWarnings("unchecked")
    private List<PluginStatus> parsePlugins(Map<?, ?> body) {
        Object raw = body.get("plugins");
        if (!(raw instanceof List)) return Collections.emptyList();
        List<Map<String, Object>> plugins = (List<Map<String, Object>>) raw;
        return plugins.stream()
            .map(p -> PluginStatus.builder()
                .name((String) p.get("name"))
                .state((String) p.get("state"))
                .uptime((String) p.get("uptime"))
                .build())
            .collect(Collectors.toList());
    }
}
