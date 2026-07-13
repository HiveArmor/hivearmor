package com.hivearmor.security.jwt;

import com.hivearmor.security.AuthoritiesConstants;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import tech.jhipster.config.JHipsterProperties;

import java.util.Collection;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.*;

/**
 * T-001 — TokenProvider unit tests.
 * Covers: token generation, role claims, expiry, PRE_VERIFICATION_USER (TFA temp token),
 * validateToken, getAuthentication, and isAuthenticated.
 *
 * Tracking: testing.md — JWT / auth changes gate.
 */
class TokenProviderTest {

    // Fixed test key — 64 random bytes encoded as Base64
    static final String TEST_BASE64_SECRET =
        "ZjY4MDYwNWU0ZTQ3MGFkMjJiY2IzYjMyNzAyMGE5NzMxMjdhY2JhMmQ5MDg5MzVjMmJhMTZlY2I5ZjE0NDZiNg==";

    private TokenProvider tokenProvider;

    @BeforeEach
    void setUp() throws Exception {
        JHipsterProperties jHipsterProperties = new JHipsterProperties();
        jHipsterProperties.getSecurity().getAuthentication().getJwt()
                .setBase64Secret(TEST_BASE64_SECRET);
        jHipsterProperties.getSecurity().getAuthentication().getJwt()
                .setTokenValidityInSeconds(86400L);
        jHipsterProperties.getSecurity().getAuthentication().getJwt()
                .setTokenValidityInSecondsForRememberMe(2592000L);
        tokenProvider = new TokenProvider(jHipsterProperties);
        tokenProvider.afterPropertiesSet();
    }

    // ── T-001-1 ───────────────────────────────────────────────────────────────
    @Test
    void createToken_adminRole_tokenIsValidAndContainsAdminAuthority() {
        Authentication auth = buildAuthentication("testadmin", AuthoritiesConstants.ADMIN);

        String token = tokenProvider.createToken(auth, false, true);

        assertNotNull(token, "Token must not be null");
        assertTrue(tokenProvider.validateToken(token), "Token must pass validation");

        UsernamePasswordAuthenticationToken resultAuth = tokenProvider.getAuthentication(token);
        Collection<? extends GrantedAuthority> authorities = resultAuth.getAuthorities();
        assertThat(authorities).extracting(GrantedAuthority::getAuthority)
                .containsExactly(AuthoritiesConstants.ADMIN);
    }

    // ── T-001-2 ───────────────────────────────────────────────────────────────
    @Test
    void createToken_userRole_tokenContainsUserAuthority() {
        Authentication auth = buildAuthentication("testuser", AuthoritiesConstants.USER);

        String token = tokenProvider.createToken(auth, false, true);

        assertTrue(tokenProvider.validateToken(token));
        UsernamePasswordAuthenticationToken resultAuth = tokenProvider.getAuthentication(token);
        assertThat(resultAuth.getAuthorities()).extracting(GrantedAuthority::getAuthority)
                .containsExactly(AuthoritiesConstants.USER);
        assertThat(resultAuth.getName()).isEqualTo("testuser");
    }

    // ── T-001-3 ───────────────────────────────────────────────────────────────
    @Test
    void createToken_notAuthenticated_assignsPreVerificationUserRole() {
        // When authenticated=false (TFA pending), the role must be PRE_VERIFICATION_USER
        // regardless of the authentication object's actual authorities.
        Authentication auth = buildAuthentication("tfauser", AuthoritiesConstants.ADMIN);

        String token = tokenProvider.createToken(auth, false, false);

        assertTrue(tokenProvider.validateToken(token));
        UsernamePasswordAuthenticationToken resultAuth = tokenProvider.getAuthentication(token);
        assertThat(resultAuth.getAuthorities()).extracting(GrantedAuthority::getAuthority)
                .containsExactly(AuthoritiesConstants.PRE_VERIFICATION_USER);
    }

    // ── T-001-4 ───────────────────────────────────────────────────────────────
    @Test
    void createToken_notAuthenticated_tokenExpiresInFiveMinutes() {
        Authentication auth = buildAuthentication("tfauser", AuthoritiesConstants.ADMIN);

        long before = System.currentTimeMillis();
        String token = tokenProvider.createToken(auth, false, false);
        long after = System.currentTimeMillis();

        // TFA temp token validity is exactly TEMP_TOKEN_VALIDITY_IN_MILLIS (5 min = 300_000 ms)
        // Parse expiry via getAuthentication to avoid exposing key internals
        assertTrue(tokenProvider.validateToken(token));
        // Verify the expiry claim is within [before+300000, after+300000]
        Claims claims = Jwts.parserBuilder()
                .setSigningKey(extractKeyForTest())
                .build()
                .parseClaimsJws(token)
                .getBody();
        long expiry = claims.getExpiration().getTime();
        assertThat(expiry).isBetween(
                before + TokenProvider.TEMP_TOKEN_VALIDITY_IN_MILLIS - 1000,
                after  + TokenProvider.TEMP_TOKEN_VALIDITY_IN_MILLIS + 1000
        );
    }

    // ── T-001-5 ───────────────────────────────────────────────────────────────
    @Test
    void isAuthenticated_fullyAuthenticatedToken_returnsTrue() {
        Authentication auth = buildAuthentication("admin", AuthoritiesConstants.ADMIN);
        String token = tokenProvider.createToken(auth, false, true);

        assertTrue(tokenProvider.isAuthenticated(token));
    }

    // ── T-001-6 ───────────────────────────────────────────────────────────────
    @Test
    void isAuthenticated_tfaTempToken_returnsFalse() {
        Authentication auth = buildAuthentication("tfauser", AuthoritiesConstants.ADMIN);
        String token = tokenProvider.createToken(auth, false, false);

        assertFalse(tokenProvider.isAuthenticated(token));
    }

    // ── T-001-7 ───────────────────────────────────────────────────────────────
    @Test
    void validateToken_garbageString_returnsFalse() {
        assertFalse(tokenProvider.validateToken("not.a.jwt"));
    }

    // ── T-001-8 ───────────────────────────────────────────────────────────────
    @Test
    void validateToken_emptyString_returnsFalse() {
        assertFalse(tokenProvider.validateToken(""));
    }

    // ── T-001-9 ───────────────────────────────────────────────────────────────
    @Test
    void getUserLoginFromToken_validToken_returnsSubject() {
        Authentication auth = buildAuthentication("loginuser", AuthoritiesConstants.USER);
        String token = tokenProvider.createToken(auth, false, true);

        assertThat(tokenProvider.getUserLoginFromToken(token)).isEqualTo("loginuser");
    }

    // ── T-001-10 ──────────────────────────────────────────────────────────────
    @Test
    void createToken_rememberMe_tokenValidityIsLong() {
        Authentication auth = buildAuthentication("admin", AuthoritiesConstants.ADMIN);

        long before = System.currentTimeMillis();
        String token = tokenProvider.createToken(auth, true, true);
        long after = System.currentTimeMillis();

        assertTrue(tokenProvider.validateToken(token));
        Claims claims = Jwts.parserBuilder()
                .setSigningKey(extractKeyForTest())
                .build()
                .parseClaimsJws(token)
                .getBody();
        long expiry = claims.getExpiration().getTime();
        long expectedValidity = 2592000L * 1000L; // 30 days in ms
        assertThat(expiry).isBetween(
                before + expectedValidity - 2000,
                after  + expectedValidity + 2000
        );
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private Authentication buildAuthentication(String username, String role) {
        List<SimpleGrantedAuthority> authorities = List.of(new SimpleGrantedAuthority(role));
        return new UsernamePasswordAuthenticationToken(username, "password", authorities);
    }

    private java.security.Key extractKeyForTest() {
        return Keys.hmacShaKeyFor(Decoders.BASE64.decode(TEST_BASE64_SECRET));
    }
}
