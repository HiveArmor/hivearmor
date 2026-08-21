package com.hivearmor.web.rest.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.util.Set;

/**
 * Validates that a string is one of the recognized severity levels in HiveArmor.
 */
public class SeverityValidator implements ConstraintValidator<ValidSeverity, String> {

    private static final Set<String> VALID_SEVERITIES = Set.of(
        "critical", "high", "medium", "low", "info"
    );

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null || value.isBlank()) {
            // Let @NotBlank handle null/blank validation
            return true;
        }
        return VALID_SEVERITIES.contains(value.toLowerCase());
    }
}
