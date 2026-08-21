package com.hivearmor.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * AES-256-GCM encryption service for encrypting OIDC client secrets at rest.
 *
 * <p>The 32-byte key is derived from the {@code application.encryption-key} property.
 * The value is first attempted as Base64; if decoding fails, raw UTF-8 bytes are used.
 * In either case the resolved byte array MUST be exactly 32 bytes (256 bits).
 *
 * <p>Ciphertext format: {@code Base64( IV[12] || ciphertext || GCM-tag[16] )}
 */
@Service
public class AesGcmEncryptionService {

    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int IV_LENGTH_BYTES = 12;
    private static final int GCM_TAG_LENGTH_BITS = 128;
    private static final int REQUIRED_KEY_BYTES = 32;

    private final SecretKeySpec secretKey;
    private final SecureRandom secureRandom;

    public AesGcmEncryptionService(
            @Value("${hivearmor.encryption-key:#{null}}") String encryptionKey) {

        if (encryptionKey == null || encryptionKey.isBlank()) {
            throw new IllegalStateException(
                    "application.encryption-key must not be null or blank. "
                    + "Set the ENCRYPTION_KEY environment variable to a Base64-encoded 32-byte key.");
        }

        byte[] keyBytes = resolveKeyBytes(encryptionKey);

        if (keyBytes.length != REQUIRED_KEY_BYTES) {
            throw new IllegalStateException(
                    "application.encryption-key must decode to exactly 32 bytes (256 bits), "
                    + "but the resolved key is " + keyBytes.length + " bytes. "
                    + "Set HIVEARMOR_ENCRYPTION_KEY to Base64 of 32 random bytes "
                    + "(openssl rand -base64 32 | tr -d '\\n'). "
                    + "Do not reuse the 64-byte JWT ENCRYPTION_KEY.");
        }

        this.secretKey = new SecretKeySpec(keyBytes, "AES");
        this.secureRandom = new SecureRandom();
    }

    /**
     * Encrypts {@code plaintext} using AES-256-GCM.
     *
     * @param plaintext the value to encrypt; must not be null
     * @return Base64-encoded string containing IV (12 bytes) || ciphertext || GCM tag (16 bytes)
     */
    public String encrypt(String plaintext) {
        try {
            byte[] iv = new byte[IV_LENGTH_BYTES];
            secureRandom.nextBytes(iv);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv));

            byte[] ciphertextWithTag = cipher.doFinal(plaintext.getBytes(java.nio.charset.StandardCharsets.UTF_8));

            // Concatenate: iv || ciphertext+tag
            byte[] combined = new byte[IV_LENGTH_BYTES + ciphertextWithTag.length];
            System.arraycopy(iv, 0, combined, 0, IV_LENGTH_BYTES);
            System.arraycopy(ciphertextWithTag, 0, combined, IV_LENGTH_BYTES, ciphertextWithTag.length);

            return Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            throw new IllegalStateException("AES-GCM encryption failed", e);
        }
    }

    /**
     * Decrypts a Base64-encoded ciphertext produced by {@link #encrypt(String)}.
     *
     * @param ciphertextBase64 Base64-encoded IV || ciphertext || GCM tag
     * @return the original plaintext
     */
    public String decrypt(String ciphertextBase64) {
        try {
            byte[] combined = Base64.getDecoder().decode(ciphertextBase64);

            byte[] iv = new byte[IV_LENGTH_BYTES];
            System.arraycopy(combined, 0, iv, 0, IV_LENGTH_BYTES);

            int ciphertextLength = combined.length - IV_LENGTH_BYTES;
            byte[] ciphertextWithTag = new byte[ciphertextLength];
            System.arraycopy(combined, IV_LENGTH_BYTES, ciphertextWithTag, 0, ciphertextLength);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.DECRYPT_MODE, secretKey, new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv));

            byte[] plaintext = cipher.doFinal(ciphertextWithTag);
            return new String(plaintext, java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("AES-GCM decryption failed", e);
        }
    }

    /**
     * Resolves the raw key bytes from the configuration string.
     * Tries Base64 decoding first; falls back to raw UTF-8 bytes if decoding fails.
     */
    private static byte[] resolveKeyBytes(String encryptionKey) {
        try {
            return Base64.getDecoder().decode(encryptionKey.trim());
        } catch (IllegalArgumentException e) {
            // Not valid Base64 — treat the string as raw UTF-8 bytes
            return encryptionKey.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        }
    }
}
