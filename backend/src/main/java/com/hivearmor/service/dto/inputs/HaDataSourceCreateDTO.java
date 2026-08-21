package com.hivearmor.service.dto.inputs;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.Map;

/**
 * Request body for {@code POST /api/ha-inputs/sources} (AddDataSourceWizard payload).
 *
 * <p>Requirements: 9.2, 11.5
 *
 * @param name    Human-readable name for the new data source.
 * @param type    Data source type identifier (e.g. "syslog", "agent", "kafka").
 * @param config  Type-specific configuration fields collected by the wizard Step 2.
 * @param enabled Whether the source should start in the enabled state.
 */
public record HaDataSourceCreateDTO(

        @NotBlank
        @Size(max = 128)
        String name,

        @NotBlank
        @Size(max = 64)
        String type,

        @NotNull
        Map<String, String> config,

        boolean enabled
) {}
