package com.hivearmor.web.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

/**
 * Security headers filter for all HiveArmor API responses.
 *
 * Adds:
 * - X-Content-Type-Options: nosniff (all responses)
 * - X-Frame-Options: DENY (all responses)
 * - Cache-Control: no-store (mutable endpoints: POST, PATCH, PUT, DELETE on /ha-* paths)
 * - Content-Security-Policy: default-src 'none' (SSE endpoints only)
 * - Strict-Transport-Security: max-age=31536000; includeSubDomains (production profile only)
 *
 * Registered in SecurityConfiguration after HaCorrelationIdFilter, before Spring Security chain.
 */
@Component
public class HaSecurityHeadersFilter extends OncePerRequestFilter {

    private static final Set<String> MUTABLE_METHODS = Set.of("POST", "PATCH", "PUT", "DELETE");

    @Value("${spring.profiles.active:dev}")
    private String activeProfile;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain filterChain) throws ServletException, IOException {

        // Always add these headers
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("X-Frame-Options", "DENY");

        String path = request.getRequestURI();
        String method = request.getMethod();

        // Cache-Control: no-store on mutable /ha-* endpoints
        if (path.contains("/ha-") && MUTABLE_METHODS.contains(method)) {
            response.setHeader("Cache-Control", "no-store");
        }

        // Content-Security-Policy on SSE endpoints (detected by Accept header or path ending in /stream)
        if (isSseEndpoint(request, path)) {
            response.setHeader("Content-Security-Policy", "default-src 'none'");
        }

        // HSTS for production profile only
        if (isProductionProfile()) {
            response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
        }

        filterChain.doFilter(request, response);
    }

    private boolean isSseEndpoint(HttpServletRequest request, String path) {
        // Detect SSE by path ending in /stream
        if (path.endsWith("/stream")) {
            return true;
        }
        // Detect SSE by Accept: text/event-stream header
        String accept = request.getHeader("Accept");
        return accept != null && accept.contains("text/event-stream");
    }

    private boolean isProductionProfile() {
        return activeProfile != null && activeProfile.contains("prod");
    }
}
