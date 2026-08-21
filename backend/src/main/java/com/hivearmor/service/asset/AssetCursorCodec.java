package com.hivearmor.service.asset;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;

/** HMAC-signed keyset cursor bound to the caller, tenant scope, filters and snapshot. */
@Component
public class AssetCursorCodec {

    private final ObjectMapper objectMapper;
    private final byte[] signingKey;

    public AssetCursorCodec(ObjectMapper objectMapper,
                            @Value("${ha.pivot.signing.secret}") String signingSecret) {
        if (signingSecret == null || signingSecret.length() < 32) {
            throw new IllegalStateException("ha.pivot.signing.secret must contain at least 32 characters");
        }
        this.objectMapper = objectMapper;
        this.signingKey = signingSecret.getBytes(StandardCharsets.UTF_8);
    }

    public String encode(CursorPayload payload) {
        try {
            byte[] body = objectMapper.writeValueAsBytes(payload);
            return base64(body) + "." + base64(sign(body));
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to encode asset cursor", ex);
        }
    }

    public CursorPayload decode(String cursor, String owner, String tenantKey, String filterHash) {
        try {
            String[] parts = cursor == null ? new String[0] : cursor.split("\\.", -1);
            if (parts.length != 2) throw invalid();
            byte[] body = Base64.getUrlDecoder().decode(parts[0]);
            byte[] suppliedSignature = Base64.getUrlDecoder().decode(parts[1]);
            if (!MessageDigest.isEqual(sign(body), suppliedSignature)) throw invalid();
            CursorPayload payload = objectMapper.readValue(body, CursorPayload.class);
            if (!owner.equals(payload.owner()) || !tenantKey.equals(payload.tenantKey())
                || !filterHash.equals(payload.filterHash())) {
                throw new AssetContractException("ASSET_CURSOR_FORBIDDEN", "Cursor does not belong to the current inventory scope");
            }
            if (Instant.now().isAfter(payload.expiresAt())) {
                throw new AssetContractException("ASSET_CURSOR_EXPIRED", "Asset cursor expired; refresh the inventory");
            }
            return payload;
        } catch (AssetContractException ex) {
            throw ex;
        } catch (Exception ex) {
            throw invalid();
        }
    }

    private byte[] sign(byte[] value) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(signingKey, "HmacSHA256"));
        return mac.doFinal(value);
    }

    private static String base64(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    private static AssetContractException invalid() {
        return new AssetContractException("ASSET_CURSOR_INVALID", "Asset cursor is invalid or has been tampered with");
    }

    public record CursorPayload(
        String owner,
        String tenantKey,
        String filterHash,
        double lastRiskScore,
        long lastId,
        Instant snapshotAt,
        Instant expiresAt
    ) {}
}
