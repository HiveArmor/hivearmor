package com.hivearmor.domain.application_modules.factory.impl;

import com.hivearmor.domain.application_modules.UtmModule;
import com.hivearmor.domain.application_modules.enums.ModuleName;
import com.hivearmor.domain.application_modules.factory.IModule;
import com.hivearmor.domain.application_modules.types.ModuleConfigurationKey;
import com.hivearmor.domain.application_modules.types.ModuleRequirement;
import com.hivearmor.service.application_modules.UtmModuleService;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.List;

@Component
public class ModuleAix implements IModule {
    private static final String CLASSNAME = "ModuleAix";

    private final UtmModuleService moduleService;

    public ModuleAix(UtmModuleService moduleService) {
        this.moduleService = moduleService;
    }

    @Override
    public UtmModule getDetails(Long serverId) throws Exception {
        final String ctx = CLASSNAME + ".getDetails";
        try {
            return moduleService.findByServerIdAndModuleName(serverId, ModuleName.AIX);
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
        return Collections.emptyList();
    }

    @Override
    public ModuleName getName() {
        return ModuleName.AIX;
    }
}
