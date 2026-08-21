package com.hivearmor.security;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * HiveArmor PKCE utility — pure static helpers, no Spring dependency.
 *
 * <p>Implements Proof Key for Code Exchange (RFC 7636) helpers:
 * <ul>
 *   <li>{@link #generateCodeVerifier()} — 64 SecureRandom bytes encoded as URL-safe Base64
 *       without padding (yields 86 characters, well above the 43-char RFC 7636 minimum).</li>
 *   <li>{@link #generateCodeChallenge(String)} — S256 method:
 *       {@code BASE64URL(SHA-256(ASCII(code_verifier)))} with no padding.</li>
 *   <li>{@link #generateState()} — 24 SecureRandom bytes encoded as URL-safe Base64 without
 *       padding, used as the OAuth2 {@code state} parameter.</li>
 * </ul>
 */
public final class PkceUtil {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final Base64.Encoder URL_ENCODER = Base64.getUrlEncoder().withoutPadding();

    /** Utility class — no instances. */
    private PkceUtil() {
        throw new UnsupportedOperationException("PkceUtil is a utility class");
    }

    /**
     * Generates a PKCE {@code code_verifier}.
     *
     * <p>64 cryptographically random bytes encoded as URL-safe Base64 without padding,
     * producing an 86-character string. RFC 7636 requires at least 43 characters and
     * allows up to 128 characters, so 86 is well within the valid range.
     *
     * @return a URL-safe Base64 string without padding of at least 43 characters
     */
    public static String generateCodeVerifier() {
        byte[] bytes = new byte[64];
        SECURE_RANDOM.nextBytes(bytes);
        return URL_ENCODER.encodeToString(bytes);
    }

    /**
     * Derives a PKCE {@code code_challenge} from a {@code code_verifier} using the S256 method.
     *
     * <p>Computes {@code BASE64URL(SHA-256(ASCII(codeVerifier)))} with no padding per RFC 7636
     * §4.2.
     *
     * @param codeVerifier the previously generated code verifier; must not be null
     * @return a URL-safe Base64 string without padding representing the SHA-256 hash
     * @throws IllegalArgumentException if {@code codeVerifier} is null
     * @throws RuntimeException         if the SHA-256 algorithm is unavailable (should never
     *                                  happen on a standard JVM)
     */
    public static String generateCodeChallenge(String codeVerifier) {
        if (codeVerifier == null) {
            throw new IllegalArgumentException("codeVerifier must not be null");
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(codeVerifier.getBytes(java.nio.charset.StandardCharsets.US_ASCII));
            return URL_ENCODER.encodeToString(hash);
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is mandated by the Java SE specification — this path is unreachable.
            throw new RuntimeException("SHA-256 algorithm not available", e);
        }
    }

    /**
     * Generates a cryptographically random OAuth2 {@code state} parameter.
     *
     * <p>24 random bytes encoded as URL-safe Base64 without padding, producing a 32-character
     * string with 192 bits of entropy.
     *
     * @return a URL-safe Base64 string without padding
     */
    public static String generateState() {
        byte[] bytes = new byte[24];
        SECURE_RANDOM.nextBytes(bytes);
        return URL_ENCODER.encodeToString(bytes);
    }
}
