package com.hivearmor.service.admin.api_key;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;

/**
 * Generates API key tokens of the form {@code ha_} followed by exactly 40 characters
 * drawn from the URL-safe base64 alphabet {@code [A-Za-z0-9_-]}.
 *
 * <p>The result always matches the regex {@code ^ha_[A-Za-z0-9_-]{40}$}.
 * Uses {@link java.security.SecureRandom} for cryptographically strong randomness.
 *
 * <p>Requirement: 5.2
 */
@Component
public class HaApiKeyTokenGenerator {

    private static final String ALPHABET =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

    private static final int BODY_LEN = 40;

    private final SecureRandom random = new SecureRandom();

    /**
     * Generates a new API key token.
     *
     * @return a token matching {@code ^ha_[A-Za-z0-9_-]{40}$}
     */
    public String generate() {
        StringBuilder sb = new StringBuilder(3 + BODY_LEN);
        sb.append("ha_");
        for (int i = 0; i < BODY_LEN; i++) {
            sb.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        return sb.toString(); // ^ha_[A-Za-z0-9_-]{40}$
    }
}
