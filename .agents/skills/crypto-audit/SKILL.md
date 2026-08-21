---
name: crypto-audit
description: Cryptography implementation audit — AES-GCM/ChaCha20/Ed25519/Argon2id selection, IV/nonce handling, KDF parameters (PBKDF2 ≥600k iterations), JWT alg:none, TLS 1.3, constant-time comparison. Triggered by "crypto audit", "cryptography review", "is this encryption secure", "password hashing", "JWT security".
---

# Cryptography Implementation Audit

## Core Philosophy

"Most crypto failures are not 'they used MD5.' Most failures are: right primitive, wrong mode."

Custom schemes get an automatic finding — fewer than 50 people globally can safely design new cryptography. Use **libsodium**, **Tink**, or **WebCrypto** instead.

## Algorithm Selection

| Use Case | Recommended | Reject |
|----------|------------|--------|
| Symmetric encryption | AES-256-GCM, ChaCha20-Poly1305 | AES-ECB, DES, RC4 |
| Signatures | Ed25519, ECDSA P-256 | RSA-PKCS1v1.5 (for encryption) |
| Key agreement | X25519, ECDH P-256 | RSA-OAEP only at ≥2048-bit |
| Password hashing | Argon2id, bcrypt (≥12), scrypt | MD5, SHA1, unsalted SHA256 |
| Key derivation | HKDF-SHA256 | Direct key reuse |

**Java gotcha:** `Cipher.getInstance("AES")` defaults silently to ECB mode. Always specify: `Cipher.getInstance("AES/GCM/NoPadding")`

## IV/Nonce Handling

```java
// ❌ Hardcoded nonce — catastrophic if key is reused
byte[] iv = new byte[12];  // all zeros

// ❌ Counter nonce — dangerous if counter overflows or resets
private long nonceCounter = 0;
byte[] iv = longToBytes(nonceCounter++);

// ✅ Random nonce — safe for GCM (96-bit)
byte[] iv = new byte[12];
SecureRandom.getInstanceStrong().nextBytes(iv);
```

"If you reuse a GCM nonce with the same key, you give the attacker the XOR of two plaintexts."

## KDF Parameters (OWASP 2024)

| Algorithm | Minimum Parameters |
|-----------|-------------------|
| PBKDF2-SHA256 | ≥600,000 iterations |
| bcrypt | cost ≥ 12 |
| Argon2id | m=19456 (19 MiB), t=2, p=1 |
| scrypt | N=32768, r=8, p=1 |

```java
// ✅ Argon2id in Spring Security
@Bean
public PasswordEncoder passwordEncoder() {
    return new Argon2PasswordEncoder(
        16,   // salt length (bytes)
        32,   // hash length (bytes)
        1,    // parallelism
        19456, // memory (KB)
        2     // iterations
    );
}
```

## JWT Security

```java
// ❌ Accepts alg:none — critical vulnerability
JwtParser parser = Jwts.parser().setSigningKey(key).build();

// ✅ Explicitly allowlist algorithms
JwtParser parser = Jwts.parser()
    .verifyWith(key)
    .build();
// JjWT 0.12+ rejects none by default

// ❌ Non-constant-time comparison — timing attack
if (token.equals(expectedToken)) { ... }

// ✅ Constant-time comparison
if (MessageDigest.isEqual(
    token.getBytes(StandardCharsets.UTF_8),
    expectedToken.getBytes(StandardCharsets.UTF_8))) { ... }
```

HiveArmor known issue SEC-02: JWT key is ephemeral, regenerated on every restart. See DEBT-14.

## TLS Configuration

```yaml
# ✅ TLS 1.3 preferred, 1.2 minimum
server:
  ssl:
    enabled: true
    protocol: TLS
    enabled-protocols: TLSv1.3,TLSv1.2
    ciphers: >-
      TLS_AES_256_GCM_SHA384,
      TLS_CHACHA20_POLY1305_SHA256,
      TLS_AES_128_GCM_SHA256
```

HiveArmor known issue SEC-04: `InsecureTrustManagerFactory` used in gRPC connections. Never replicate in new code.

## Randomness

```java
// ❌ Math.random() — not cryptographically secure
UUID.randomUUID() is safe — uses SecureRandom internally

// ❌ Regular Random for tokens
new Random().nextInt(1000000)

// ✅ Cryptographically secure
SecureRandom random = SecureRandom.getInstanceStrong();
byte[] tokenBytes = new byte[32];
random.nextBytes(tokenBytes);
String token = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
```

## Audit Checklist

- [ ] No custom crypto schemes (use established libraries)
- [ ] AES always uses GCM mode (never ECB, CBC without MAC)
- [ ] IV/nonce is random, never hardcoded or counter-based
- [ ] Password hashing uses Argon2id or bcrypt ≥12
- [ ] PBKDF2 iterations ≥ 600,000 (OWASP 2024)
- [ ] JWT explicitly rejects `alg:none`
- [ ] Token comparisons use constant-time functions
- [ ] TLS 1.2 minimum, 1.3 preferred
- [ ] `SecureRandom.getInstanceStrong()` for security-sensitive randomness
- [ ] No `InsecureTrustManagerFactory` or `InsecureSkipVerify` in new code
