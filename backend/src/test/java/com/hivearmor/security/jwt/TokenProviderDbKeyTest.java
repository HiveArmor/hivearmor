package com.hivearmor.security.jwt;

import com.hivearmor.domain.jwt.HiveJwtConfig;
import com.hivearmor.repository.jwt.HiveJwtConfigRepository;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import tech.jhipster.config.JHipsterProperties;

import javax.crypto.SecretKey;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * SEC-02 — DB-backed JWT key path.
 * Verifies TokenProvider uses JwtKeyService when ENCRYPTION_KEY is present.
 */
@ExtendWith(MockitoExtension.class)
class TokenProviderDbKeyTest {

    // 32 random bytes → Base64 (valid AES-256 wrap key)
    private static final String WRAP_KEY_B64 = Base64.getEncoder().encodeToString(new byte[32]);

    @Mock
    private HiveJwtConfigRepository jwtConfigRepository;

    private JwtKeyService jwtKeyService;

    @BeforeEach
    void setUp() {
        jwtKeyService = new JwtKeyService(jwtConfigRepository);
    }

    /** Subclass that injects the encryption key env value without needing System.getenv. */
    private TokenProvider buildProvider(String encryptionKeyEnv) throws Exception {
        JHipsterProperties props = buildProps();
        TokenProvider provider = new TokenProvider(props) {
            @Override
            String getEncryptionKeyEnv() {
                return encryptionKeyEnv;
            }
        };
        provider.jwtKeyService = jwtKeyService;
        provider.afterPropertiesSet();
        return provider;
    }

    @Test
    void afterPropertiesSet_withEncryptionKeyAndNoDbRecord_generatesAndPersistsKey() throws Exception {
        when(jwtConfigRepository.findFirstByOrderByCreatedAtAsc()).thenReturn(Optional.empty());
        when(jwtConfigRepository.save(any(HiveJwtConfig.class))).thenAnswer(inv -> inv.getArgument(0));

        TokenProvider provider = buildProvider(WRAP_KEY_B64);

        verify(jwtConfigRepository).save(any(HiveJwtConfig.class));
        Authentication auth = buildAuth("user");
        String token = provider.createToken(auth, false, true);
        assertThat(provider.validateToken(token)).isTrue();
    }

    @Test
    void afterPropertiesSet_withExistingDbRecord_loadsPersistedKeyAndTokenSurvivesRestart() throws Exception {
        // Pre-encrypt a signing key to simulate existing DB row
        SecretKey signingKey = Keys.secretKeyFor(io.jsonwebtoken.SignatureAlgorithm.HS512);
        byte[] wrapBytes = Base64.getDecoder().decode(WRAP_KEY_B64);
        String encrypted = jwtKeyService.aesEncrypt(signingKey.getEncoded(), wrapBytes);

        HiveJwtConfig dbRow = new HiveJwtConfig();
        dbRow.setSigningKeyEncrypted(encrypted);
        dbRow.setCreatedAt(Instant.now());
        when(jwtConfigRepository.findFirstByOrderByCreatedAtAsc()).thenReturn(Optional.of(dbRow));

        // First instance issues a token
        TokenProvider first = buildProvider(WRAP_KEY_B64);
        String token = first.createToken(buildAuth("alice"), false, true);
        assertThat(token).isNotBlank();

        // Second instance (simulated restart) loads same DB row — token must still be valid
        TokenProvider second = buildProvider(WRAP_KEY_B64);
        assertThat(second.validateToken(token)).isTrue();
        assertThat(second.getUserLoginFromToken(token)).isEqualTo("alice");
    }

    @Test
    void afterPropertiesSet_withKeyTooShort_throwsIllegalState() {
        String shortKey = Base64.getEncoder().encodeToString(new byte[16]); // only 16 bytes
        // key-length check runs before any DB lookup, so no need to stub the repository
        assertThatThrownBy(() -> buildProvider(shortKey))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("32 bytes");
    }

    @Test
    void afterPropertiesSet_withNoEncryptionKeyEnv_fallsBackToBase64Secret() throws Exception {
        // jwtKeyService is wired but env key is absent — must fall back to config key
        TokenProvider provider = buildProvider(null);
        Authentication auth = buildAuth("fallbackuser");
        String token = provider.createToken(auth, false, true);
        assertThat(provider.validateToken(token)).isTrue();
    }

    @Test
    void rotateKey_withEncryptionKeyAndDbService_persistsRotatedKey() throws Exception {
        when(jwtConfigRepository.findFirstByOrderByCreatedAtAsc()).thenReturn(Optional.empty());
        when(jwtConfigRepository.save(any(HiveJwtConfig.class))).thenAnswer(inv -> inv.getArgument(0));
        doNothing().when(jwtConfigRepository).delete(any(HiveJwtConfig.class));

        TokenProvider provider = buildProvider(WRAP_KEY_B64);

        // Issue token before rotate
        String tokenBefore = provider.createToken(buildAuth("bob"), false, true);

        // Rotate — new DB row will be persisted; old one returned from findFirst then deleted
        HiveJwtConfig oldRow = new HiveJwtConfig();
        SecretKey oldKey = Keys.secretKeyFor(io.jsonwebtoken.SignatureAlgorithm.HS512);
        oldRow.setSigningKeyEncrypted(jwtKeyService.aesEncrypt(oldKey.getEncoded(),
            Base64.getDecoder().decode(WRAP_KEY_B64)));
        oldRow.setCreatedAt(Instant.now());
        when(jwtConfigRepository.findFirstByOrderByCreatedAtAsc()).thenReturn(Optional.of(oldRow));

        provider.rotateKey();

        // After rotate the old token is no longer valid (key changed)
        assertThat(provider.validateToken(tokenBefore)).isFalse();
    }

    private Authentication buildAuth(String username) {
        return new UsernamePasswordAuthenticationToken(
            username, null, List.of(new SimpleGrantedAuthority("ROLE_USER")));
    }

    private JHipsterProperties buildProps() {
        JHipsterProperties props = new JHipsterProperties();
        props.getSecurity().getAuthentication().getJwt().setBase64Secret(
            "ZjY4MDYwNWU0ZTQ3MGFkMjJiY2IzYjMyNzAyMGE5NzMxMjdhY2JhMmQ5MDg5MzVjMmJhMTZlY2I5ZjE0NDZiNg==");
        props.getSecurity().getAuthentication().getJwt().setTokenValidityInSeconds(86400L);
        props.getSecurity().getAuthentication().getJwt().setTokenValidityInSecondsForRememberMe(2592000L);
        return props;
    }
}
