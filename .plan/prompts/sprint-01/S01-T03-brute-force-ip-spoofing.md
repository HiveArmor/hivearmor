# S01-T03 — Fix Brute-Force Bypass via X-Forwarded-For Spoofing

**Sprint:** 1 (Security-Critical)  
**Severity:** CRITICAL  
**Issue ID:** SEC-NEW-01  
**Dependencies:** None (but S01-T04 depends on this)  
**Estimated time:** 3 hours

---

## Context

`LoginAttemptService` implements a rate limiter that blocks an IP after 10 failed login attempts. However, it trusts the `X-Forwarded-For` header unconditionally. An attacker can rotate this header to bypass the limit entirely, enabling unlimited password and TFA brute-force attempts.

**Vulnerable file:**
`backend/src/main/java/com/nilachakra/service/login_attempts/LoginAttemptService.java`

**Vulnerable code (~line 68-73):**
```java
String xfHeader = request.getHeader("X-Forwarded-For");
if (StringUtils.hasText(xfHeader))
    return xfHeader.split(",")[0];  // Trusts attacker-controlled value
return request.getRemoteAddr();
```

---

## What to Read First

1. `backend/src/main/java/com/nilachakra/service/login_attempts/LoginAttemptService.java` — entire file
2. `backend/src/main/java/com/nilachakra/web/rest/UserJWTController.java` — how login calls the service
3. `backend/src/main/resources/config/application.yml` — existing config structure
4. `backend/src/main/resources/config/application-prod.yml` — production config

---

## Implementation Steps

### Step 1: Add trusted-proxy configuration

In `application.yml`:
```yaml
app:
  security:
    trusted-proxy-cidrs: []  # Empty = never trust X-Forwarded-For
```

In `application-prod.yml`:
```yaml
app:
  security:
    trusted-proxy-cidrs: ${TRUSTED_PROXY_CIDRS:}  # e.g., "10.0.0.0/8,172.16.0.0/12"
```

Add to `AppProperties.java` (created in S01-T02):
```java
private SecurityProperties security = new SecurityProperties();

public SecurityProperties getSecurity() { return security; }
public void setSecurity(SecurityProperties security) { this.security = security; }

public static class SecurityProperties {
    private List<String> trustedProxyCidrs = List.of();
    
    public List<String> getTrustedProxyCidrs() { return trustedProxyCidrs; }
    public void setTrustedProxyCidrs(List<String> cidrs) { this.trustedProxyCidrs = cidrs; }
}
```

### Step 2: Create `TrustedProxyResolver.java`

Create: `backend/src/main/java/com/nilachakra/security/TrustedProxyResolver.java`

```java
package com.nilachakra.security;

import com.nilachakra.config.AppProperties;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import java.net.InetAddress;
import java.net.UnknownHostException;

@Component
@RequiredArgsConstructor
public class TrustedProxyResolver {

    private final AppProperties appProperties;

    public String resolveClientIp(HttpServletRequest request) {
        String remoteAddr = request.getRemoteAddr();
        
        List<String> trustedCidrs = appProperties.getSecurity().getTrustedProxyCidrs();
        if (trustedCidrs.isEmpty()) {
            // No trusted proxies configured: always use direct connection IP
            return remoteAddr;
        }
        
        if (!isInTrustedCidr(remoteAddr, trustedCidrs)) {
            // Request didn't come from a trusted proxy
            return remoteAddr;
        }
        
        // Only trust X-Forwarded-For when the immediate connection is from a trusted proxy
        String xfHeader = request.getHeader("X-Forwarded-For");
        if (StringUtils.hasText(xfHeader)) {
            return xfHeader.split(",")[0].trim();
        }
        return remoteAddr;
    }

    private boolean isInTrustedCidr(String ipAddress, List<String> cidrs) {
        try {
            InetAddress addr = InetAddress.getByName(ipAddress);
            for (String cidr : cidrs) {
                if (isInCidr(addr, cidr)) return true;
            }
        } catch (UnknownHostException e) {
            return false;
        }
        return false;
    }

    private boolean isInCidr(InetAddress addr, String cidr) {
        try {
            String[] parts = cidr.split("/");
            InetAddress network = InetAddress.getByName(parts[0]);
            int prefix = parts.length > 1 ? Integer.parseInt(parts[1]) : 32;
            byte[] addrBytes = addr.getAddress();
            byte[] networkBytes = network.getAddress();
            if (addrBytes.length != networkBytes.length) return false;
            int mask = prefix == 0 ? 0 : (0xFFFFFFFF << (32 - prefix));
            int addrInt = bytesToInt(addrBytes);
            int networkInt = bytesToInt(networkBytes);
            return (addrInt & mask) == (networkInt & mask);
        } catch (Exception e) {
            return false;
        }
    }

    private int bytesToInt(byte[] bytes) {
        int result = 0;
        for (byte b : bytes) result = (result << 8) | (b & 0xFF);
        return result;
    }
}
```

### Step 3: Update `LoginAttemptService.java`

Replace the vulnerable `getClientIP()` method body:

```java
@Service
@RequiredArgsConstructor
public class LoginAttemptService {

    private final TrustedProxyResolver proxyResolver;  // ADD injection

    // ... existing cache fields ...

    public String getClientIP(HttpServletRequest request) {
        return proxyResolver.resolveClientIp(request);  // REPLACE old logic
    }

    // isBlocked(), loginFailed(), loginSucceeded() methods unchanged
}
```

### Step 4: Unit tests

Create: `backend/src/test/java/com/nilachakra/security/TrustedProxyResolverTest.java`

```java
@ExtendWith(MockitoExtension.class)
class TrustedProxyResolverTest {

    @Mock AppProperties appProperties;
    @Mock AppProperties.SecurityProperties securityProps;
    @Mock HttpServletRequest request;

    TrustedProxyResolver resolver;

    @BeforeEach
    void setup() {
        when(appProperties.getSecurity()).thenReturn(securityProps);
        resolver = new TrustedProxyResolver(appProperties);
    }

    @Test
    void noTrustedProxies_alwaysUsesRemoteAddr() {
        when(securityProps.getTrustedProxyCidrs()).thenReturn(List.of());
        when(request.getRemoteAddr()).thenReturn("1.2.3.4");
        when(request.getHeader("X-Forwarded-For")).thenReturn("9.9.9.9");

        assertThat(resolver.resolveClientIp(request)).isEqualTo("1.2.3.4");
    }

    @Test
    void requestFromTrustedProxy_trustsXForwardedFor() {
        when(securityProps.getTrustedProxyCidrs()).thenReturn(List.of("10.0.0.0/8"));
        when(request.getRemoteAddr()).thenReturn("10.0.1.50");  // In trusted CIDR
        when(request.getHeader("X-Forwarded-For")).thenReturn("203.0.113.5");

        assertThat(resolver.resolveClientIp(request)).isEqualTo("203.0.113.5");
    }

    @Test
    void requestNotFromTrustedProxy_ignoresXForwardedFor() {
        when(securityProps.getTrustedProxyCidrs()).thenReturn(List.of("10.0.0.0/8"));
        when(request.getRemoteAddr()).thenReturn("1.2.3.4");  // NOT in trusted CIDR
        when(request.getHeader("X-Forwarded-For")).thenReturn("9.9.9.9");

        assertThat(resolver.resolveClientIp(request)).isEqualTo("1.2.3.4");
    }

    @Test
    void attackerSetsXForwardedFor_withNoTrustedProxies_isIgnored() {
        when(securityProps.getTrustedProxyCidrs()).thenReturn(List.of());
        when(request.getRemoteAddr()).thenReturn("6.6.6.6");  // attacker IP
        when(request.getHeader("X-Forwarded-For")).thenReturn("127.0.0.1");  // spoof loopback

        // Must use real IP, not spoofed
        assertThat(resolver.resolveClientIp(request)).isEqualTo("6.6.6.6");
    }
}
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/backend

./mvnw compile -q

./mvnw test -Dtest=TrustedProxyResolverTest -DfailIfNoTests=false

# Run all login/auth tests
./mvnw test -Dtest="*LoginAttempt*,*JWT*,*UserJWT*" -DfailIfNoTests=false

# Manual brute-force test (should be blocked after 10 attempts from same IP):
for i in $(seq 1 12); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8088/api/authenticate \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"admin\",\"password\":\"wrong$i\",\"rememberMe\":false}")
  echo "Attempt $i: HTTP $STATUS"
done
# Attempts 11+ should return 429 or 401 with lockout message

# Spoofing attempt (should NOT bypass):
for i in $(seq 1 12); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8088/api/authenticate \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: 10.0.0.$i" \
    -d "{\"username\":\"admin\",\"password\":\"wrong\",\"rememberMe\":false}")
  echo "Spoof attempt $i: HTTP $STATUS"
done
# All attempts should count against the REAL IP (localhost), not 10.0.0.x
```

---

## Acceptance Criteria

- [ ] `LoginAttemptService.getClientIP()` no longer reads `X-Forwarded-For` unless the request came from a CIDR in `TRUSTED_PROXY_CIDRS`
- [ ] Default config has empty `trusted-proxy-cidrs` (never trust the header)
- [ ] Unit tests pass for all 4 scenarios
- [ ] Setting `TRUSTED_PROXY_CIDRS=10.0.0.0/8` correctly enables XFF trust for requests from that range
- [ ] After 10 failed attempts from the same real IP, login is blocked even when X-Forwarded-For rotates
- [ ] `./mvnw compile` succeeds

---

## Deployment Notes

For production deployments behind a load balancer/reverse proxy:

```yaml
# docker-compose.yml backend environment
- TRUSTED_PROXY_CIDRS=10.0.0.0/8  # Replace with your internal LB CIDR
```

Document this in your runbook: without `TRUSTED_PROXY_CIDRS`, all `X-Forwarded-For` headers are ignored. This is the secure default.
