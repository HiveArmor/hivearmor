package com.hivearmor.domain.application_modules.validators.impl;

import com.hivearmor.domain.application_modules.UtmModule;
import com.hivearmor.domain.application_modules.factory.ModuleFactory;
import com.hivearmor.domain.application_modules.factory.IModule;
import com.hivearmor.domain.application_modules.validators.ValidModuleConfiguration;
import com.hivearmor.repository.application_modules.UtmModuleRepository;
import com.hivearmor.service.dto.application_modules.GroupConfigurationDTO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

@Component
@RequiredArgsConstructor
public class ModuleConfigurationValidator implements ConstraintValidator<ValidModuleConfiguration, GroupConfigurationDTO> {

    private final ModuleFactory moduleFactory;
    private final UtmModuleRepository moduleRepository;

    @Override
    public boolean isValid(GroupConfigurationDTO dto, ConstraintValidatorContext context) {
        if (dto.getModuleId() == null || dto.getKeys() == null || dto.getKeys().isEmpty()) {
            return false;
        }

        try {
            UtmModule utmModule = moduleRepository.findById(dto.getModuleId())
                    .orElseThrow(() -> new IllegalArgumentException("Module not found with ID: " + dto.getModuleId()));
            IModule module = moduleFactory.getInstance(utmModule.getModuleName());
            return module.validateConfiguration(utmModule, dto.getKeys());
        } catch (Exception e) {
            context.disableDefaultConstraintViolation();
            context.buildConstraintViolationWithTemplate(e.getMessage())
                    .addPropertyNode("keys")
                    .addConstraintViolation();
            return false;
        }
    }
}
