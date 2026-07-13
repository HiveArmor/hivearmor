package com.hivearmor.service.validators.collector;

import com.hivearmor.domain.application_modules.UtmModuleGroupConfiguration;
import com.hivearmor.service.dto.collectors.dto.CollectorConfigDTO;
import org.springframework.stereotype.Service;
import org.springframework.validation.Errors;
import org.springframework.validation.Validator;

import java.util.Map;
import java.util.stream.Collectors;

@Service
public class CollectorValidatorService implements Validator {
    @Override
    public boolean supports(Class<?> clazz) {
        return CollectorConfigDTO.class.equals(clazz);
    }

    @Override
    public void validate(Object target, Errors errors) {
        CollectorConfigDTO updateConfigurationKeysBody = (CollectorConfigDTO) target;

        Map<String, Long> hostNames = updateConfigurationKeysBody.getKeys().stream()
                .filter(config -> config.getConfName().equals("Hostname"))
                .collect(Collectors.groupingBy(UtmModuleGroupConfiguration::getConfValue, Collectors.counting()));

        hostNames.forEach((confValue, count) -> {
            if (count > 1){
                errors.rejectValue("keys", "customValidation.hostname.unique",
                        String.format("Hostname '%s' must be unique.", confValue));
            }
        });
    }
}
