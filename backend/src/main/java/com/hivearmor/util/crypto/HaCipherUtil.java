package com.hivearmor.util.crypto;

import com.hivearmor.config.Constants;
import com.hivearmor.util.CipherUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Spring-managed façade over {@link CipherUtil} that resolves the encryption key
 * from the {@code ENCRYPTION_KEY} environment variable at call-time.
 *
 * <p>Using a Spring {@code @Component} rather than calling {@code CipherUtil}
 * directly means callers do not need to know how to obtain the key: inject
 * {@code HaCipherUtil} and call {@link #encrypt(String)} / {@link #decrypt(String)}.
 *
 * <p><strong>Secret hygiene:</strong> the encryption key is read from the
 * environment on every call and is never stored as a field. No value that passes
 * through this class is written to any log statement (Req 3.5).
 */
@Component
public class HaCipherUtil {

    private static final Logger log = LoggerFactory.getLogger(HaCipherUtil.class);

    /**
     * Encrypts {@code plaintext} using AES/CBC/PKCS5Padding via the master key.
     *
     * @param plaintext the plaintext value to encrypt; must not be {@code null}
     * @return Base64-encoded ciphertext
     * @throws RuntimeException if encryption fails (wraps the underlying exception)
     */
    public String encrypt(String plaintext) {
        if (plaintext == null) {
            throw new IllegalArgumentException("HaCipherUtil.encrypt: plaintext must not be null");
        }
        return CipherUtil.encrypt(plaintext, resolveKey());
    }

    /**
     * Decrypts a Base64-encoded ciphertext previously produced by {@link #encrypt}.
     *
     * @param ciphertext the ciphertext to decrypt; must not be {@code null}
     * @return plaintext value
     * @throws RuntimeException if decryption fails (wraps the underlying exception)
     */
    public String decrypt(String ciphertext) {
        if (ciphertext == null) {
            throw new IllegalArgumentException("HaCipherUtil.decrypt: ciphertext must not be null");
        }
        return CipherUtil.decrypt(ciphertext, resolveKey());
    }

    /**
     * Returns whether {@code candidate} decrypts without error. Useful for
     * round-trip tests without exposing the key to callers.
     *
     * @param ciphertext a value that may or may not be valid ciphertext
     * @return {@code true} if the value can be successfully decrypted
     */
    public boolean isDecryptable(String ciphertext) {
        if (ciphertext == null || ciphertext.isBlank()) {
            return false;
        }
        try {
            CipherUtil.decrypt(ciphertext, resolveKey());
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    // -------------------------------------------------------------------------
    // Internals
    // -------------------------------------------------------------------------

    /**
     * Resolves the master encryption key from the environment at call-time.
     * Never stored as a field to minimise the window in which the key is in memory.
     */
    private String resolveKey() {
        String key = System.getenv(Constants.ENV_ENCRYPTION_KEY);
        if (key == null || key.isBlank()) {
            log.warn("HaCipherUtil: ENCRYPTION_KEY environment variable is not set — encryption operations will fail");
        }
        return key;
    }
}
