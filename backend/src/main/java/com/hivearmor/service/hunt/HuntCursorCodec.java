package com.hivearmor.service.hunt;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.List;

/** Signs opaque search-after cursors and binds them to a hunt session and principal. */
@Component
public class HuntCursorCodec {

    private static final String HMAC_ALGORITHM = "HmacSHA256";
    private final ObjectMapper objectMapper;
    private final byte[] secret;

    public HuntCursorCodec(ObjectMapper objectMapper, @Value("${ha.pivot.signing.secret}") String signingSecret) {
        this.objectMapper = objectMapper;
        if (signingSecret == null || signingSecret.length() < 32) {
            throw new IllegalStateException("ha.pivot.signing.secret must contain at least 32 characters");
        }
        this.secret = signingSecret.getBytes(StandardCharsets.UTF_8);
    }

    public String encode(String searchId, String owner, String tenantKey, Instant expiresAt, List<String> sortValues) {
        try {
            CursorPayload payload = new CursorPayload(searchId, owner, tenantKey, expiresAt.getEpochSecond(), List.copyOf(sortValues));
            String body = Base64.getUrlEncoder().withoutPadding().encodeToString(objectMapper.writeValueAsBytes(payload));
            String signature = Base64.getUrlEncoder().withoutPadding().encodeToString(sign(body));
            return body + "." + signature;
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to create hunt cursor", ex);
        }
    }

    public CursorPayload decode(String cursor, String owner, String tenantKey) {
        try {
            String[] parts = cursor == null ? new String[0] : cursor.split("\\.", -1);
            if (parts.length != 2) throw invalid();
            byte[] supplied = Base64.getUrlDecoder().decode(parts[1]);
            if (!MessageDigest.isEqual(sign(parts[0]), supplied)) throw invalid();
            CursorPayload payload = objectMapper.readValue(Base64.getUrlDecoder().decode(parts[0]), CursorPayload.class);
            if (!MessageDigest.isEqual(payload.owner().getBytes(StandardCharsets.UTF_8), owner.getBytes(StandardCharsets.UTF_8))
                || !MessageDigest.isEqual(payload.tenantKey().getBytes(StandardCharsets.UTF_8), tenantKey.getBytes(StandardCharsets.UTF_8))) {
                throw new HuntQueryException("HUNT_CURSOR_FORBIDDEN", "Cursor does not belong to the current security scope", 0);
            }
            if (Instant.now().getEpochSecond() >= payload.expiresAtEpochSecond()) {
                throw new HuntQueryException("HUNT_CURSOR_EXPIRED", "Cursor has expired; rerun the hunt", 0);
            }
            if (payload.sortValues() == null || payload.sortValues().isEmpty()) throw invalid();
            return payload;
        } catch (HuntQueryException ex) {
            throw ex;
        } catch (Exception ex) {
            throw invalid();
        }
    }

    private byte[] sign(String body) throws Exception {
        Mac mac = Mac.getInstance(HMAC_ALGORITHM);
        mac.init(new SecretKeySpec(secret, HMAC_ALGORITHM));
        return mac.doFinal(body.getBytes(StandardCharsets.UTF_8));
    }

    private static HuntQueryException invalid() {
        return new HuntQueryException("HUNT_CURSOR_INVALID", "Cursor is invalid or has been tampered with", 0);
    }

    public record CursorPayload(
        String searchId,
        String owner,
        String tenantKey,
        long expiresAtEpochSecond,
        List<String> sortValues
    ) {}
}
