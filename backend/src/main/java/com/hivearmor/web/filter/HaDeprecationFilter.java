package com.hivearmor.web.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Deprecation filter for legacy HiveArmor endpoints.
 *
 * Adds RFC 8594 sunset headers to deprecated endpoints without removing them.
 * Legacy endpoints remain fully functional — only headers and rate-limited logging are added.
 *
 * Headers added:
 *   - Sunset: Sat, 21 Feb 2027 00:00:00 GMT
 *   - Deprecation: true
 *   - Link: <successor-url>; rel="successor-version"
 *
 * Rate-limited WARN logging: max once per minute per client IP to avoid log flooding.
 */
@Component
public class HaDeprecationFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(HaDeprecationFilter.class);

    /**
     * Sunset date: 6 months from Sprint 49 completion (August 2026 → February 2027).
     */
    private static final String SUNSET_DATE = "Sat, 21 Feb 2027 00:00:00 GMT";

    /**
     * Rate limit window: 60 seconds (1 log per minute per client IP).
     */
    private static final long LOG_RATE_LIMIT_MS = 60_000L;

    /**
     * Deprecated endpoint mappings: path prefix → successor Link header value.
     */
    private static final Map<String, String> DEPRECATED_ENDPOINTS = Map.of(
        "/api/utm-alerts", "</api/ha-alerts/queue>; rel=\"successor-version\"",
        "/api/offenses", "</api/ha-alerts/queue>; rel=\"successor-version\"",
        "/api/elasticsearch/search", "</api/ha-hunt/search>; rel=\"successor-version\"",
        "/api/ha-response-actions/library", "</api/response/actions>; rel=\"successor-version\"",
        "/api/ha-entities-legacy", "</api/ha-entities>; rel=\"successor-version\""
    );

    /**
     * Rate-limited logging tracker: clientIp → lastLogTimeMillis.
     * Uses ConcurrentHashMap for thread safety across request threads.
     */
    private final ConcurrentHashMap<String, Long> lastLogTimeByIp = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain filterChain) throws ServletException, IOException {

        String path = request.getRequestURI();
        String linkHeader = findDeprecatedMatch(path);

        if (linkHeader != null) {
            // Add deprecation headers
            response.setHeader("Sunset", SUNSET_DATE);
            response.setHeader("Deprecation", "true");
            response.setHeader("Link", linkHeader);

            // Rate-limited deprecation warning log
            logDeprecationWarning(request, path);
        }

        filterChain.doFilter(request, response);
    }

    /**
     * Match the request path against deprecated endpoint prefixes.
     * Returns the Link header value if matched, null otherwise.
     */
    private String findDeprecatedMatch(String path) {
        for (Map.Entry<String, String> entry : DEPRECATED_ENDPOINTS.entrySet()) {
            if (path.startsWith(entry.getKey())) {
                return entry.getValue();
            }
        }
        return null;
    }

    /**
     * Log a deprecation warning, rate-limited to once per minute per client IP.
     */
    private void logDeprecationWarning(HttpServletRequest request, String path) {
        String clientIp = getClientIp(request);
        long now = System.currentTimeMillis();

        Long lastLog = lastLogTimeByIp.get(clientIp);
        if (lastLog == null || (now - lastLog) >= LOG_RATE_LIMIT_MS) {
            lastLogTimeByIp.put(clientIp, now);
            log.warn("Deprecated endpoint accessed: {} by client {} — " +
                     "this endpoint will be removed after {}. Migrate to the successor endpoint.",
                     path, clientIp, SUNSET_DATE);
        }
    }

    /**
     * Extract client IP, respecting X-Forwarded-For if present.
     */
    private String getClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isBlank()) {
            // Take the first IP in the chain (original client)
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
