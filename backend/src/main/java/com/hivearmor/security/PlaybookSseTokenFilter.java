package com.hivearmor.security;

import com.hivearmor.security.jwt.TokenProvider;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.util.AntPathMatcher;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Servlet filter that enables JWT authentication via the {@code ?token=} query
 * parameter exclusively for the SSE endpoint
 * {@code GET /api/ha-playbooks/&#42;/stream}.
 *
 * <p><strong>Scope restriction:</strong> The filter activates ONLY for requests
 * whose URI matches the Ant pattern {@code /api/ha-playbooks/&#42;/stream}.  All
 * other requests pass through without inspection.  This pattern MUST NOT be
 * extended to any non-SSE endpoint.
 *
 * <p><strong>Rationale:</strong> The browser native {@code EventSource} API cannot
 * send an {@code Authorization} header, so the JWT must travel as a query
 * parameter on SSE connect requests.  This is the same reasoning that governs the
 * existing alert-stream pattern.
 *
 * <p><strong>Security constraints:</strong>
 * <ul>
 *   <li>The raw token value is NEVER written to any log at any level.</li>
 *   <li>The filter is NOT annotated with {@code @Component} — it is registered
 *       explicitly in {@code SecurityConfiguration} so that Spring Security owns
 *       its position in the filter chain.</li>
 *   <li>When the token is absent or invalid, the filter does not set a security
 *       context; downstream access-control checks ({@code @PreAuthorize}) will
 *       reject the request with HTTP 401/403 as normal.</li>
 * </ul>
 */
public class PlaybookSseTokenFilter extends OncePerRequestFilter {

    /**
     * Query parameter name used to carry the JWT on SSE connect requests.
     * Named {@code token} to match the convention used by the existing
     * alert-stream ({@code useAlertStream.ts}).
     */
    static final String TOKEN_PARAM = "token";

    /**
     * Ant-style path patterns that this filter is restricted to.
     * Matches SSE endpoints that use {@code ?token=} query param authentication:
     * <ul>
     *   <li>{@code GET /api/ha-playbooks/{executionId}/stream}</li>
     *   <li>{@code GET /api/ha-alerts/{alertId}/stream} (Sprint 41 — ALT-012)</li>
     * </ul>
     */
    private static final String[] SSE_PATH_PATTERNS = {
        "/api/ha-playbooks/*/stream",
        "/api/ha-alerts/*/stream",
        "/api/ha-correlated-findings/stream"
    };

    private static final AntPathMatcher PATH_MATCHER = new AntPathMatcher();

    private final TokenProvider tokenProvider;

    /**
     * Constructor-injected — no {@code @Autowired} on fields per Sprint 18 constraints.
     *
     * @param tokenProvider the JWT validator/parser shared with {@link com.hivearmor.security.jwt.JWTFilter}
     */
    public PlaybookSseTokenFilter(TokenProvider tokenProvider) {
        this.tokenProvider = tokenProvider;
    }

    /**
     * Returns {@code true} (skip) for every request whose URI does NOT match
     * any of the configured SSE path patterns.  This ensures the filter is a
     * no-op for all non-SSE endpoints.
     *
     * @param request the incoming HTTP request
     * @return {@code true} when the request should bypass this filter
     */
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        for (String pattern : SSE_PATH_PATTERNS) {
            if (PATH_MATCHER.match(pattern, uri)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Reads the {@code ?token=} query parameter and, if it contains a valid JWT,
     * populates the {@link SecurityContextHolder}.  If the parameter is absent or
     * the JWT fails validation, the security context is left unchanged and the
     * downstream {@code @PreAuthorize} annotation on the SSE endpoint will reject
     * the unauthenticated request.
     *
     * <p>The token value is NEVER logged at any level.
     */
    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        String jwt = request.getParameter(TOKEN_PARAM);

        if (StringUtils.hasText(jwt) && tokenProvider.validateToken(jwt)) {
            UsernamePasswordAuthenticationToken authentication =
                    tokenProvider.getAuthentication(jwt);
            authentication.setDetails(
                    new WebAuthenticationDetailsSource().buildDetails(request));
            SecurityContextHolder.getContext().setAuthentication(authentication);
        }

        filterChain.doFilter(request, response);
    }
}
