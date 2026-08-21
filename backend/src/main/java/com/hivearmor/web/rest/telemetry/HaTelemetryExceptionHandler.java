package com.hivearmor.web.rest.telemetry;

import com.hivearmor.service.telemetry.TelemetryQueryException;
import com.hivearmor.web.rest.HaCisResource;
import com.hivearmor.web.rest.HaVulnResource;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.net.URI;
import java.time.Instant;

/** RFC 9457 errors for vulnerability and CIS telemetry queries. */
@RestControllerAdvice(assignableTypes = {HaVulnResource.class, HaCisResource.class})
@Order(Ordered.HIGHEST_PRECEDENCE)
public class HaTelemetryExceptionHandler {

    @ExceptionHandler(TelemetryQueryException.class)
    public ProblemDetail handleTelemetryQuery(TelemetryQueryException exception) {
        HttpStatus status = statusFor(exception.getCode());
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(status, exception.getMessage());
        detail.setTitle(titleFor(status));
        detail.setType(URI.create("urn:hivearmor:problem:" + exception.getCode().toLowerCase().replace('_', '-')));
        detail.setProperty("code", exception.getCode());
        detail.setProperty("timestamp", Instant.now().toString());
        return detail;
    }

    private HttpStatus statusFor(String code) {
        if (code.endsWith("_NOT_FOUND")) {
            return HttpStatus.NOT_FOUND;
        }
        if (code.endsWith("_UNAVAILABLE")) {
            return HttpStatus.SERVICE_UNAVAILABLE;
        }
        return HttpStatus.UNPROCESSABLE_ENTITY;
    }

    private String titleFor(HttpStatus status) {
        return switch (status) {
            case NOT_FOUND -> "Telemetry resource not found";
            case SERVICE_UNAVAILABLE -> "Telemetry source unavailable";
            default -> "Telemetry request could not be processed";
        };
    }
}
