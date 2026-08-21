package com.hivearmor.web.rest.hunt;

import com.hivearmor.service.hunt.HuntQueryException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.net.URI;
import java.time.Instant;

/** RFC 9457 error contract for Search &amp; Hunt validation and scope failures. */
@RestControllerAdvice(basePackages = "com.hivearmor.web.rest.hunt")
@Order(Ordered.HIGHEST_PRECEDENCE)
public class HaHuntExceptionHandler {

    @ExceptionHandler(HuntQueryException.class)
    public ProblemDetail handleHuntQuery(HuntQueryException exception) {
        HttpStatus status = statusFor(exception.getCode());
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(status, exception.getMessage());
        detail.setTitle(titleFor(status));
        detail.setType(URI.create("urn:hivearmor:problem:" + exception.getCode().toLowerCase().replace('_', '-')));
        detail.setProperty("code", exception.getCode());
        detail.setProperty("offset", exception.getOffset());
        detail.setProperty("timestamp", Instant.now().toString());
        return detail;
    }

    private HttpStatus statusFor(String code) {
        if (code.endsWith("_FORBIDDEN")) return HttpStatus.FORBIDDEN;
        if (code.endsWith("_NOT_FOUND")) return HttpStatus.NOT_FOUND;
        if (code.endsWith("_EXPIRED")) return HttpStatus.GONE;
        return HttpStatus.UNPROCESSABLE_ENTITY;
    }

    private String titleFor(HttpStatus status) {
        return switch (status) {
            case FORBIDDEN -> "Search scope denied";
            case NOT_FOUND -> "Hunt resource not found";
            case GONE -> "Hunt snapshot expired";
            default -> "Hunt request could not be processed";
        };
    }
}
