package com.hivearmor.service.dto.plugin_health;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PluginStatus {
    private String name;
    private String state;
    private String uptime;
}
