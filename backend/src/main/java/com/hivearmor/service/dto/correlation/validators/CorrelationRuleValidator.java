package com.hivearmor.service.dto.correlation.validators;

import com.hivearmor.service.dto.correlation.UtmCorrelationRulesDTO;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.validation.Errors;
import org.springframework.validation.Validator;

@Component
public class CorrelationRuleValidator implements Validator {

    @Override
    public boolean supports(Class<?> clazz) {
        return UtmCorrelationRulesDTO.class.equals(clazz);
    }

    @Override
    public void validate(Object target, Errors errors) {
    }
}

