package com.hivearmor.web.rest.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.util.Set;

/**
 * Validates that a string is one of the recognized entity types in HiveArmor.
 */
public class EntityTypeValidator implements ConstraintValidator<ValidEntityType, String> {

    private static final Set<String> VALID_TYPES = Set.of(
        "user", "host", "ip", "process", "file", "domain", "email", "hash", "url", "registry"
    );

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null || value.isBlank()) {
            // Let @NotBlank handle null/blank validation
            return true;
        }
        return VALID_TYPES.contains(value.toLowerCase());
    }
}
