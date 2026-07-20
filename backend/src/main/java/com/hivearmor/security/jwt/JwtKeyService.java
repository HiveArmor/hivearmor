package com.hivearmor.security.jwt;

import com.hivearmor.domain.jwt.HiveJwtConfig;
import com.hivearmor.repository.jwt.HiveJwtConfigRepository;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;

/**
 * Manages the JWT HMAC signing key: AES-256-GCM encryption at rest, DB-backed persistence.
 *
 * The encryption key (JWT_ENCRYPTION_KEY) is operator-supplied and must be a Base64-encoded
 * 32-byte value. The signing key itself is generated once and stored encrypted.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class JwtKeyService {

    private static final String AES_ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_IV_LENGTH = 12;
    private static final int GCM_TAG_LENGTH = 128;

    private final HiveJwtConfigRepository jwtConfigRepository;

    /**
     * Returns the current signing key, loading from DB or generating on first startup.
     * Caller must supply the already-validated encryptionKey bytes (32 bytes).
     */
    @Transactional
    public SecretKey resolveSigningKey(byte[] encryptionKeyBytes) {
        return jwtConfigRepository.findFirstByOrderByCreatedAtAsc()
            .map(config -> {
                byte[] keyBytes = aesDecrypt(config.getSigningKeyEncrypted(), encryptionKeyBytes);
                log.info("JWT signing key loaded from database (created {})", config.getCreatedAt());
                return Keys.hmacShaKeyFor(keyBytes);
            })
            .orElseGet(() -> {
                SecretKey newKey = Keys.secretKeyFor(io.jsonwebtoken.SignatureAlgorithm.HS512);
                persist(newKey.getEncoded(), encryptionKeyBytes, null);
                log.info("JWT signing key generated and persisted to database");
                return newKey;
            });
    }

    /**
     * Generates a brand-new signing key, replaces the DB record, returns it.
     * All previously issued tokens become invalid immediately.
     */
    @Transactional
    public SecretKey rotateSigningKey(byte[] encryptionKeyBytes) {
        SecretKey newKey = Keys.secretKeyFor(io.jsonwebtoken.SignatureAlgorithm.HS512);
        jwtConfigRepository.findFirstByOrderByCreatedAtAsc().ifPresent(jwtConfigRepository::delete);
        persist(newKey.getEncoded(), encryptionKeyBytes, Instant.now());
        log.info("JWT signing key rotated — all existing sessions invalidated");
        return newKey;
    }

    private void persist(byte[] rawKeyBytes, byte[] encryptionKeyBytes, Instant rotatedAt) {
        HiveJwtConfig config = new HiveJwtConfig();
        config.setSigningKeyEncrypted(aesEncrypt(rawKeyBytes, encryptionKeyBytes));
        config.setCreatedAt(Instant.now());
        config.setRotatedAt(rotatedAt);
        jwtConfigRepository.save(config);
    }

    String aesEncrypt(byte[] plaintext, byte[] encryptionKeyBytes) {
        try {
            byte[] iv = new byte[GCM_IV_LENGTH];
            new SecureRandom().nextBytes(iv);
            Cipher cipher = Cipher.getInstance(AES_ALGORITHM);
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(encryptionKeyBytes, "AES"),
                new GCMParameterSpec(GCM_TAG_LENGTH, iv));
            byte[] ciphertext = cipher.doFinal(plaintext);
            // Prefix IV to ciphertext so decrypt can read it back
            byte[] combined = new byte[GCM_IV_LENGTH + ciphertext.length];
            System.arraycopy(iv, 0, combined, 0, GCM_IV_LENGTH);
            System.arraycopy(ciphertext, 0, combined, GCM_IV_LENGTH, ciphertext.length);
            return Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to encrypt JWT signing key", e);
        }
    }

    byte[] aesDecrypt(String encoded, byte[] encryptionKeyBytes) {
        try {
            byte[] combined = Base64.getDecoder().decode(encoded);
            byte[] iv = new byte[GCM_IV_LENGTH];
            System.arraycopy(combined, 0, iv, 0, GCM_IV_LENGTH);
            byte[] ciphertext = new byte[combined.length - GCM_IV_LENGTH];
            System.arraycopy(combined, GCM_IV_LENGTH, ciphertext, 0, ciphertext.length);
            Cipher cipher = Cipher.getInstance(AES_ALGORITHM);
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(encryptionKeyBytes, "AES"),
                new GCMParameterSpec(GCM_TAG_LENGTH, iv));
            return cipher.doFinal(ciphertext);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to decrypt JWT signing key — check JWT_ENCRYPTION_KEY", e);
        }
    }
}
