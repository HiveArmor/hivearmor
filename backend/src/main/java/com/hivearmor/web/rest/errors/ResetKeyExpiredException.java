package com.hivearmor.web.rest.errors;

import com.hivearmor.util.exceptions.ApiException;
import org.springframework.http.HttpStatus;

public class ResetKeyExpiredException extends ApiException {

    public ResetKeyExpiredException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }
}
