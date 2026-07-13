package com.hivearmor.security.jwt;

import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import tech.jhipster.config.JHipsterProperties;

import java.util.List;

import static com.hivearmor.security.jwt.TokenProviderTest.TEST_BASE64_SECRET;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * SEC-02 — JWT key persistence tests.
 * Verifies tokens survive a simulated restart (same key, new instance)
 * and that startup fails fast when no key is configured.
 */
class TokenProviderPersistenceTest {

    private TokenProvider buildProvider(String base64Secret) throws Exception {
        JHipsterProperties props = new JHipsterProperties();
        props.getSecurity().getAuthentication().getJwt().setBase64Secret(base64Secret);
        props.getSecurity().getAuthentication().getJwt().setTokenValidityInSeconds(86400L);
        props.getSecurity().getAuthentication().getJwt().setTokenValidityInSecondsForRememberMe(2592000L);
        TokenProvider tp = new TokenProvider(props);
        tp.afterPropertiesSet();
        return tp;
    }

    @Test
    void tokenCreatedByFirstInstance_isValidOnSecondInstanceWithSameKey() throws Exception {
        TokenProvider first = buildProvider(TEST_BASE64_SECRET);
        Authentication auth = new UsernamePasswordAuthenticationToken(
            "testuser", null, List.of(new SimpleGrantedAuthority("ROLE_USER")));

        String token = first.createToken(auth, false, true);
        assertThat(token).isNotBlank();

        // Simulate restart: new instance, same key
        TokenProvider second = buildProvider(TEST_BASE64_SECRET);
        assertThat(second.validateToken(token)).isTrue();
        assertThat(second.getUserLoginFromToken(token)).isEqualTo("testuser");
    }

    @Test
    void missingEncryptionKey_throwsIllegalStateOnStartup() {
        assertThatThrownBy(() -> buildProvider(""))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("JWT signing key is not configured");
    }
}
