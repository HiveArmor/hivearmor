# S01-T04 — Add Rate Limiting to TFA Verify-Code Endpoint

**Sprint:** 1 (Security-Critical)  
**Severity:** CRITICAL  
**Issue ID:** SEC-NEW-02  
**Dependencies:** S01-T03 must be complete (TrustedProxyResolver must exist)  
**Estimated time:** 2 hours

---

## Context

`POST /api/tfa/verify-code` has no rate limiting. Once an attacker has a `PRE_VERIFICATION_USER` JWT (valid 5 minutes), they can enumerate all 1,000,000 possible 6-digit TOTP codes with no throttle. Combined with S01-T03 (which now correctly tracks real IPs), this fix adds the same rate limiting gate to the TFA step.

**Vulnerable file:**
`backend/src/main/java/com/nilachakra/web/rest/tfa/TfaResource.java`

**Vulnerable code (~line 148):**
```java
@PostMapping("/tfa/verify-code")
public ResponseEntity<JWTToken> verifyCode(HttpServletRequest request, @RequestBody String code) {
    // NO call to loginAttemptService.isBlocked() here
    String username = SecurityUtils.getCurrentUserLogin().orElseThrow(...);
    // ... verifies code directly
}
```

---

## What to Read First

1. `backend/src/main/java/com/nilachakra/web/rest/tfa/TfaResource.java` — entire file
2. `backend/src/main/java/com/nilachakra/service/login_attempts/LoginAttemptService.java` — understand `isBlocked()`, `loginFailed()`, `loginSucceeded()`
3. `backend/src/main/java/com/nilachakra/web/rest/UserJWTController.java` — see how login uses the same service as a pattern to follow

---

## Implementation Steps

### Step 1: Inject `LoginAttemptService` and `HttpServletRequest` into `TfaResource`

`TfaResource` already has `@Autowired` or constructor injection. Add:

```java
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor  // if using constructor injection
public class TfaResource {

    private final LoginAttemptService loginAttemptService;  // ADD
    // ... existing dependencies
}
```

### Step 2: Add rate-limit check at the start of `verifyCode()`

The TFA verification endpoint must:
1. Check if the current IP is blocked before attempting verification
2. Record a failure on bad code
3. Reset the counter on success

```java
@PostMapping("/tfa/verify-code")
public ResponseEntity<JWTToken> verifyCode(HttpServletRequest request, @RequestBody String code) {
    
    // --- ADD: Rate limit check ---
    if (loginAttemptService.isBlocked(request)) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
            .header("Retry-After", "600")
            .build();
    }
    // --- END add ---

    String username = SecurityUtils.getCurrentUserLogin()
        .orElseThrow(() -> new AccessDeniedException("No authenticated user"));

    try {
        TfaVerifyResponseDto tfaResponse = tfaService.verifyCode(username, code);
        
        if (!tfaResponse.isValid()) {
            // --- ADD: Record failure ---
            loginAttemptService.loginFailed(request);
            // --- END add ---
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        
        // --- ADD: Reset counter on success ---
        loginAttemptService.loginSucceeded(request);
        // --- END add ---
        
        // ... existing: generate final JWT and return
        String jwt = tokenProvider.createToken(authentication, rememberMe);
        return ResponseEntity.ok(new JWTToken(jwt));
        
    } catch (TfaVerificationException e) {
        // --- ADD: Record failure on exception too ---
        loginAttemptService.loginFailed(request);
        // --- END add ---
        // Return generic error — do NOT propagate exception message to client (SEC-NEW-13)
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
    }
}
```

### Step 3: Fix TFA error message leakage (SEC-NEW-13 — while in this file)

The existing exception handler reveals the username. Change the catch block to log server-side only:

```java
} catch (TfaVerificationException e) {
    loginAttemptService.loginFailed(request);
    log.warn("TFA verification failed for user: {}", 
        SecurityUtils.getCurrentUserLogin().orElse("unknown"));
    // Do NOT include e.getMessage() in the response
    return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Invalid TFA code");
}
```

### Step 4: Unit test

Create: `backend/src/test/java/com/nilachakra/web/rest/tfa/TfaResourceRateLimitTest.java`

```java
@WebMvcTest(TfaResource.class)
@AutoConfigureMockMvc(addFilters = false)
class TfaResourceRateLimitTest {

    @Autowired MockMvc mvc;
    @MockBean TfaService tfaService;
    @MockBean LoginAttemptService loginAttemptService;
    @MockBean TokenProvider tokenProvider;

    @Test
    @WithMockUser(authorities = "ROLE_PRE_VERIFICATION_USER")
    void whenIpIsBlocked_returns429() throws Exception {
        when(loginAttemptService.isBlocked(any(HttpServletRequest.class))).thenReturn(true);

        mvc.perform(post("/api/tfa/verify-code")
                .contentType(MediaType.APPLICATION_JSON)
                .content("\"123456\""))
            .andExpect(status().isTooManyRequests());
        
        verify(tfaService, never()).verifyCode(any(), any());
    }

    @Test
    @WithMockUser(authorities = "ROLE_PRE_VERIFICATION_USER")
    void whenCodeIsInvalid_incrementsFailureCounter() throws Exception {
        when(loginAttemptService.isBlocked(any())).thenReturn(false);
        when(tfaService.verifyCode(any(), eq("000000")))
            .thenReturn(TfaVerifyResponseDto.invalid());

        mvc.perform(post("/api/tfa/verify-code")
                .contentType(MediaType.APPLICATION_JSON)
                .content("\"000000\""))
            .andExpect(status().isUnauthorized());

        verify(loginAttemptService).loginFailed(any(HttpServletRequest.class));
    }

    @Test
    @WithMockUser(authorities = "ROLE_PRE_VERIFICATION_USER")
    void whenCodeIsValid_resetsFailureCounter() throws Exception {
        when(loginAttemptService.isBlocked(any())).thenReturn(false);
        when(tfaService.verifyCode(any(), eq("123456")))
            .thenReturn(TfaVerifyResponseDto.valid());
        when(tokenProvider.createToken(any(), anyBoolean())).thenReturn("valid.jwt.token");

        mvc.perform(post("/api/tfa/verify-code")
                .contentType(MediaType.APPLICATION_JSON)
                .content("\"123456\""))
            .andExpect(status().isOk());

        verify(loginAttemptService).loginSucceeded(any(HttpServletRequest.class));
    }
}
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/backend

./mvnw compile -q

./mvnw test -Dtest=TfaResourceRateLimitTest -DfailIfNoTests=false

./mvnw test -Dtest="*Tfa*" -DfailIfNoTests=false

# Manual test with running backend:
# Step 1: Get PRE_VERIFICATION_USER JWT (first step of login)
PRE_JWT=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' | jq -r '.id_token')

# Step 2: Attempt TFA brute-force — should be blocked after 10 wrong codes
for i in $(seq 1 12); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST http://localhost:8088/api/tfa/verify-code \
    -H "Authorization: Bearer $PRE_JWT" \
    -H "Content-Type: application/json" \
    -d '"000000"')
  echo "Attempt $i: HTTP $STATUS"
done
# Attempts 11+ should return 429
```

---

## Acceptance Criteria

- [ ] `POST /api/tfa/verify-code` checks `loginAttemptService.isBlocked()` before any verification
- [ ] Returns HTTP 429 with `Retry-After: 600` when IP is blocked
- [ ] Calls `loginAttemptService.loginFailed()` on invalid code or exception
- [ ] Calls `loginAttemptService.loginSucceeded()` on valid code
- [ ] TFA error response does NOT include username or internal exception message
- [ ] All 3 unit test cases pass
- [ ] `./mvnw compile` succeeds
