package com.hivearmor.web.interceptor;

import com.hivearmor.domain.HaIdempotencyKey;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.service.idempotency.HaIdempotencyService;
import com.hivearmor.web.rest.errors.HaIdempotencyConflictException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.util.ContentCachingRequestWrapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Optional;

/**
 * {@link HandlerInterceptor} that implements idempotency-key semantics for configured endpoints.
 *
 * <p>Behavior:
 * <ul>
 *   <li>Checks the {@code Idempotency-Key} request header.</li>
 *   <li>On hit (same key + same request hash, not expired): returns cached response
 *       with {@code X-Idempotent-Replay: true} header.</li>
 *   <li>On hit with different hash: throws {@link HaIdempotencyConflictException} (409).</li>
 *   <li>Missing key on required endpoint: returns 400.</li>
 * </ul>
 *
 * <p>Sprint 49 — HAR-003: Idempotency-Key extension for bulk operations.
 *
 * @see com.hivearmor.service.idempotency.HaIdempotencyService
 * @see com.hivearmor.config.HaIdempotencyWebConfig
 */
@Component
public class HaIdempotencyInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(HaIdempotencyInterceptor.class);

    private static final String HEADER_IDEMPOTENCY_KEY = "Idempotency-Key";
    private static final String HEADER_REPLAY = "X-Idempotent-Replay";

    private final HaIdempotencyService idempotencyService;

    public HaIdempotencyInterceptor(HaIdempotencyService idempotencyService) {
        this.idempotencyService = idempotencyService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {

        // Only enforce idempotency on state-changing methods (POST, PATCH, PUT)
        String method = request.getMethod();
        if ("GET".equalsIgnoreCase(method) || "HEAD".equalsIgnoreCase(method) || "OPTIONS".equalsIgnoreCase(method)) {
            return true;
        }

        String idempotencyKey = request.getHeader(HEADER_IDEMPOTENCY_KEY);

        // Missing key on required endpoint → 400
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            response.setStatus(HttpStatus.BAD_REQUEST.value());
            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            response.getWriter().write(
                "{\"type\":\"https://hivearmor.io/problems/missing-idempotency-key\"," +
                "\"title\":\"Missing Idempotency-Key\"," +
                "\"status\":400," +
                "\"detail\":\"The Idempotency-Key header is required for this endpoint.\"}"
            );
            return false;
        }

        String tenantId = resolveTenantId();
        Optional<HaIdempotencyKey> existing = idempotencyService.lookup(idempotencyKey, tenantId);

        if (existing.isPresent()) {
            HaIdempotencyKey record = existing.get();

            // Check if expired — if so, delete and proceed as new
            if (record.getExpiresAt().isBefore(Instant.now())) {
                log.debug("Idempotency key expired, allowing re-execution: key={}", idempotencyKey);
                return true;
            }

            // Compute current request hash and compare
            String currentHash = computeRequestHash(request);
            if (record.getRequestHash().equals(currentHash)) {
                // Same request — return cached response with replay header
                response.setStatus(record.getResponseStatus());
                response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                response.setHeader(HEADER_REPLAY, "true");
                if (record.getResponseBody() != null) {
                    response.getWriter().write(record.getResponseBody());
                }
                log.debug("Returning cached idempotent response: key={}, status={}",
                          idempotencyKey, record.getResponseStatus());
                return false;
            } else {
                // Different request hash — conflict
                throw new HaIdempotencyConflictException(idempotencyKey, String.valueOf(record.getId()));
            }
        }

        // No existing record — allow request to proceed
        // The response will be captured and stored after execution by the controller/advice layer
        request.setAttribute("ha.idempotency.key", idempotencyKey);
        request.setAttribute("ha.idempotency.tenantId", tenantId);
        request.setAttribute("ha.idempotency.requestHash", computeRequestHash(request));
        return true;
    }

    /**
     * Resolves the current tenant ID from TenantContext.
     * Falls back to "default" for non-MSSP deployments.
     */
    private String resolveTenantId() {
        String prefix = TenantContext.get();
        return prefix != null ? prefix : "default";
    }

    /**
     * Computes a SHA-256 hash of the request URI + body for mismatch detection.
     */
    private String computeRequestHash(HttpServletRequest request) {
        try {
            String uri = request.getRequestURI();
            String body = "";
            if (request instanceof ContentCachingRequestWrapper wrapper) {
                byte[] buf = wrapper.getContentAsByteArray();
                if (buf.length > 0) {
                    body = new String(buf, StandardCharsets.UTF_8);
                }
            }
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(uri.getBytes(StandardCharsets.UTF_8));
            digest.update(body.getBytes(StandardCharsets.UTF_8));
            byte[] hash = digest.digest();
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            log.warn("SHA-256 not available for request hash computation");
            return "unknown";
        }
    }
}
