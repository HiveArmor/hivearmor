package com.hivearmor.web.rest.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.util.Set;

/**
 * Validates that a string is one of the recognized seed types for graph exploration.
 */
public class SeedTypeValidator implements ConstraintValidator<ValidSeedType, String> {

    private static final Set<String> VALID_SEED_TYPES = Set.of(
        "entity", "query", "incident", "alert"
    );

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null || value.isBlank()) {
            // Let @NotBlank handle null/blank validation
            return true;
        }
        return VALID_SEED_TYPES.contains(value.toLowerCase());
    }
}
