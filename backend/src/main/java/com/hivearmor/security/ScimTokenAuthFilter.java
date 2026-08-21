package com.hivearmor.security;

import com.hivearmor.domain.HaConfigurationParameter;
import com.hivearmor.repository.HaConfigurationParameterRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Instant;
import java.util.Collections;
import java.util.Optional;

/**
 * Servlet filter that validates SCIM bearer tokens for every request under
 * {@code /api/ha-scim/}. The token is compared against a bcrypt hash stored in
 * {@code ha_configuration_parameter} under the key {@code SCIM_BEARER_TOKEN_HASH}.
 *
 * <p>This filter is NOT annotated with {@code @Component} — it is registered
 * explicitly in {@code SecurityConfiguration} so that Spring Security can control
 * its position in the filter chain.
 *
 * <p>Security constraints:
 * <ul>
 *   <li>The raw token, stored hash, and any token-related values are NEVER logged.</li>
 *   <li>On missing/invalid token, the filter writes a 401 JSON response and does not
 *       invoke the downstream handler.</li>
 * </ul>
 */
public class ScimTokenAuthFilter extends OncePerRequestFilter {

    private static final String SCIM_TOKEN_KEY = "SCIM_BEARER_TOKEN_HASH";
    private static final String SCIM_LAST_USED_KEY = "SCIM_TOKEN_LAST_USED";
    private static final BCryptPasswordEncoder BCRYPT = new BCryptPasswordEncoder();

    private final HaConfigurationParameterRepository configRepository;

    public ScimTokenAuthFilter(HaConfigurationParameterRepository configRepository) {
        this.configRepository = configRepository;
    }

    /**
     * Skip this filter entirely for any request that does not target the SCIM API.
     *
     * @param request the incoming HTTP request
     * @return {@code true} when the URI does NOT start with {@code /api/ha-scim/},
     *         meaning the filter will be bypassed
     */
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/ha-scim/");
    }

    /**
     * Validates the SCIM bearer token present in the {@code Authorization} header.
     *
     * <p>Flow:
     * <ol>
     *   <li>Read the {@code Authorization} header.</li>
     *   <li>Reject with 401 when the header is absent or does not start with
     *       {@code "Bearer "}.</li>
     *   <li>Strip the {@code "Bearer "} prefix to obtain the raw token.</li>
     *   <li>Look up the bcrypt hash from {@code ha_configuration_parameter}.</li>
     *   <li>Reject with 401 when no row is found, the stored value is blank, or the
     *       bcrypt comparison fails.</li>
     *   <li>On success, populate the {@link SecurityContextHolder} with a
     *       {@code ROLE_SCIM} authority and proceed down the filter chain.</li>
     * </ol>
     */
    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        String authHeader = request.getHeader("Authorization");

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            writeUnauthorized(response, "SCIM token required");
            return;
        }

        String rawToken = authHeader.substring("Bearer ".length());

        Optional<HaConfigurationParameter> paramOpt =
                configRepository.findByParamKey(SCIM_TOKEN_KEY);

        if (paramOpt.isEmpty()) {
            writeUnauthorized(response, "Invalid SCIM token");
            return;
        }

        String storedHash = paramOpt.get().getParamValue();

        if (storedHash == null || storedHash.isBlank()) {
            writeUnauthorized(response, "Invalid SCIM token");
            return;
        }

        if (!BCRYPT.matches(rawToken, storedHash)) {
            writeUnauthorized(response, "Invalid SCIM token");
            return;
        }

        // Token is valid — record last-used timestamp (upsert).
        updateLastUsed();

        // Establish a minimal security context for the SCIM service account.
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                "scim-service-account",
                null,
                Collections.singletonList(new SimpleGrantedAuthority("ROLE_SCIM"))
        );
        SecurityContextHolder.getContext().setAuthentication(auth);

        filterChain.doFilter(request, response);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Upserts the {@code SCIM_TOKEN_LAST_USED} row in {@code ha_configuration_parameter}
     * with the current instant serialised as ISO-8601.  If the row does not yet exist it
     * is created; if it already exists its {@code param_value} is overwritten.
     *
     * <p>The raw token is NOT used here and is never written to any log or column.
     */
    private void updateLastUsed() {
        String nowIso = Instant.now().toString();
        HaConfigurationParameter param = configRepository
                .findByParamKey(SCIM_LAST_USED_KEY)
                .orElseGet(() -> {
                    HaConfigurationParameter p = new HaConfigurationParameter();
                    p.setParamKey(SCIM_LAST_USED_KEY);
                    return p;
                });
        param.setParamValue(nowIso);
        param.setUpdatedAt(Instant.now());
        configRepository.save(param);
    }

    /**
     * Writes a JSON 401 error response and commits it to the client.
     * No token-related values are included in this output.
     *
     * @param response the HTTP response to write to
     * @param detail   human-readable detail message (no sensitive data)
     */
    private static void writeUnauthorized(HttpServletResponse response, String detail)
            throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.getWriter().write("{\"status\":401,\"detail\":\"" + detail + "\"}");
    }
}
