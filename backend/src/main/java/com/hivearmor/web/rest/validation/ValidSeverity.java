package com.hivearmor.web.rest.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Validates that a string field contains a recognized severity level.
 * Accepted values: critical, high, medium, low, info.
 */
@Documented
@Constraint(validatedBy = SeverityValidator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
public @interface ValidSeverity {

    String message() default "must be one of: critical, high, medium, low, info";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
