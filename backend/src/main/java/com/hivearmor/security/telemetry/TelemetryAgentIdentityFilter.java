package com.hivearmor.security.telemetry;

import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.security.internalApiKey.InternalApiKeyProvider;
import com.hivearmor.service.agent_manager.AgentGrpcService;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;

/**
 * Authenticates agent telemetry ingest with device identity, not {@code INTERNAL_KEY}.
 */
@Component
public class TelemetryAgentIdentityFilter extends OncePerRequestFilter {

    public static final String HEADER_AGENT_ID = "X-HiveArmor-Agent-Id";
    public static final String HEADER_AGENT_KEY = "X-Agent-Key";

    private static final Logger log = LoggerFactory.getLogger(TelemetryAgentIdentityFilter.class);
    private static final String CLASSNAME = "TelemetryAgentIdentityFilter";

    private final AgentGrpcService agentGrpcService;
    private final InternalApiKeyProvider internalApiKeyProvider;

    public TelemetryAgentIdentityFilter(AgentGrpcService agentGrpcService,
                                        InternalApiKeyProvider internalApiKeyProvider) {
        this.agentGrpcService = agentGrpcService;
        this.internalApiKeyProvider = internalApiKeyProvider;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain) throws ServletException, IOException {
        if (!isTelemetryIngest(request)) {
            filterChain.doFilter(request, response);
            return;
        }

        String agentIdHeader = request.getHeader(HEADER_AGENT_ID);
        String presentedKey = request.getHeader(HEADER_AGENT_KEY);
        boolean presented = StringUtils.hasText(agentIdHeader) || StringUtils.hasText(presentedKey);
        if (!presented) {
            if (allowLegacyInternalKey()) {
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
            UsernamePasswordAuthenticationToken authentication =
                internalApiKeyProvider.getAuthentication("__agent_device__");
            authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
            SecurityContextHolder.getContext().setAuthentication(authentication);
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

    static boolean isTelemetryIngest(HttpServletRequest request) {
        String path = request.getServletPath();
        if (path == null || path.isBlank()) {
            path = request.getRequestURI();
        }
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

    private static void unauthorized(HttpServletResponse response) throws IOException {
        response.sendError(HttpServletResponse.SC_UNAUTHORIZED);
    }
}
