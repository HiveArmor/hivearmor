package com.hivearmor.web.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Adds machine-readable lifecycle metadata to the retained correlation-rule API.
 *
 * <p>The compatibility controller remains callable; these headers allow API
 * clients, gateways, generated SDKs, and observability tooling to discover the
 * canonical detection-engineering successor without parsing response bodies.</p>
 */
@Component
@Order(Ordered.LOWEST_PRECEDENCE)
public class LegacyDetectionApiDeprecationFilter extends OncePerRequestFilter {

    static final String LEGACY_PREFIX = "/api/correlation-rule";
    static final String SUCCESSOR = "</api/ha-detection-rules>; rel=\"successor-version\"";
    static final String SUNSET = "Fri, 31 Dec 2027 23:59:59 GMT";

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String contextPath = request.getContextPath();
        String requestUri = request.getRequestURI();
        String applicationPath = contextPath == null || contextPath.isEmpty()
            ? requestUri
            : requestUri.substring(contextPath.length());
        return !applicationPath.startsWith(LEGACY_PREFIX);
    }

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain
    ) throws ServletException, IOException {
        response.setHeader("Deprecation", "version=\"2026-08-11\"");
        response.setHeader("Sunset", SUNSET);
        response.setHeader("Link", SUCCESSOR);
        response.setHeader("Warning", "299 HiveArmor \"Deprecated API; migrate to /api/ha-detection-rules\"");
        filterChain.doFilter(request, response);
    }
}
