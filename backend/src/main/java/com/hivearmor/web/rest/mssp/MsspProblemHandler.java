package com.hivearmor.web.rest.mssp;

import com.hivearmor.service.mssp.DuplicateLoginException;
import com.hivearmor.service.mssp.DuplicateMembershipException;
import com.hivearmor.service.mssp.DuplicatePrefixException;
import com.hivearmor.service.mssp.NotFoundException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(basePackages = "com.hivearmor.web.rest.mssp")
public class MsspProblemHandler {

    @ExceptionHandler(DuplicatePrefixException.class)
    public ProblemDetail handleDuplicatePrefix(DuplicatePrefixException ex) {
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.CONFLICT);
        pd.setTitle("Duplicate client prefix");
        pd.setDetail(ex.getMessage());
        pd.setProperty("field", "clientPrefix");
        return pd;
    }

    @ExceptionHandler(DuplicateLoginException.class)
    public ProblemDetail handleDuplicateLogin(DuplicateLoginException ex) {
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.CONFLICT);
        pd.setTitle("Duplicate admin login");
        pd.setDetail(ex.getMessage());
        pd.setProperty("field", "adminLogin");
        return pd;
    }

    @ExceptionHandler(DuplicateMembershipException.class)
    public ProblemDetail handleDuplicateMembership(DuplicateMembershipException ex) {
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.CONFLICT);
        pd.setTitle("Duplicate membership");
        pd.setDetail(ex.getMessage());
        pd.setProperty("field", "membership");
        return pd;
    }

    @ExceptionHandler(NotFoundException.class)
    public ProblemDetail handleNotFound(NotFoundException ex) {
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.NOT_FOUND);
        pd.setTitle("Not found");
        pd.setDetail(ex.getMessage());
        return pd;
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ProblemDetail handleDataIntegrity(DataIntegrityViolationException ex) {
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.CONFLICT);
        pd.setTitle("Data integrity violation");
        // Best-effort field detection from exception message
        String msg = ex.getMostSpecificCause().getMessage();
        if (msg != null && msg.contains("client_prefix")) {
            pd.setProperty("field", "clientPrefix");
        } else if (msg != null && msg.contains("login")) {
            pd.setProperty("field", "adminLogin");
        } else if (msg != null && (msg.contains("tenant_id") || msg.contains("user_id"))) {
            pd.setProperty("field", "membership");
        }
        return pd;
    }
}
