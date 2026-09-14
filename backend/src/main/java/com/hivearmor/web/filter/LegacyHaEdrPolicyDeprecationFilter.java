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
 * Adds machine-readable lifecycle metadata to the legacy EDR agent-policy plane
 * (SPEC-06 W5 policy-plane convergence — Plane B).
 *
 * <p>Plane B ({@code /api/ha-edr/policies*}, {@code HaAgentPolicyResource} /
 * {@code ha_agent_policy}) is config-only: it has no APPLY_POLICY push, no
 * versioning, and no agent device-ACK loop, and its enforcement-evidence view
 * already reads Plane A's {@code UtmAgentPolicyState}. The canonical policy plane
 * is Plane A — {@code /api/agent-policies} ({@code AgentPolicyResource} /
 * {@code hive_agent_policy}) — which owns push, versioning, group + per-agent
 * assignment, and the device round-trip.</p>
 *
 * <p>These endpoints remain <strong>fully functional</strong> for a two-release
 * deprecation window; only the RFC 8594 lifecycle headers are added so clients,
 * gateways, generated SDKs, and API-inventory tooling can discover the successor
 * without parsing response bodies. No agent-device wire contract is changed.</p>
 */
@Component
@Order(Ordered.LOWEST_PRECEDENCE)
public class LegacyHaEdrPolicyDeprecationFilter extends OncePerRequestFilter {

    /** Legacy Plane B path prefix. Matches /policies and its sub-resources (/{id}, /assign, /enforcement). */
    static final String LEGACY_PREFIX = "/api/ha-edr/policies";
    static final String SUCCESSOR = "</api/agent-policies>; rel=\"successor-version\"";
    static final String DEPRECATION = "version=\"2026-09-14\"";
    static final String SUNSET = "Fri, 31 Dec 2027 23:59:59 GMT";
    static final String WARNING =
        "299 HiveArmor \"Deprecated API; migrate to /api/agent-policies (canonical policy plane)\"";

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
        response.setHeader("Deprecation", DEPRECATION);
        response.setHeader("Sunset", SUNSET);
        response.setHeader("Link", SUCCESSOR);
        response.setHeader("Warning", WARNING);
        filterChain.doFilter(request, response);
    }
}
