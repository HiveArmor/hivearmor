package com.hivearmor.security.telemetry;

import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.service.agent_manager.AgentGrpcService;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Authenticates enrolled agents with device identity ({@code X-HiveArmor-Agent-Id} +
 * {@code X-Agent-Key}), not {@code INTERNAL_KEY}.
 *
 * <p>Covers ha-telemetry ingest and agent policy fetch / report-state (BE-POL-01 ACK).
 * STAGING CANDIDATE — not PRODUCTION READY. Never logs presented keys.
 */
@Component
public class TelemetryAgentIdentityFilter extends OncePerRequestFilter {

    public static final String HEADER_AGENT_ID = "X-HiveArmor-Agent-Id";
    public static final String HEADER_AGENT_KEY = "X-Agent-Key";
    /** Request attribute set after successful device verification (Integer connector id). */
    public static final String ATTR_AGENT_CONNECTOR_ID = "hivearmor.agentConnectorId";

    private static final Logger log = LoggerFactory.getLogger(TelemetryAgentIdentityFilter.class);
    private static final String CLASSNAME = "TelemetryAgentIdentityFilter";
    private static final Pattern AGENT_POLICY_GET =
        Pattern.compile("^/api/agent-policies/\\d+$");

    private final AgentGrpcService agentGrpcService;

    public TelemetryAgentIdentityFilter(AgentGrpcService agentGrpcService) {
        this.agentGrpcService = agentGrpcService;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain) throws ServletException, IOException {
        if (!isAgentDeviceAuthPath(request)) {
            filterChain.doFilter(request, response);
            return;
        }

        String agentIdHeader = request.getHeader(HEADER_AGENT_ID);
        String presentedKey = request.getHeader(HEADER_AGENT_KEY);
        boolean presented = StringUtils.hasText(agentIdHeader) || StringUtils.hasText(presentedKey);
        if (!presented) {
            if (isTelemetryIngest(request) && allowLegacyInternalKey()) {
                filterChain.doFilter(request, response);
                return;
            }
            // Operator JWT / INTERNAL_KEY may still authenticate later for policy ops.
            if (isAgentPolicyPath(request)) {
                filterChain.doFilter(request, response);
                return;
            }
            unauthorized(response);
            return;
        }
        if (!StringUtils.hasText(agentIdHeader) || !StringUtils.hasText(presentedKey)) {
            unauthorized(response);
            return;
        }

        int connectorId;
        try {
            connectorId = Integer.parseInt(agentIdHeader.trim());
        } catch (NumberFormatException e) {
            unauthorized(response);
            return;
        }
        if (connectorId <= 0) {
            unauthorized(response);
            return;
        }

        try {
            AgentGrpcService.ConnectorIdentity identity =
                agentGrpcService.verifyAgentIdentity(connectorId, presentedKey);
            // Dedicated device authority — do not elevate to ROLE_ADMIN.
            List<SimpleGrantedAuthority> authorities = List.of(
                new SimpleGrantedAuthority("ROLE_AGENT_DEVICE"),
                new SimpleGrantedAuthority("ROLE_USER")
            );
            User principal = new User("__agent_device__", "", authorities);
            UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(principal, "__agent_device__", authorities);
            authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
            SecurityContextHolder.getContext().setAuthentication(authentication);
            request.setAttribute(ATTR_AGENT_CONNECTOR_ID, identity.id());
            TenantContext.set(identity.tenantId(), "agent-" + identity.id());
            filterChain.doFilter(request, response);
        } catch (StatusRuntimeException e) {
            Status.Code code = e.getStatus().getCode();
            log.warn("{}: agent identity rejected code={}", CLASSNAME, code);
            if (code == Status.Code.PERMISSION_DENIED) {
                response.sendError(HttpServletResponse.SC_FORBIDDEN);
                return;
            }
            unauthorized(response);
        } catch (Exception e) {
            log.warn("{}: agent identity verification failed: {}", CLASSNAME, e.getMessage());
            unauthorized(response);
        }
    }

    /**
     * Paths that accept enrolled agent device credentials.
     */
    static boolean isAgentDeviceAuthPath(HttpServletRequest request) {
        return isTelemetryIngest(request) || isAgentPolicyPath(request);
    }

    static boolean isAgentPolicyPath(HttpServletRequest request) {
        String path = servletPath(request);
        if (path == null) {
            return false;
        }
        String method = request.getMethod();
        if ("POST".equalsIgnoreCase(method) && "/api/agent-policies/report-state".equals(path)) {
            return true;
        }
        if ("GET".equalsIgnoreCase(method) && AGENT_POLICY_GET.matcher(path).matches()) {
            return true;
        }
        return false;
    }

    static boolean isTelemetryIngest(HttpServletRequest request) {
        String path = servletPath(request);
        if (path == null) {
            return false;
        }
        String method = request.getMethod();
        if ("POST".equalsIgnoreCase(method)) {
            return "/api/ha-telemetry/sca".equals(path) || "/api/ha-telemetry/sbom".equals(path);
        }
        if ("PUT".equalsIgnoreCase(method)) {
            return path.startsWith("/api/ha-telemetry/vitals");
        }
        return false;
    }

    static boolean allowLegacyInternalKey() {
        return "true".equalsIgnoreCase(System.getenv("ALLOW_LEGACY_TELEMETRY_INTERNAL_KEY"));
    }

    private static String servletPath(HttpServletRequest request) {
        String path = request.getServletPath();
        if (path == null || path.isBlank()) {
            path = request.getRequestURI();
        }
        return path;
    }

    private static void unauthorized(HttpServletResponse response) throws IOException {
        response.sendError(HttpServletResponse.SC_UNAUTHORIZED);
    }
}
