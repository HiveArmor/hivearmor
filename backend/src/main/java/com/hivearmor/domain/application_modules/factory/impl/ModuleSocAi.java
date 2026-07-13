package com.hivearmor.domain.application_modules.factory.impl;

import com.hivearmor.domain.application_modules.UtmModule;
import com.hivearmor.domain.application_modules.UtmModuleGroupConfiguration;
import com.hivearmor.domain.application_modules.enums.ModuleName;
import com.hivearmor.domain.application_modules.factory.IModule;
import com.hivearmor.domain.application_modules.types.ModuleConfigurationKey;
import com.hivearmor.domain.application_modules.types.ModuleRequirement;
import com.hivearmor.domain.application_modules.validators.UtmModuleConfigValidator;
import com.hivearmor.repository.UtmModuleGroupConfigurationRepository;
import com.hivearmor.service.application_modules.UtmModuleService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
public class ModuleSocAi implements IModule {
    private static final String CLASSNAME = "ModuleSocAi";

    private final UtmModuleService moduleService;
    private final UtmModuleConfigValidator utmStackConfigValidator;
    private final UtmModuleGroupConfigurationRepository moduleGroupConfigurationRepository;

    @Override
    public UtmModule getDetails(Long serverId) throws Exception {
        final String ctx = CLASSNAME + ".getDetails";
        try {
            return moduleService.findByServerIdAndModuleName(serverId, ModuleName.SOC_AI);
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

        keys.add(ModuleConfigurationKey.builder()
            .withGroupId(groupId)
            .withConfKey("hivearmor.socai.provider")
            .withConfName("AI Provider")
            .withConfDescription("AI provider used by SOC AI.")
            .withConfDataType("text")
            .withConfValue("openai")
            .withConfRequired(true)
            .build());

        keys.add(ModuleConfigurationKey.builder()
            .withGroupId(groupId)
            .withConfKey("hivearmor.socai.model")
            .withConfName("AI Model")
            .withConfDescription("AI model that SOC AI will use to analyze alerts (first option of active provider).")
            .withConfDataType("text")
            .withConfValue("gpt-4o")
            .withConfRequired(true)
            .build());

        keys.add(ModuleConfigurationKey.builder()
            .withGroupId(groupId)
            .withConfKey("hivearmor.socai.url")
            .withConfName("Provider URL")
            .withConfDescription("Endpoint URL for the provider (only set for azure / ollama / custom).")
            .withConfDataType("text")
            .withConfValue("")
            .withConfRequired(false)
            .build());

        keys.add(ModuleConfigurationKey.builder()
            .withGroupId(groupId)
            .withConfKey("hivearmor.socai.maxTokens")
            .withConfName("Max Tokens")
            .withConfDescription("Maximum number of tokens used per request.")
            .withConfDataType("text")
            .withConfValue("4096")
            .withConfRequired(true)
            .build());

        keys.add(ModuleConfigurationKey.builder()
            .withGroupId(groupId)
            .withConfKey("hivearmor.socai.authType")
            .withConfName("Authentication Type")
            .withConfDescription("Authentication type used to reach the provider (none for ollama).")
            .withConfDataType("text")
            .withConfValue("custom-headers")
            .withConfRequired(true)
            .build());

        keys.add(ModuleConfigurationKey.builder()
            .withGroupId(groupId)
            .withConfKey("hivearmor.socai.customHeaders")
            .withConfName("Custom Headers")
            .withConfDescription("Custom headers (JSON object) sent with each request to the provider.")
            .withConfDataType("password")
            .withConfValue("")
            .withConfRequired(false)
            .build());

        keys.add(ModuleConfigurationKey.builder()
            .withGroupId(groupId)
            .withConfKey("hivearmor.socai.autoAnalyze")
            .withConfName("Auto Analyze")
            .withConfDescription("If set to \"true\", SOC AI will automatically analyze incoming alerts.")
            .withConfDataType("text")
            .withConfValue("false")
            .withConfRequired(false)
            .build());

        keys.add(ModuleConfigurationKey.builder()
            .withGroupId(groupId)
            .withConfKey("hivearmor.socai.incidentCreation")
            .withConfName("Automatic Incident creation")
            .withConfDescription("If set to \"true\", the system will create incidents based on analysis of alerts.")
            .withConfDataType("text")
            .withConfValue("false")
            .withConfRequired(false)
            .build());

        keys.add(ModuleConfigurationKey.builder()
            .withGroupId(groupId)
            .withConfKey("hivearmor.socai.changeAlertStatus")
            .withConfName("Change Alert Status")
            .withConfDescription("If set to \"true\", SOC Ai will automatically change the status of alerts. " +
                "Analysts should investigate those with the status \"In Review\".")
            .withConfDataType("text")
            .withConfValue("false")
            .withConfRequired(false)
            .build());

        return keys;
    }

    public boolean validateConfiguration(UtmModule module, List<UtmModuleGroupConfiguration> configuration) {

        if(configuration == null || configuration.isEmpty()) {
            throw  new IllegalArgumentException("Configurations cannot be null or empty");
        }

        Long groupId = configuration.get(0).getGroupId();

        List<UtmModuleGroupConfiguration> dbConfigs = moduleGroupConfigurationRepository
                .findAllByGroupId(groupId);

        UtmModuleGroupConfiguration providerConfig = configuration.stream()
                .filter(c -> "hivearmor.socai.provider".equals(c.getConfKey()))
                .findFirst()
                .orElseGet(() -> dbConfigs.stream()
                        .filter(c -> "hivearmor.socai.provider".equals(c.getConfKey()))
                        .findFirst()
                        .orElse(null));

        List<UtmModuleGroupConfiguration> configs = dbConfigs.stream()
                .filter(c -> !"hivearmor.socai.provider".equals(c.getConfKey()))
                .toList();

        List<UtmModuleGroupConfiguration> filteredConfigs = filterStandardConfigs(configs);

        filteredConfigs.add(providerConfig);

        return utmStackConfigValidator.validate(module, configuration, filteredConfigs);
    }


    private List<UtmModuleGroupConfiguration> filterStandardConfigs(List<UtmModuleGroupConfiguration> configs) {
        return configs.stream()
                .filter(config -> !config.getConfKey().equals("hivearmor.socai.custom.model") &&
                        !config.getConfKey().equals("hivearmor.socai.custom.url"))
                .collect(Collectors.toList());
    }

    @Override
    public ModuleName getName() {
        return ModuleName.SOC_AI;
    }
}
