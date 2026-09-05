package com.hivearmor.security.jwt;

import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * B0-5c defense-in-depth: JWTFilter authenticates from the Authorization header ONLY. The legacy
 * {@code ?access_token=} query fallback was removed because a bearer credential in a URL leaks into
 * access logs, browser history, and Referer headers. This test locks that contract so the fallback
 * cannot be silently reintroduced.
 */
class JWTFilterTest {

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    private TokenProvider tokenProviderAccepting(String validJwt) {
        TokenProvider tp = mock(TokenProvider.class);
        when(tp.validateToken(anyString())).thenAnswer(inv -> validJwt.equals(inv.getArgument(0)));
        when(tp.getAuthentication(validJwt)).thenReturn(
            new UsernamePasswordAuthenticationToken("alice", validJwt,
                List.of(new SimpleGrantedAuthority("ROLE_USER"))));
        return tp;
    }

    @Test
    @DisplayName("authenticates from the Authorization: Bearer header")
    void authenticatesFromHeader() throws Exception {
        JWTFilter filter = new JWTFilter(tokenProviderAccepting("good-jwt"));
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getHeader("Authorization")).thenReturn("Bearer good-jwt");

        filter.doFilter(request, mock(HttpServletResponse.class), mock(FilterChain.class));

        assertNotNull(SecurityContextHolder.getContext().getAuthentication(),
            "a valid Bearer header must authenticate");
    }

    @Test
    @DisplayName("does NOT authenticate from a ?access_token= query parameter (B0-5c removed the fallback)")
    void ignoresQueryTokenParam() throws Exception {
        JWTFilter filter = new JWTFilter(tokenProviderAccepting("good-jwt"));
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getHeader("Authorization")).thenReturn(null);
        // Even a VALID token in the query string must be ignored now.
        when(request.getParameter("access_token")).thenReturn("good-jwt");

        filter.doFilter(request, mock(HttpServletResponse.class), mock(FilterChain.class));

        assertNull(SecurityContextHolder.getContext().getAuthentication(),
            "a token in the URL query string must NOT authenticate — the fallback was removed in B0-5c");
    }
}
