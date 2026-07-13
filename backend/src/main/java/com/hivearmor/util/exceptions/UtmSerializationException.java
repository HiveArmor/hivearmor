package com.hivearmor.util.exceptions;

public class UtmSerializationException extends RuntimeException {
    public UtmSerializationException(String message) {
        super(message);
    }

    public UtmSerializationException(String message, Throwable cause) {
        super(message, cause);
    }
}
