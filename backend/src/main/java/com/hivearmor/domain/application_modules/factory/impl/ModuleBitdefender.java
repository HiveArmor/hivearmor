package com.hivearmor.domain.application_modules.factory.impl;

import com.hivearmor.domain.application_modules.UtmModule;
import com.hivearmor.domain.application_modules.UtmModuleGroupConfiguration;
import com.hivearmor.domain.application_modules.enums.ModuleName;
import com.hivearmor.domain.application_modules.factory.IModule;
import com.hivearmor.domain.application_modules.types.ModuleConfigurationKey;
import com.hivearmor.domain.application_modules.types.ModuleRequirement;
import com.hivearmor.domain.application_modules.validators.UtmModuleConfigValidator;
import com.hivearmor.service.application_modules.UtmModuleService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@Component
@RequiredArgsConstructor
public class ModuleBitdefender implements IModule {
    private static final String CLASSNAME = "ModuleBitdefender";

    private final UtmModuleService moduleService;
    private final UtmModuleConfigValidator haConfigValidator;


    @Override
    public UtmModule getDetails(Long serverId) throws Exception {
        final String ctx = CLASSNAME + ".getDetails";
        try {
            return moduleService.findByServerIdAndModuleName(serverId, ModuleName.BITDEFENDER);
        } catch (Exception e) {
            throw new Exception(ctx + ": " + e.getMessage());
        }
    }

    @Override
    public List<ModuleRequirement> checkRequirements(Long serverId) throws Exception {
        return Collections.emptyList();
    }

    @Override
    public List<ModuleConfigurationKey> getConfigurationKeys(Long groupId) throws Exception {
        List<ModuleConfigurationKey> keys = new ArrayList<>();

        // connectionKey
        keys.add(ModuleConfigurationKey.builder()
            .withGroupId(groupId)
            .withConfKey("connectionKey")
            .withConfName("Connection key")
            .withConfDescription("Bitdefender connection key")
            .withConfDataType("password")
            .withConfRequired(true)
            .build());

        // accessUrl
        keys.add(ModuleConfigurationKey.builder()
            .withGroupId(groupId)
            .withConfKey("accessUrl")
            .withConfName("Access URL")
            .withConfDescription("Bitdefender access URL")
            .withConfDataType("text")
            .withConfRequired(true)
            .build());

        // utmPublicIP
        keys.add(ModuleConfigurationKey.builder()
            .withGroupId(groupId)
            .withConfKey("utmPublicIP")
            .withConfName("Master public IP or DNS")
            .withConfDescription("Master instance public IP or DNS")
            .withConfDataType("text")
            .withConfRequired(true)
            .build());

        // companyIds
        keys.add(ModuleConfigurationKey.builder()
            .withGroupId(groupId)
            .withConfKey("companyIds")
            .withConfName("Companies IDs")
            .withConfDescription("Separate the company IDs to be associated with this tenant by commas, for example: BDGZ1234,BDGZ5678,BDGZ9012")
            .withConfDataType("list")
            .withConfRequired(true)
            .build());
        return keys;
    }

    public boolean validateConfiguration(UtmModule module, List<UtmModuleGroupConfiguration> configuration) throws Exception {
        return haConfigValidator.validate(module, configuration);
    }

    @Override
    public ModuleName getName() {
        return ModuleName.BITDEFENDER;
    }
}
