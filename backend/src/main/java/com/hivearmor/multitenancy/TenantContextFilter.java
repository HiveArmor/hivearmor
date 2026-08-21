package com.hivearmor.multitenancy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.HaTenantUser;
import com.hivearmor.repository.HaTenantUserRepository;
import com.hivearmor.repository.UserRepository;
import com.hivearmor.security.jwt.TokenProvider;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.net.URI;
import java.util.Optional;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class TenantContextFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(TenantContextFilter.class);
    private static final String HEADER_TENANT_PREFIX = "X-Tenant-Prefix";
    private static final String AUTHORITY_MSSP_ADMIN = "MSSP_ADMIN";
    private static final String AUTHORITY_ADMIN = "ROLE_ADMIN";
    private static final String ANONYMOUS_PRINCIPAL = "anonymousUser";

    private final MsspTenantResolver resolver;
    private final HaTenantUserRepository tenantUsers;
    private final UserRepository users;
    private final TokenProvider tokenProvider;
    private final ObjectMapper objectMapper;
    private final boolean legacyPrefixOnlyMode;

    @Autowired
    public TenantContextFilter(MsspTenantResolver resolver,
                               HaTenantUserRepository tenantUsers,
                               UserRepository users,
                               TokenProvider tokenProvider,
                               ObjectMapper objectMapper) {
        this.resolver    = resolver;
        this.tenantUsers = tenantUsers;
        this.users = users;
        this.tokenProvider = tokenProvider;
        this.objectMapper = objectMapper;
        this.legacyPrefixOnlyMode = false;
    }

    /** Production-equivalent constructor retained for isolated filter tests. */
    TenantContextFilter(MsspTenantResolver resolver,
                        HaTenantUserRepository tenantUsers,
                        UserRepository users,
                        TokenProvider tokenProvider) {
        this(resolver, tenantUsers, users, tokenProvider, new ObjectMapper());
    }

    /** Compatibility constructor retained for isolated legacy filter tests. */
    TenantContextFilter(MsspTenantResolver resolver, HaTenantUserRepository tenantUsers) {
        this.resolver = resolver;
        this.tenantUsers = tenantUsers;
        this.users = null;
        this.tokenProvider = null;
        this.objectMapper = new ObjectMapper();
        this.legacyPrefixOnlyMode = true;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws IOException, ServletException {
        try {
            ResolvedTenant tenant = resolveTenant(request, response);
            if (tenant == null && response.isCommitted()) {
                return;
            }
            if (tenant != null) {
                TenantContext.set(tenant.clientId(), tenant.prefix());
            }
            filterChain.doFilter(request, response);
        } finally {
            TenantContext.clear();
        }
    }

    private ResolvedTenant resolveTenant(HttpServletRequest request, HttpServletResponse response) throws IOException {
        Authentication auth = resolveAuthentication(request);

        // The tenant selector is an authorization boundary, not merely a routing hint.
        // Resolve it only from a validated JWT and verify membership before establishing
        // the request context. Invalid/unauthorized tenant headers fail closed instead of
        // silently falling back to the global data scope.
        String tenantIdHeader = request.getHeader("X-Tenant-ID");
        if (tenantIdHeader != null && !tenantIdHeader.isBlank()) {
            if (!isAuthenticated(auth)) {
                writeProblem(response, HttpStatus.UNAUTHORIZED, "Authentication Required",
                    "Authentication is required for tenant selection", "authentication-required");
                return null;
            }
            try {
                Long requestedClientId = Long.parseLong(tenantIdHeader.trim());
                if (!isAuthorizedForTenant(auth, requestedClientId)) {
                    writeProblem(response, HttpStatus.FORBIDDEN, "Access Denied",
                        "Tenant is outside the authorized scope", "tenant-scope-denied");
                    return null;
                }
                Optional<String> prefix = resolver.resolvePrefix(requestedClientId);
                if (prefix.isEmpty()) {
                    writeProblem(response, HttpStatus.NOT_FOUND, "Tenant Scope Not Found",
                        "Tenant scope was not found", "tenant-scope-not-found");
                    return null;
                }
                return new ResolvedTenant(requestedClientId, prefix.get());
            } catch (NumberFormatException ignored) {
                writeProblem(response, HttpStatus.BAD_REQUEST, "Invalid Tenant Scope",
                    "X-Tenant-ID must be a numeric tenant identifier", "invalid-tenant-scope");
                return null;
            }
        }

        if (!isAuthenticated(auth)) {
            return null;
        }

        // (a) MSSP_ADMIN + X-Tenant-Prefix header
        if (hasAuthority(auth, AUTHORITY_MSSP_ADMIN)) {
            String header = request.getHeader(HEADER_TENANT_PREFIX);
            if (header != null && !header.isBlank()) {
                String trimmed = header.trim();
                log.info("MSSP admin '{}' impersonating tenant prefix '{}'", auth.getName(), trimmed);
                // Kept only for older isolated tests using the package-private
                // constructor. Spring always uses the production constructor below,
                // where the prefix must resolve to a canonical tenant record.
                if (legacyPrefixOnlyMode) {
                    return new ResolvedTenant(null, trimmed);
                }
                Optional<ResolvedTenant> resolved = resolver.resolveTenant(trimmed)
                    .map(tenant -> new ResolvedTenant(tenant.getId(), tenant.getClientPrefix()));
                if (resolved.isEmpty()) {
                    writeProblem(response, HttpStatus.NOT_FOUND, "Tenant Scope Not Found",
                        "Tenant scope was not found", "tenant-scope-not-found");
                    return null;
                }
                return resolved.get();
            }
        }

        // (b) JWT clientId claim
        Long clientId = extractClientIdClaim(auth);
        if (clientId != null) {
            Optional<String> byClaim = resolver.resolvePrefix(clientId);
            if (byClaim.isPresent()) {
                return new ResolvedTenant(clientId, byClaim.get());
            }
        }

        // (c) ha_tenant_user fallback
        Long userId = users == null ? extractLegacyUserId(auth)
            : users.findOneByLogin(auth.getName()).map(user -> user.getId()).orElse(null);
        if (userId != null) {
            Optional<Long> fallbackClient = tenantUsers.findFirstByJhiUserId(userId)
                                                      .map(HaTenantUser::getClientId);
            if (fallbackClient.isPresent()) {
                Optional<String> byFallback = resolver.resolvePrefix(fallbackClient.get());
                if (byFallback.isPresent()) {
                    return new ResolvedTenant(fallbackClient.get(), byFallback.get());
                }
            }
        }

        // (d) global (null)
        return null;
    }

    /**
     * Writes the terminal tenant-boundary response directly. Calling sendError from
     * this pre-authentication filter triggers an ERROR dispatch to /error, where the
     * original JWT has not yet populated the security context and the intended
     * 400/403/404 can be incorrectly replaced with 401.
     */
    private void writeProblem(HttpServletResponse response,
                              HttpStatus status,
                              String title,
                              String detail,
                              String type) throws IOException {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(title);
        problem.setType(URI.create("https://hivearmor.io/problems/" + type));
        response.setStatus(status.value());
        response.setCharacterEncoding("UTF-8");
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        objectMapper.writeValue(response.getOutputStream(), problem);
        response.flushBuffer();
    }

    private Authentication resolveAuthentication(HttpServletRequest request) {
        Authentication existing = SecurityContextHolder.getContext().getAuthentication();
        if (isAuthenticated(existing)) {
            return existing;
        }
        String authorization = request.getHeader("Authorization");
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            return null;
        }
        String token = authorization.substring(7);
        if (tokenProvider == null || !tokenProvider.validateToken(token)) {
            return null;
        }
        return tokenProvider.getAuthentication(token);
    }

    private boolean isAuthorizedForTenant(Authentication auth, Long clientId) {
        if (hasAuthority(auth, AUTHORITY_MSSP_ADMIN) || hasAuthority(auth, AUTHORITY_ADMIN)) {
            return true;
        }
        if (users == null) {
            return false;
        }
        return users.findOneByLogin(auth.getName())
            .map(user -> tenantUsers.existsByClientIdAndJhiUserId(clientId, user.getId()))
            .orElse(false);
    }

    private boolean isAuthenticated(Authentication auth) {
        return auth != null && auth.isAuthenticated() && !ANONYMOUS_PRINCIPAL.equals(auth.getPrincipal());
    }

    private boolean hasAuthority(Authentication auth, String authority) {
        return auth.getAuthorities().stream()
                   .map(GrantedAuthority::getAuthority)
                   .anyMatch(authority::equals);
    }

    private Long extractClientIdClaim(Authentication auth) {
        if (tokenProvider == null) {
            return null;
        }
        Object credentials = auth.getCredentials();
        if (credentials instanceof String token && !token.isBlank()) {
            try {
                return tokenProvider.getClientIdFromToken(token).orElse(null);
            } catch (Exception ignored) {
                // The request authentication is authoritative; an absent legacy claim
                // simply falls through to the membership lookup.
            }
        }
        return null;
    }

    private Long extractLegacyUserId(Authentication auth) {
        Object details = auth.getDetails();
        if (details instanceof java.util.Map<?, ?> map && map.get("userId") instanceof Number value) {
            return value.longValue();
        }
        try {
            return Long.parseLong(auth.getName());
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private record ResolvedTenant(Long clientId, String prefix) { }
}
