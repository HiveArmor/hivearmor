package com.hivearmor.web.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Publishes HTTP lifecycle metadata for the legacy SOAR compatibility API.
 *
 * <p>The headers keep older integrations operational while making the canonical
 * successor discoverable to clients, gateways, and API inventory tooling.
 */
@Component
public class LegacySoarApiDeprecationFilter extends OncePerRequestFilter {

    private static final String LEGACY_PREFIX = "/api/soar";
    private static final String SUCCESSOR = "/api/ha-playbooks";

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        return !path.startsWith(LEGACY_PREFIX);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {
        response.setHeader("Deprecation", "version=\"2026-08-11\"");
        response.setHeader("Sunset", "Fri, 31 Dec 2027 23:59:59 GMT");
        response.setHeader("Link", "<" + SUCCESSOR + ">; rel=\"successor-version\"");
        response.setHeader("Warning", "299 HiveArmor \"Deprecated API; migrate to " + SUCCESSOR + "\"");
        filterChain.doFilter(request, response);
    }
}
