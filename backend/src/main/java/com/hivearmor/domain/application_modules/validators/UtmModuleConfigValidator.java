package com.hivearmor.domain.application_modules.validators;

import com.hivearmor.config.Constants;
import com.hivearmor.domain.application_modules.UtmModule;
import com.hivearmor.domain.application_modules.UtmModuleGroupConfiguration;
import com.hivearmor.repository.UtmModuleGroupConfigurationRepository;
import com.hivearmor.service.application_modules.connectors.ModuleConfigurationValidationService;
import com.hivearmor.service.dto.application_modules.UtmModuleGroupConfDTO;
import com.hivearmor.service.dto.application_modules.UtmModuleGroupConfWrapperDTO;
import com.hivearmor.util.CipherUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class UtmModuleConfigValidator {

    private final UtmModuleGroupConfigurationRepository moduleGroupConfigurationRepository;
    private final ModuleConfigurationValidationService utmStackConnectionService;

    public boolean validate(UtmModule module, List<UtmModuleGroupConfiguration> keys) {
        if (keys.isEmpty()) return false;

        List<UtmModuleGroupConfiguration> dbConfigs = moduleGroupConfigurationRepository
                .findAllByGroupId(keys.get(0).getGroupId());

        return validate(module, keys, dbConfigs);
    }

    public boolean validate(UtmModule module, List<UtmModuleGroupConfiguration> keys, List<UtmModuleGroupConfiguration> dbConfigs) {
        if (keys.isEmpty()) return false;

        List<UtmModuleGroupConfDTO> configDTOs = new ArrayList<>(dbConfigs.stream()
                .map(dbConf -> {
                    UtmModuleGroupConfiguration override = findInKeys(keys, dbConf.getConfKey());
                    String value;
                    if (override != null && !Constants.MASKED_VALUE.equals(override.getConfValue())) {
                        // User provided a new value — use it as plaintext
                        value = override.getConfValue();
                    } else {
                        // No override or masked
                        value = dbConf.getConfValue();
                    }
                    return new UtmModuleGroupConfDTO(dbConf.getConfDataType(),dbConf.getConfKey(), value);
                })
                .collect(Collectors.toList()));

        Set<String> dbKeys = dbConfigs.stream()
                .map(UtmModuleGroupConfiguration::getConfKey)
                .collect(Collectors.toCollection(HashSet::new));

        keys.stream()
                .filter(k -> !dbKeys.contains(k.getConfKey()))
                .filter(k -> !Constants.MASKED_VALUE.equals(k.getConfValue()))
                .map(k -> new UtmModuleGroupConfDTO(k.getConfDataType(), k.getConfKey(), k.getConfValue()))
                .forEach(configDTOs::add);

        UtmModuleGroupConfWrapperDTO body = new UtmModuleGroupConfWrapperDTO(configDTOs);

        return utmStackConnectionService.validateModuleConfiguration(module.getModuleName().name(), body);
    }

    private UtmModuleGroupConfiguration findInKeys(List<UtmModuleGroupConfiguration> keys, String confKey) {
        return keys.stream()
                .filter(k -> k.getConfKey().equals(confKey))
                .findFirst()
                .orElse(null);
    }

}
