package com.hivearmor.security.internalApiKey;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;

public class InternalApiKeyFilter extends OncePerRequestFilter {
    private static final String CLASSNAME = "InternalApiKeyFilter";
    private final Logger log = LoggerFactory.getLogger(InternalApiKeyFilter.class);
    private static final String API_KEY_HEADER = "X-Internal-Key";
    private static final String LEGACY_API_KEY_HEADER = "Utm-Internal-Key";
    private static Boolean apiKeyHeaderInUse=false;

    private final InternalApiKeyProvider internalApiKeyProvider;

    public InternalApiKeyFilter(InternalApiKeyProvider internalApiKeyProvider) {
        this.internalApiKeyProvider = internalApiKeyProvider;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain) throws ServletException, IOException {
        apiKeyHeaderInUse = false;
        final String ctx = CLASSNAME + ".doFilterInternal";
        if (SecurityContextHolder.getContext().getAuthentication() != null
                && SecurityContextHolder.getContext().getAuthentication().isAuthenticated()) {
            filterChain.doFilter(request, response);
            return;
        }
        String envApiKey = System.getenv("INTERNAL_KEY");

        if (!StringUtils.hasText(envApiKey)) {
            log.error(ctx + ": The environment variable that stores the internal communication key does not exist or has no value");
        } else if (isTelemetryIngestWithoutLegacy(request)) {
            log.debug("{}: refusing INTERNAL_KEY for telemetry ingest unless ALLOW_LEGACY_TELEMETRY_INTERNAL_KEY=true", ctx);
        } else if (matchesInternalKey(request, envApiKey)) {
            UsernamePasswordAuthenticationToken authentication = internalApiKeyProvider.getAuthentication(envApiKey);
            authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
            SecurityContextHolder.getContext().setAuthentication(authentication);
            apiKeyHeaderInUse = true;
        }
        filterChain.doFilter(request, response);
    }

    static boolean matchesInternalKey(HttpServletRequest request, String envApiKey) {
        String primary = request.getHeader(API_KEY_HEADER);
        String legacy = request.getHeader(LEGACY_API_KEY_HEADER);
        return (StringUtils.hasText(primary) && primary.equals(envApiKey))
                || (StringUtils.hasText(legacy) && legacy.equals(envApiKey));
    }

    static boolean isTelemetryIngestWithoutLegacy(HttpServletRequest request) {
        if (!"true".equalsIgnoreCase(System.getenv("ALLOW_LEGACY_TELEMETRY_INTERNAL_KEY"))) {
            String path = request.getServletPath();
            if (path == null || path.isBlank()) {
                path = request.getRequestURI();
            }
            String method = request.getMethod();
            boolean ingest = path != null && (
                    (("POST".equalsIgnoreCase(method))
                            && ("/api/ha-telemetry/sca".equals(path) || "/api/ha-telemetry/sbom".equals(path)))
                    || ("PUT".equalsIgnoreCase(method) && path.startsWith("/api/ha-telemetry/vitals")));
            return ingest;
        }
        return false;
    }

    public static Boolean isApiKeyHeaderInUse(){
        return apiKeyHeaderInUse;
    }
}

