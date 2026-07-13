package com.hivearmor.service.dto.collectors.dto;

import com.hivearmor.domain.application_modules.UtmModuleGroupConfiguration;
import com.hivearmor.domain.collector.validators.UniqueServerName;
import lombok.Getter;
import lombok.Setter;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;

@Setter
@Getter
public class CollectorConfigDTO {

    @NotNull
    CollectorDTO collector;

    @NotNull
    private Long moduleId;

    @NotNull
    @UniqueServerName
    private List<UtmModuleGroupConfiguration> keys;

}
