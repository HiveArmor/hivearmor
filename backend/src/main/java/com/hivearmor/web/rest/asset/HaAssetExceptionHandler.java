package com.hivearmor.web.rest.asset;

import com.hivearmor.service.asset.AssetContractException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.net.URI;
import java.time.Instant;

/** RFC 9457 errors scoped to the canonical asset API. */
@RestControllerAdvice(assignableTypes = HaAssetResource.class)
@Order(Ordered.HIGHEST_PRECEDENCE)
public class HaAssetExceptionHandler {

    @ExceptionHandler(AssetContractException.class)
    public ProblemDetail handle(AssetContractException exception) {
        HttpStatus status = status(exception.getCode());
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, exception.getMessage());
        problem.setTitle("Asset Intelligence request rejected");
        problem.setType(URI.create("urn:hivearmor:problem:" + exception.getCode().toLowerCase().replace('_', '-')));
        problem.setProperty("code", exception.getCode());
        problem.setProperty("timestamp", Instant.now().toString());
        return problem;
    }

    private HttpStatus status(String code) {
        if (code.endsWith("_FORBIDDEN") || code.endsWith("_PRINCIPAL_REQUIRED")) return HttpStatus.FORBIDDEN;
        if (code.endsWith("_NOT_FOUND")) return HttpStatus.NOT_FOUND;
        if (code.endsWith("_EXPIRED")) return HttpStatus.GONE;
        return HttpStatus.UNPROCESSABLE_ENTITY;
    }
}
