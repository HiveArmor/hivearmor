package com.hivearmor.domain.application_modules.factory.impl;

import com.hivearmor.domain.application_modules.UtmModule;
import com.hivearmor.domain.application_modules.enums.ModuleName;
import com.hivearmor.domain.application_modules.factory.IModule;
import com.hivearmor.domain.application_modules.types.ModuleConfigurationKey;
import com.hivearmor.domain.application_modules.types.ModuleRequirement;
import com.hivearmor.service.application_modules.ModuleRequirementChecksService;
import com.hivearmor.service.application_modules.UtmModuleService;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.List;

@Component
public class ModuleFileIntegrity implements IModule {

    private static final String CLASSNAME = "ModuleFileIntegrity";

    private final UtmModuleService moduleService;
    private final ModuleRequirementChecksService requirementChecksService;

    public ModuleFileIntegrity(UtmModuleService moduleService,
                               ModuleRequirementChecksService requirementChecksService) {
        this.moduleService = moduleService;
        this.requirementChecksService = requirementChecksService;
    }

    @Override
    public UtmModule getDetails(Long serverId) throws Exception {
        final String ctx = CLASSNAME + ".getDetails";
        try {
            return moduleService.findByServerIdAndModuleName(serverId, ModuleName.FILE_INTEGRITY);
        } catch (Exception e) {
            throw new Exception(ctx + ": " + e.getMessage());
        }
    }

    @Override
    public List<ModuleRequirement> checkRequirements(Long serverId) throws Exception {
        final String ctx = CLASSNAME + ".checkRequirements";
        try {
            return Collections.singletonList(requirementChecksService.checkWindowsEvents());
        } catch (Exception e) {
            throw new Exception(ctx + ": " + e.getMessage());
        }
    }

    @Override
    public List<ModuleConfigurationKey> getConfigurationKeys(Long groupId) throws Exception {
        return Collections.emptyList();
    }

    @Override
    public ModuleName getName() {
        return ModuleName.FILE_INTEGRITY;
    }
}
