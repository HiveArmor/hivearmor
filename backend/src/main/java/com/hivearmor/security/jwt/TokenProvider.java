package com.hivearmor.security.jwt;


import com.hivearmor.config.Constants;
import com.hivearmor.security.AuthoritiesConstants;
import io.jsonwebtoken.*;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import tech.jhipster.config.JHipsterProperties;

import jakarta.servlet.http.HttpServletRequest;
import javax.crypto.SecretKey;
import java.security.Key;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.Collection;
import java.util.Date;
import java.util.Base64;
import java.util.Optional;
import java.util.stream.Collectors;

@Component
public class TokenProvider implements InitializingBean {

    private static final String CLASSNAME = "TokenProvider";
    private final Logger log = LoggerFactory.getLogger(TokenProvider.class);

    @Value("${spring.profiles.active:prod}")
    private String activeProfile;

    private static final String AUTHORITIES_KEY = "auth";
    private static final String AUTHENTICATED = "authenticated";
    public static final long TEMP_TOKEN_VALIDITY_IN_MILLIS = 300000;
    /** HS512 requires a signing key of at least 512 bits (64 bytes). */
    static final int HS512_MIN_KEY_BYTES = 64;

    private Key key;
    private JwtParser jwtParser;
    private final long tokenValidityInMilliseconds;
    private final long tokenValidityInMillisecondsForRememberMe;
    private final String base64JwtSecret;

    /** Optional during narrow unit tests; wired by Spring in production. */
    @Autowired(required = false)
    JwtKeyService jwtKeyService;

    public TokenProvider(JHipsterProperties jHipsterProperties) {
        this.base64JwtSecret = jHipsterProperties.getSecurity().getAuthentication().getJwt().getBase64Secret();
        this.tokenValidityInMilliseconds =
            1000 * jHipsterProperties.getSecurity().getAuthentication().getJwt().getTokenValidityInSeconds();
        this.tokenValidityInMillisecondsForRememberMe =
            1000 * jHipsterProperties.getSecurity().getAuthentication().getJwt()
                .getTokenValidityInSecondsForRememberMe();
    }

    /**
     * Returns the ENCRYPTION_KEY environment variable value.
     * Package-private so {@code TokenProviderDbKeyTest} can override it in a test subclass.
     */
    String getEncryptionKeyEnv() {
        return System.getenv("JWT_ENCRYPTION_KEY");
    }

    @Override
    public void afterPropertiesSet() {
        String encryptionKey = getEncryptionKeyEnv();
        if (StringUtils.hasText(encryptionKey)) {
            byte[] wrappingKey;
            try {
                wrappingKey = Base64.getDecoder().decode(encryptionKey);
            } catch (IllegalArgumentException e) {
                throw new IllegalStateException("JWT_ENCRYPTION_KEY must be valid Base64", e);
            }
            if (wrappingKey.length != 32) {
                throw new IllegalStateException("JWT_ENCRYPTION_KEY must decode to exactly 32 bytes");
            }
            if (jwtKeyService == null) {
                throw new IllegalStateException("JWT database key service is unavailable");
            }
            this.key = jwtKeyService.resolveSigningKey(wrappingKey);
            this.jwtParser = Jwts.parserBuilder().setSigningKey(key).build();
            log.info("JWT signing key resolved from encrypted database storage");
            warnWhenTfaDisabled();
            return;
        }

        if (!StringUtils.hasText(base64JwtSecret)) {
            throw new IllegalStateException(
                "JWT signing key is not configured. " +
                "Set ENCRYPTION_KEY environment variable or " +
                "jhipster.security.authentication.jwt.base64-secret in application.yml. " +
                "Generate a key with: openssl rand -base64 64"
            );
        }
        byte[] keyBytes;
        try {
            keyBytes = Decoders.BASE64.decode(base64JwtSecret);
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException(
                "ENCRYPTION_KEY is not valid Base64. " +
                "The key must be a Base64-encoded string (not hex). " +
                "Generate a new key with: openssl rand -base64 64 | tr -d '\\n'", e
            );
        }
        int configuredLength = keyBytes.length;
        keyBytes = hmacSha512KeyMaterial(keyBytes);
        if (configuredLength < HS512_MIN_KEY_BYTES) {
            log.warn(
                "JWT signing key decoded to {} bytes; expanded to {} bytes with SHA-512 for HS512. " +
                    "Generate a 64-byte key with: openssl rand -base64 64 | tr -d '\\n'",
                configuredLength,
                keyBytes.length
            );
        }
        this.key = Keys.hmacShaKeyFor(keyBytes);
        this.jwtParser = Jwts.parserBuilder().setSigningKey(key).build();
        log.info("JWT signing key loaded from configuration (length: {} bytes)", keyBytes.length);

        warnWhenTfaDisabled();
    }

    /**
     * JJWT {@code signWith(..., HS512)} rejects keys shorter than 64 bytes.
     * Existing deployments sometimes set ENCRYPTION_KEY to 32 or 48 decoded bytes.
     * Those values are stretched with SHA-512 (exactly 64 bytes) so login does not 500.
     * Keys that are already ≥64 bytes are used as-is.
     */
    static byte[] hmacSha512KeyMaterial(byte[] keyBytes) {
        if (keyBytes == null || keyBytes.length == 0) {
            throw new IllegalStateException("JWT signing key must not be empty");
        }
        if (keyBytes.length >= HS512_MIN_KEY_BYTES) {
            return keyBytes;
        }
        try {
            return MessageDigest.getInstance("SHA-512").digest(keyBytes);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-512 is required to expand a short JWT signing key", e);
        }
    }

    private void warnWhenTfaDisabled() {
        boolean tfaEnabled = Boolean.parseBoolean(
            Optional.ofNullable(System.getenv(Constants.ENV_TFA_ENABLE)).orElse("true")
        );
        if (!tfaEnabled && !activeProfile.contains("dev") && !activeProfile.contains("test")) {
            log.warn("===========================================================");
            log.warn("SECURITY WARNING: TFA is DISABLED (APP_TFA_ENABLED=false).");
            log.warn("This disables multi-factor authentication for ALL users.");
            log.warn("Set APP_TFA_ENABLED=true for production deployments.");
            log.warn("===========================================================");
        }
    }

    /**
     * @param authentication
     * @param rememberMe
     * @param authenticated
     * @return
     */
    public String createToken(Authentication authentication, boolean rememberMe, boolean authenticated) {
        final String ctx = CLASSNAME + ".createToken";

        try {
            String authorities = !authenticated ? AuthoritiesConstants.PRE_VERIFICATION_USER : authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority).collect(Collectors.joining(","));

            long now = (new Date()).getTime();
            Date validity;

            if (!authenticated) {
                validity = new Date(now + TEMP_TOKEN_VALIDITY_IN_MILLIS);
            } else {
                if (rememberMe) {
                    validity = new Date(now + this.tokenValidityInMillisecondsForRememberMe);
                } else {
                    validity = new Date(now + this.tokenValidityInMilliseconds);
                }
            }
            return Jwts.builder().setSubject(authentication.getName()).claim(AUTHORITIES_KEY, authorities)
                .claim(AUTHENTICATED, authenticated).signWith(key, SignatureAlgorithm.HS512).setExpiration(validity)
                .compact();
        } catch (Exception e) {
            throw new RuntimeException(ctx + ": " + e.getMessage());
        }
    }

    /**
     * @param token
     * @return
     */
    public UsernamePasswordAuthenticationToken getAuthentication(String token) {
        Claims claims = jwtParser.parseClaimsJws(token).getBody();
        Collection<? extends GrantedAuthority> authorities = Arrays
            .stream(claims.get(AUTHORITIES_KEY).toString().split(","))
            .filter(auth -> !auth.trim().isEmpty())
            .map(SimpleGrantedAuthority::new)
            .collect(Collectors.toList());
        User principal = new User(claims.getSubject(), "", authorities);
        return new UsernamePasswordAuthenticationToken(principal, token, authorities);
    }

    public Boolean isAuthenticated(String token) {
        Claims claims = jwtParser.parseClaimsJws(token).getBody();
        return claims.get(AUTHENTICATED, Boolean.class);
    }

    public String getUserLoginFromToken(String token) {
        Claims claims = jwtParser.parseClaimsJws(token).getBody();
        return claims.getSubject();
    }

    /**
     * Returns the optional tenant identifier from a cryptographically verified JWT.
     * Older tokens do not carry this claim and therefore return an empty value.
     */
    public Optional<Long> getClientIdFromToken(String token) {
        Claims claims = jwtParser.parseClaimsJws(token).getBody();
        Object value = claims.get("clientId");
        if (value instanceof Number number) {
            return Optional.of(number.longValue());
        }
        if (value instanceof String text) {
            try {
                return Optional.of(Long.parseLong(text));
            } catch (NumberFormatException ignored) {
                return Optional.empty();
            }
        }
        return Optional.empty();
    }

    public boolean validateToken(String authToken) {
        try {
            jwtParser.parseClaimsJws(authToken);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            log.info("Invalid JWT token.");
            log.trace("Invalid JWT token trace.", e);
        }
        return false;
    }

    public boolean shouldBypassTfa(HttpServletRequest request) {
        return shouldBypassTfa(System.getenv(Constants.ENV_TFA_ENABLE));
    }

    boolean shouldBypassTfa(String envValue) {
        boolean tfaEnabled = Boolean.parseBoolean(Optional.ofNullable(envValue).orElse("true"));
        return !tfaEnabled;
    }

    public void rotateKey() {
        String encryptionKey = getEncryptionKeyEnv();
        if (StringUtils.hasText(encryptionKey) && jwtKeyService != null) {
            byte[] wrappingKey;
            try {
                wrappingKey = Base64.getDecoder().decode(encryptionKey);
            } catch (IllegalArgumentException e) {
                throw new IllegalStateException("JWT_ENCRYPTION_KEY must be valid Base64", e);
            }
            if (wrappingKey.length != 32) {
                throw new IllegalStateException("JWT_ENCRYPTION_KEY must decode to exactly 32 bytes");
            }
            SecretKey rotatedKey = jwtKeyService.rotateSigningKey(wrappingKey);
            this.key = rotatedKey;
        } else {
            byte[] newKeyBytes = new byte[64];
            new java.security.SecureRandom().nextBytes(newKeyBytes);
            this.key = Keys.hmacShaKeyFor(newKeyBytes);
        }
        this.jwtParser = Jwts.parserBuilder().setSigningKey(this.key).build();
        log.info("JWT signing key rotated — all existing sessions are now invalid");
    }

}
