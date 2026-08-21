package com.hivearmor.web.rest.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Validates that a string field contains a recognized seed type for graph exploration.
 * Accepted values: entity, query, incident, alert.
 */
@Documented
@Constraint(validatedBy = SeedTypeValidator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
public @interface ValidSeedType {

    String message() default "must be one of: entity, query, incident, alert";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
