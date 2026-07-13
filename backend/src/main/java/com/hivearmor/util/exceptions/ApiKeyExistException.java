package com.hivearmor.util.exceptions;

public class ApiKeyExistException extends RuntimeException {
    public ApiKeyExistException(String message) {
        super(message);
    }
}
