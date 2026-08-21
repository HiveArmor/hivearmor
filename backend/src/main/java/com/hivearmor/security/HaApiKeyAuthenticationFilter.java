package com.hivearmor.security;

import com.hivearmor.domain.HaApiKey;
import com.hivearmor.domain.enumeration.ApiKeyStatus;
import com.hivearmor.repository.HaApiKeyRepository;
import com.hivearmor.service.admin.api_key.HaApiKeyService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Servlet filter that authenticates requests carrying a HiveArmor API key.
 *
 * <h3>Header format</h3>
 * <pre>Authorization: ApiKey ha_&lt;40-character-body&gt;</pre>
 *
 * <h3>Authentication steps</h3>
 * <ol>
 *   <li>Skip all requests whose {@code Authorization} header does not start with
 *       {@code "ApiKey "} — pass them to the next filter unchanged.</li>
 *   <li>Extract the token string from the header.</li>
 *   <li>Narrow candidate rows using {@code key_prefix} = {@code token.substring(0, 8)}
 *       (O(1) database lookup before the expensive bcrypt step).</li>
 *   <li>Bcrypt-verify the full token against the stored {@code key_hash}.</li>
 *   <li>Compute the key status via
 *       {@link HaApiKeyService#computeStatus(Instant, Instant, Instant)}.</li>
 *   <li>If status is {@code revoked} or {@code expired}, write HTTP 401 and stop
 *       the filter chain — the controller is never invoked (Requirement 6.5).</li>
 *   <li>On a valid, active key: update {@code last_used_at}, install a Spring
 *       {@link UsernamePasswordAuthenticationToken} in
 *       {@link SecurityContextHolder}, and continue the filter chain.</li>
 * </ol>
 *
 * <h3>Filter chain placement</h3>
 * <p>Registered in {@link com.hivearmor.config.SecurityConfiguration} after the JWT
 * authentication filter and before the authorization layer.
 *
 * @see com.hivearmor.config.SecurityConfiguration
 * @see HaApiKeyService#computeStatus(Instant, Instant, Instant)
 * @see com.hivearmor.repository.HaApiKeyRepository#findByKeyPrefix(String)
 */
@Component
@RequiredArgsConstructor
public class HaApiKeyAuthenticationFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(HaApiKeyAuthenticationFilter.class);

    /** Header name used by both JWT and API-key schemes. */
    private static final String AUTHORIZATION_HEADER = "Authorization";

    /** Prefix that distinguishes HiveArmor API-key requests from Bearer/JWT ones. */
    private static final String API_KEY_PREFIX = "ApiKey ";

    /**
     * Minimum token length: "ApiKey " (7) + "ha_" (3) + 40-char body = 50 chars.
     * Any shorter value cannot be a well-formed token and is rejected immediately
     * without touching the database.
     */
    private static final int MIN_TOKEN_LENGTH = 43; // "ha_" + 40 chars

    /**
     * Length of the {@code key_prefix} column — first 8 characters of the token,
     * which includes the {@code "ha_"} prefix and 5 body characters.
     */
    private static final int KEY_PREFIX_LENGTH = 8;

    /**
     * BCrypt encoder at strength 10, matching the strength used in
     * {@link HaApiKeyService} (Requirement 4.5).
     */
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(10);

    private final HaApiKeyRepository haApiKeyRepository;

    // =========================================================================
    // Filter logic
    // =========================================================================

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain)
            throws ServletException, IOException {

        String authHeader = request.getHeader(AUTHORIZATION_HEADER);

        // Step 1 — skip requests that don't carry an ApiKey header
        if (!StringUtils.hasText(authHeader) || !authHeader.startsWith(API_KEY_PREFIX)) {
            filterChain.doFilter(request, response);
            return;
        }

        // Step 2 — extract the raw token string
        String token = authHeader.substring(API_KEY_PREFIX.length()).trim();

        if (token.length() < MIN_TOKEN_LENGTH) {
            log.warn("HaApiKeyAuthenticationFilter: token too short ({} chars), rejecting", token.length());
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Invalid API key");
            return;
        }

        // Step 3 — narrow candidates via key_prefix (first 8 chars of the token)
        String keyPrefix = token.substring(0, KEY_PREFIX_LENGTH);
        Optional<HaApiKey> candidate = haApiKeyRepository.findByKeyPrefix(keyPrefix);

        if (candidate.isEmpty()) {
            log.warn("HaApiKeyAuthenticationFilter: no key found for prefix={}", keyPrefix);
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Invalid API key");
            return;
        }

        HaApiKey apiKey = candidate.get();

        // Step 4 — bcrypt-verify the full token against the stored hash
        if (!encoder.matches(token, apiKey.getKeyHash())) {
            log.warn("HaApiKeyAuthenticationFilter: bcrypt mismatch for prefix={}", keyPrefix);
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Invalid API key");
            return;
        }

        // Step 5 — compute the key status
        ApiKeyStatus status = HaApiKeyService.computeStatus(
                apiKey.getRevokedAt(),
                apiKey.getExpiresAt(),
                Instant.now()
        );

        // Step 6 — reject revoked or expired keys with HTTP 401 (Requirement 6.5)
        if (status == ApiKeyStatus.revoked || status == ApiKeyStatus.expired) {
            log.warn("HaApiKeyAuthenticationFilter: key id={} is {} — rejecting with 401",
                    apiKey.getId(), status);
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED,
                    "API key is " + status.name());
            return;
        }

        // Step 7 — valid active key: update last_used_at, set authentication, continue
        updateLastUsedAt(apiKey);

        UsernamePasswordAuthenticationToken authentication = buildAuthentication(apiKey, request);
        SecurityContextHolder.getContext().setAuthentication(authentication);

        log.debug("HaApiKeyAuthenticationFilter: authenticated via API key id={} scopes={}",
                apiKey.getId(), apiKey.getScopes());

        filterChain.doFilter(request, response);
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /**
     * Persists the current server time as {@code last_used_at} for the given key.
     *
     * <p>Any persistence failure is caught and logged; it must not interrupt the
     * request because the authentication itself succeeded.
     *
     * @param apiKey the matched, active {@link HaApiKey}
     */
    private void updateLastUsedAt(HaApiKey apiKey) {
        try {
            apiKey.setLastUsedAt(Instant.now());
            haApiKeyRepository.save(apiKey);
        } catch (Exception e) {
            // Non-fatal — authentication succeeded; do not abort the request.
            log.error("HaApiKeyAuthenticationFilter: failed to update last_used_at for key id={}",
                    apiKey.getId(), e);
        }
    }

    /**
     * Builds a fully-populated {@link UsernamePasswordAuthenticationToken} for the
     * authenticated API key.
     *
     * <p>Scopes stored as a comma-separated string are split and each value is
     * promoted to a {@code ROLE_} prefixed {@link SimpleGrantedAuthority} so that
     * {@code @PreAuthorize("hasRole(...)")} expressions resolve correctly.
     *
     * @param apiKey  the matched, active {@link HaApiKey}
     * @param request the current HTTP request (used for details population)
     * @return a ready-to-use authentication token
     */
    private UsernamePasswordAuthenticationToken buildAuthentication(HaApiKey apiKey,
                                                                    HttpServletRequest request) {
        List<SimpleGrantedAuthority> authorities = scopesToAuthorities(apiKey.getScopes());

        // Principal is the key's name; credentials are the key prefix (not the hash)
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                "api-key:" + apiKey.getName(),
                apiKey.getKeyPrefix(),
                authorities
        );
        auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
        return auth;
    }

    /**
     * Converts a comma-separated scopes string into a list of Spring
     * {@link SimpleGrantedAuthority} objects.
     *
     * <p>Each scope name is uppercased and prefixed with {@code "ROLE_"} to
     * align with Spring Security's role-checking conventions.
     *
     * @param scopesCsv comma-separated scope names, e.g. {@code "read_alerts,admin"}
     * @return list of granted authorities; never {@code null}, may be empty
     */
    private List<SimpleGrantedAuthority> scopesToAuthorities(String scopesCsv) {
        if (!StringUtils.hasText(scopesCsv)) {
            return List.of();
        }
        return List.of(scopesCsv.split(","))
                .stream()
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(s -> new SimpleGrantedAuthority("ROLE_" + s.toUpperCase()))
                .toList();
    }
}
