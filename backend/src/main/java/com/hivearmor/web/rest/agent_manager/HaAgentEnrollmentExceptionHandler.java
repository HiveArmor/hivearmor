package com.hivearmor.web.rest.agent_manager;

import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice(assignableTypes = HaAgentEnrollmentResource.class)
@Order(Ordered.HIGHEST_PRECEDENCE)
public class HaAgentEnrollmentExceptionHandler {

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ProblemDetail> handleResponseStatus(ResponseStatusException exception) {
        String detail = exception.getReason();
        if (detail == null || detail.isBlank()) {
            detail = "Agent enrollment request was rejected";
        }
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(exception.getStatusCode(), detail);
        problem.setTitle("Agent enrollment request rejected");
        return ResponseEntity.status(exception.getStatusCode()).body(problem);
    }

    @ExceptionHandler(StatusRuntimeException.class)
    public ProblemDetail handleGrpc(StatusRuntimeException exception) {
        HttpStatus httpStatus = switch (exception.getStatus().getCode()) {
            case INVALID_ARGUMENT -> HttpStatus.BAD_REQUEST;
            case UNAUTHENTICATED -> HttpStatus.UNAUTHORIZED;
            case PERMISSION_DENIED -> HttpStatus.FORBIDDEN;
            case NOT_FOUND -> HttpStatus.NOT_FOUND;
            case ALREADY_EXISTS, ABORTED -> HttpStatus.CONFLICT;
            case FAILED_PRECONDITION -> HttpStatus.UNPROCESSABLE_ENTITY;
            case RESOURCE_EXHAUSTED -> HttpStatus.TOO_MANY_REQUESTS;
            case UNAVAILABLE, DEADLINE_EXCEEDED -> HttpStatus.SERVICE_UNAVAILABLE;
            default -> HttpStatus.INTERNAL_SERVER_ERROR;
        };
        String detail = exception.getStatus().getDescription();
        if (detail == null || detail.isBlank()) {
            detail = Status.fromThrowable(exception).getCode().name().toLowerCase();
        }
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(httpStatus, detail);
        problem.setTitle("Agent enrollment request failed");
        problem.setProperty("grpcCode", exception.getStatus().getCode().name());
        return problem;
    }
}
