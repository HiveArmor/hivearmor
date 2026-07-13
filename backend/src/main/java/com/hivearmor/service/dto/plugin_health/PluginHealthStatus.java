package com.hivearmor.service.dto.plugin_health;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PluginHealthStatus {
    private boolean reachable;
    private List<PluginStatus> plugins;
    private Instant lastChecked;
}
