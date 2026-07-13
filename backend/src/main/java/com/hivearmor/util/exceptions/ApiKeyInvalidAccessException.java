package com.hivearmor.util.exceptions;

import org.springframework.security.core.AuthenticationException;

public class ApiKeyInvalidAccessException extends AuthenticationException {
    public ApiKeyInvalidAccessException(String message) {
        super(message);
    }
}
