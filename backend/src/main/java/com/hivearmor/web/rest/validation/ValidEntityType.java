package com.hivearmor.web.rest.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Validates that a string field contains a recognized entity type.
 * Accepted values: user, host, ip, process, file, domain, email, hash, url, registry.
 */
@Documented
@Constraint(validatedBy = EntityTypeValidator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
public @interface ValidEntityType {

    String message() default "must be one of: user, host, ip, process, file, domain, email, hash, url, registry";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
