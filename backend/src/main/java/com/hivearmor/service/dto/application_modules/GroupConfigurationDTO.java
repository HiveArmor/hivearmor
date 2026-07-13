package com.hivearmor.service.dto.application_modules;

import com.hivearmor.domain.application_modules.UtmModuleGroupConfiguration;
import com.hivearmor.domain.application_modules.validators.ValidModuleConfiguration;
import com.hivearmor.service.dto.auditable.AuditableDTO;
import lombok.Data;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.Map;

@Data
@ValidModuleConfiguration
public class GroupConfigurationDTO implements AuditableDTO {
    @NotNull
    private Long moduleId;
    @NotEmpty
    private List<UtmModuleGroupConfiguration> keys;

    @Override
    public Map<String, Object> toAuditMap() {
        return Map.of("moduleId", moduleId);
    }
}
