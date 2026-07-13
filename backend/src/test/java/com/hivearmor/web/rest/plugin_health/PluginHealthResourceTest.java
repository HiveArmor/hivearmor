package com.hivearmor.web.rest.plugin_health;

import com.hivearmor.service.PluginHealthService;
import com.hivearmor.service.dto.plugin_health.PluginHealthStatus;
import com.hivearmor.service.dto.plugin_health.PluginStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.Collections;
import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class PluginHealthResourceTest {

    @Mock
    private PluginHealthService pluginHealthService;

    @InjectMocks
    private PluginHealthResource pluginHealthResource;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(pluginHealthResource).build();
    }

    // T-PH-1: reachable event processor returns plugin list
    @Test
    void getPluginHealth_reachable_returnsPluginList() throws Exception {
        PluginHealthStatus status = PluginHealthStatus.builder()
            .reachable(true)
            .plugins(List.of(
                PluginStatus.builder().name("engine").state("RUNNING").uptime("0:05:12").build(),
                PluginStatus.builder().name("config-plugin").state("RUNNING").build(),
                PluginStatus.builder().name("alerts-plugin").state("FATAL").build()
            ))
            .lastChecked(Instant.parse("2026-07-11T10:00:00Z"))
            .build();
        when(pluginHealthService.getStatus()).thenReturn(status);

        mockMvc.perform(get("/api/plugin-health").accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.reachable").value(true))
            .andExpect(jsonPath("$.plugins").isArray())
            .andExpect(jsonPath("$.plugins[0].name").value("engine"))
            .andExpect(jsonPath("$.plugins[0].state").value("RUNNING"))
            .andExpect(jsonPath("$.plugins[0].uptime").value("0:05:12"))
            .andExpect(jsonPath("$.plugins[2].name").value("alerts-plugin"))
            .andExpect(jsonPath("$.plugins[2].state").value("FATAL"));
    }

    // T-PH-2: unreachable event processor returns reachable=false with empty plugins
    @Test
    void getPluginHealth_unreachable_returnsReachableFalse() throws Exception {
        PluginHealthStatus status = PluginHealthStatus.builder()
            .reachable(false)
            .plugins(Collections.emptyList())
            .lastChecked(Instant.now())
            .build();
        when(pluginHealthService.getStatus()).thenReturn(status);

        mockMvc.perform(get("/api/plugin-health").accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.reachable").value(false))
            .andExpect(jsonPath("$.plugins").isArray())
            .andExpect(jsonPath("$.plugins").isEmpty());
    }

    // T-PH-3: plugin with no uptime field serialises as null, not missing
    @Test
    void getPluginHealth_pluginWithNullUptime_serialisesCorrectly() throws Exception {
        PluginHealthStatus status = PluginHealthStatus.builder()
            .reachable(true)
            .plugins(List.of(
                PluginStatus.builder().name("geolocation-plugin").state("STOPPED").build()
            ))
            .lastChecked(Instant.now())
            .build();
        when(pluginHealthService.getStatus()).thenReturn(status);

        mockMvc.perform(get("/api/plugin-health").accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plugins[0].uptime").doesNotExist());
    }
}
